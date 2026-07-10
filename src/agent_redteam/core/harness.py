"""Execution harness: runs samples against a target with retry + resume support."""
from __future__ import annotations
import json, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable
from urllib.error import HTTPError
from .result import SampleResult, Verdict


def load_jsonl(path: str) -> list[dict]:
    """Load a JSONL file into a list of dicts."""
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def send_message(
    target,
    messages: list[dict],
    max_attempts: int = 3,
    *,
    retries: int | None = None,
) -> str:
    """Send with bounded retries, failing fast on permanent HTTP errors."""
    if retries is not None:
        max_attempts = retries
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")
    for attempt in range(max_attempts):
        try:
            return target.send(messages)
        except Exception as exc:
            if attempt < max_attempts - 1 and _is_retryable(exc):
                time.sleep(_retry_delay(exc, attempt))
            else:
                raise
    return ""


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, HTTPError):
        return exc.code in {408, 409, 425, 429} or 500 <= exc.code <= 599
    return True


def _retry_delay(exc: Exception, attempt: int) -> float:
    delay = float(2 * (attempt + 1))
    if isinstance(exc, HTTPError) and exc.headers:
        try:
            delay = max(delay, float(exc.headers.get("Retry-After", "")))
        except (TypeError, ValueError):
            pass
    return min(delay, 30.0)


def _safe_error(exc: Exception) -> str:
    if isinstance(exc, HTTPError):
        return f"HTTP {exc.code} {exc.reason}"[:200]
    return str(exc)[:200]


class Harness:
    """Runs a suite's samples against a target.

    Args:
        target: An object with .send(messages) -> str
        samples: List of sample dicts from the suite's data.jsonl
        build_messages: sample -> list[dict] (the prompt to send)
        check: A Check object with .evaluate(response, sample) -> Verdict
        max_workers: Parallel API calls (default 4)
        max_attempts: Maximum total attempts per model call (default 3)
        on_result: Optional callback(sample_result) for real-time updates
    """

    def __init__(
        self,
        target,
        samples: list[dict],
        build_messages: Callable,
        check,
        max_workers: int = 4,
        on_result: Callable | None = None,
        max_attempts: int = 3,
    ):
        self.target = target
        self.samples = samples
        self.build_messages = build_messages
        self.check = check
        self.max_workers = max_workers
        self.max_attempts = max_attempts
        self.on_result = on_result

    def run_single(self, sample: dict) -> SampleResult:
        """Run a single sample and return its result."""
        suite = sample.get("_suite", "unknown")
        sid = sample.get("id", "?")
        try:
            messages = self.build_messages(sample)
            response = send_message(self.target, messages, self.max_attempts)
            verdict = self.check.evaluate(response, sample)
        except Exception as e:
            response = ""
            verdict = Verdict.ERROR
            error_msg = _safe_error(e)
        else:
            error_msg = ""

        return SampleResult(
            suite=suite,
            sample_id=sid,
            category=sample.get("category", ""),
            difficulty=sample.get("difficulty", ""),
            question=self._extract_question(sample),
            expected=self.check.describe_expected(sample),
            response=response,
            verdict=verdict,
            severity=sample.get("severity", "medium"),
            owasp=sample.get("owasp", ""),
            tags=sample.get("tags", []),
            error=error_msg,
        )

    def run(self) -> list[SampleResult]:
        """Run all samples, optionally in parallel. Calls on_result per sample."""
        results: list[SampleResult] = []
        if self.max_workers <= 1:
            for s in self.samples:
                r = self.run_single(s)
                results.append(r)
                if self.on_result:
                    self.on_result(r)
        else:
            with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
                future_map = {
                    pool.submit(self.run_single, s): s for s in self.samples
                }
                for future in as_completed(future_map):
                    r = future.result()
                    results.append(r)
                    if self.on_result:
                        self.on_result(r)
        # Sort by original sample order
        id_order = {s.get("id", ""): i for i, s in enumerate(self.samples)}
        results.sort(key=lambda r: id_order.get(r.sample_id, 0))
        return results

    @staticmethod
    def _extract_question(sample: dict) -> str:
        """Extract the human-readable attack payload from a sample."""
        for key in ("question", "query", "context", "text"):
            val = sample.get(key, "")
            if val:
                return val if isinstance(val, str) else json.dumps(val, ensure_ascii=False)
        return ""
