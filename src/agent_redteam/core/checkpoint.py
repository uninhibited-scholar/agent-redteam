"""Checkpoint/resume support for large scans.

Stores per-sample results to a private JSONL file as they complete. Only
judged PASS/FAIL results are reusable; transient ERROR results are retried.
"""
from __future__ import annotations
import hashlib
import json
import os
from typing import Any
from .result import SampleResult, Verdict


def _checkpoint_dir() -> str:
    d = os.path.expanduser("~/.agent-redteam/checkpoints")
    os.makedirs(d, exist_ok=True)
    return d


def checkpoint_path(scan_id: str) -> str:
    """Return the checkpoint file path for a given scan ID."""
    safe_id = "".join(c for c in scan_id if c.isalnum() or c in "-_")
    return os.path.join(_checkpoint_dir(), f"{safe_id}.jsonl")


def scan_fingerprint(
    prepared_suites: list[tuple[str, list[dict[str, Any]]]],
    suite_signatures: dict[str, str] | None = None,
) -> str:
    """Fingerprint the exact suite/sample content selected for a scan."""
    payload = [
        {
            "suite": name,
            "implementation": (suite_signatures or {}).get(name, ""),
            "samples": samples,
        }
        for name, samples in prepared_suites
    ]
    encoded = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:16]


def make_scan_id(
    model: str,
    suites: list[str] | None = None,
    *,
    fingerprint: str = "",
    target: str = "",
) -> str:
    """Generate a stable, scope-aware scan ID for checkpointing."""
    s = "_".join(sorted(suites)) if suites else "all"
    model_name = str(model)
    scope = "_".join(str(part) for part in (target, model_name, s, fingerprint) if part)
    digest = hashlib.sha256(scope.encode("utf-8")).hexdigest()[:12]
    return f"scan_{digest}"


class Checkpoint:
    """Manages checkpoint save/load for a scan.

    Usage:
        cp = Checkpoint("glm-4-plus_injection_info_leak")
        done = cp.completed_keys()  # set of (suite, sample ID) keys
        # ... run scan, skipping judged PASS/FAIL results ...
        cp.save(result)  # save each result as it completes
        cp.complete()  # mark scan as finished, archive checkpoint
    """

    def __init__(self, scan_id: str):
        self.scan_id = scan_id
        self.path = checkpoint_path(scan_id)
        self._cache: dict[tuple[str, str], dict] = {}
        self._load()

    @staticmethod
    def key(suite: str, sample_id: str) -> tuple[str, str]:
        return suite, sample_id

    def _load(self):
        """Load existing checkpoint into cache."""
        if os.path.exists(self.path):
            try:
                os.chmod(self.path, 0o600)
            except OSError:
                pass
            with open(self.path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            obj = json.loads(line)
                            key = self.key(obj.get("suite", ""), obj["sample_id"])
                            self._cache[key] = obj
                        except (json.JSONDecodeError, KeyError):
                            pass

    def completed_keys(self) -> set[tuple[str, str]]:
        """Return judged results that are safe to reuse on resume."""
        reusable = {Verdict.PASS.value, Verdict.FAIL.value}
        return {
            key for key, obj in self._cache.items()
            if obj.get("verdict") in reusable
        }

    def done_ids(self) -> set[str]:
        """Return completed IDs for backward-compatible callers.

        Engine uses :meth:`completed_keys` so duplicate IDs across suites do
        not collide.
        """
        return {sample_id for _, sample_id in self.completed_keys()}

    def get(self, suite: str, sample_id: str) -> dict | None:
        """Return the latest cached result for a suite/sample pair."""
        return self._cache.get(self.key(suite, sample_id))

    def save(self, result: SampleResult):
        """Save a single result to the checkpoint."""
        obj = result.to_dict()
        self._cache[self.key(result.suite, result.sample_id)] = obj
        fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")

    def complete(self):
        """Mark the scan as complete — archive the checkpoint."""
        if os.path.exists(self.path):
            archive_path = self.path + ".done"
            os.replace(self.path, archive_path)

    def clear(self):
        """Delete the checkpoint file."""
        if os.path.exists(self.path):
            os.remove(self.path)
        self._cache.clear()
