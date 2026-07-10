"""Main orchestration engine: runs suites against a target and produces a report."""
from __future__ import annotations
import datetime
import hashlib
import inspect
import json
from .result import ScanReport, SuiteResult, SampleResult, Verdict
from .harness import Harness


class Engine:
    """The red team engine. Register suites, then scan.

    Usage:
        from agent_redteam import Engine, OpenAITarget
        target = OpenAITarget(model="gpt-4o", api_key="sk-...")
        engine = Engine(target)
        report = engine.scan(suites=["injection", "info_leak"])
        print(report.summary())
    """

    def __init__(self, target, max_workers: int = 4, max_attempts: int = 3):
        if not 1 <= max_attempts <= 10:
            raise ValueError("max_attempts must be between 1 and 10")
        self.target = target
        self.max_workers = max_workers
        self.max_attempts = max_attempts
        self._suites: dict[str, object] = {}
        self._register_builtin_suites()

    def register_suite(self, suite) -> None:
        """Register a custom suite (must have name, load_samples(), build_messages(), check)."""
        self._suites[suite.name] = suite

    def list_suites(self) -> list[str]:
        return sorted(self._suites.keys())

    def scan(
        self,
        suites: list[str] | None = None,
        on_result=None,
    ) -> ScanReport:
        """Run the scan. Returns a ScanReport.

        Args:
            suites: Optional list of suite names to run (default: all)
            on_result: Optional callback(SampleResult) for real-time updates
        """
        suite_names = suites or list(self._suites.keys())
        report = ScanReport(
            target_model=str(getattr(self.target, "model", "unknown")),
            started_at=datetime.datetime.now().isoformat(timespec="seconds"),
        )

        # Resolve the exact scope before opening a checkpoint. The content
        # fingerprint prevents stale results from surviving catalog or limit changes.
        prepared: list[tuple[str, object, list[dict]]] = []
        for name in suite_names:
            suite = self._suites.get(name)
            if suite is None:
                continue
            samples = suite.load_samples()
            limit = getattr(suite, "_limit", 0)
            if limit and limit > 0:
                samples = samples[:limit]
            for sample in samples:
                sample["_suite"] = name
            prepared.append((name, suite, samples))

        from .checkpoint import Checkpoint, make_scan_id, scan_fingerprint
        fingerprint = scan_fingerprint(
            [(name, samples) for name, _, samples in prepared],
            {name: self._suite_signature(suite) for name, suite, _ in prepared},
        )
        scan_id = make_scan_id(
            report.target_model,
            [name for name, _, _ in prepared],
            fingerprint=fingerprint,
            target=self._target_scope(),
        )
        cp = Checkpoint(scan_id)
        completed = cp.completed_keys()

        def cp_callback(r: SampleResult, _orig=on_result):
            cp.save(r)
            if _orig:
                _orig(r)

        for name, suite, samples in prepared:
            sr = SuiteResult(name=name)

            # Multi-turn suites use MultiTurnHarness (sequential, conversational)
            if getattr(suite, "is_multiturn", False):
                from .multiturn import MultiTurnHarness
                todo = []
                for sample in samples:
                    sid = sample.get("id", "")
                    cached = cp.get(name, sid)
                    if (name, sid) in completed and cached:
                        restored = self._restore_result(name, sample, cached)
                        sr.add(restored)
                        if on_result:
                            on_result(restored)
                    else:
                        todo.append(sample)
                mt_harness = MultiTurnHarness(
                    target=self.target,
                    scenarios=todo,
                    check=suite.check,
                    on_result=cp_callback if todo else None,
                    max_attempts=self.max_attempts,
                )
                results = mt_harness.run()
                for r in results:
                    sr.add(r)
                report.suites.append(sr)
                continue

            # Restore results from checkpoint for already-done samples
            for s in samples:
                sid = s.get("id", "")
                cached = cp.get(name, sid)
                if (name, sid) in completed and cached:
                    restored = self._restore_result(name, s, cached)
                    sr.add(restored)
                    if on_result:
                        on_result(restored)

            # Filter out done samples for actual execution
            todo = [
                s for s in samples
                if (name, s.get("id", "")) not in completed
            ]

            harness = Harness(
                target=self.target,
                samples=todo,
                build_messages=suite.build_messages,
                check=suite.check,
                max_workers=self.max_workers,
                max_attempts=self.max_attempts,
                on_result=cp_callback if todo else None,
            )
            results = harness.run()
            for r in results:
                sr.add(r)
            report.suites.append(sr)

        report.finished_at = datetime.datetime.now().isoformat(timespec="seconds")
        if not any(s.errors for s in report.suites):
            cp.complete()
        return report

    @staticmethod
    def _restore_result(name: str, sample: dict, cached: dict) -> SampleResult:
        """Rehydrate a judged checkpoint result using current sample metadata."""
        question = Harness._extract_question(sample)
        return SampleResult(
            suite=name,
            sample_id=sample.get("id", ""),
            category=sample.get("category", cached.get("category", "")),
            difficulty=sample.get("difficulty", cached.get("difficulty", "")),
            question=question,
            expected=cached.get("expected", ""),
            response=cached.get("response", ""),
            verdict=Verdict(cached.get("verdict", "error")),
            severity=sample.get("severity", cached.get("severity", "medium")),
            owasp=sample.get("owasp", cached.get("owasp", "")),
            tags=sample.get("tags", cached.get("tags", [])),
            error=cached.get("error", ""),
        )

    def _target_scope(self) -> str:
        """Describe result-affecting target settings without including secrets."""
        target_type = f"{type(self.target).__module__}.{type(self.target).__qualname__}"
        settings = {"type": target_type}
        for name in ("base_url", "endpoint", "deployment", "max_tokens"):
            value = getattr(self.target, name, None)
            if value not in (None, ""):
                settings[name] = str(value)
        return json.dumps(settings, sort_keys=True, separators=(",", ":"))

    @staticmethod
    def _suite_signature(suite: object) -> str:
        """Hash suite and check implementations so changed verdict logic is isolated."""
        check = getattr(suite, "check", None)
        parts = []
        for cls in (type(suite), type(check)):
            identity = f"{cls.__module__}.{cls.__qualname__}"
            try:
                source = inspect.getsource(cls)
            except (OSError, TypeError):
                source = ""
            parts.append(f"{identity}\n{source}")
        return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()[:16]

    def _register_builtin_suites(self) -> None:
        """Auto-register all built-in suites from ALL_SUITES."""
        from ..suites import ALL_SUITES
        for SuiteClass in ALL_SUITES:
            try:
                suite = SuiteClass()
                self._suites[suite.name] = suite
            except Exception:
                pass
