"""Main orchestration engine: runs suites against a target and produces a report."""
from __future__ import annotations
import datetime
from .result import ScanReport, SuiteResult, SampleResult, Verdict
from .harness import Harness, load_jsonl


class Engine:
    """The red team engine. Register suites, then scan.

    Usage:
        from agent_redteam import Engine, OpenAITarget
        target = OpenAITarget(model="gpt-4o", api_key="sk-...")
        engine = Engine(target)
        report = engine.scan(suites=["injection", "info_leak"])
        print(report.summary())
    """

    def __init__(self, target, max_workers: int = 4):
        self.target = target
        self.max_workers = max_workers
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
            target_model=getattr(self.target, "model", "unknown"),
            started_at=datetime.datetime.now().isoformat(timespec="seconds"),
        )

        # Checkpoint support
        from .checkpoint import Checkpoint, make_scan_id
        scan_id = make_scan_id(report.target_model, suite_names)
        cp = Checkpoint(scan_id)
        done_ids = cp.done_ids()

        for name in suite_names:
            suite = self._suites.get(name)
            if suite is None:
                continue
            samples = suite.load_samples()
            # Apply per-suite limit (for debugging/testing)
            limit = getattr(suite, "_limit", 0)
            if limit and limit > 0:
                samples = samples[:limit]
            sr = SuiteResult(name=name)

            # Multi-turn suites use MultiTurnHarness (sequential, conversational)
            if getattr(suite, "is_multiturn", False):
                from .multiturn import MultiTurnHarness
                mt_harness = MultiTurnHarness(
                    target=self.target,
                    scenarios=samples,
                    check=suite.check,
                    on_result=on_result,
                )
                results = mt_harness.run()
                for r in results:
                    sr.add(r)
                report.suites.append(sr)
                continue

            # Standard single-turn path (below)

            # Wrap on_result to also save to checkpoint
            def cp_callback(r: SampleResult, _orig=on_result):
                cp.save(r)
                if _orig:
                    _orig(r)

            for s in samples:
                s["_suite"] = name

            # Restore results from checkpoint for already-done samples
            for s in samples:
                sid = s.get("id", "")
                if sid in done_ids:
                    cached = cp._cache.get(sid)
                    if cached:
                        verdict = Verdict(cached.get("verdict", "error"))
                        r = SampleResult(
                            suite=name, sample_id=sid,
                            category=s.get("category", ""),
                            difficulty=s.get("difficulty", ""),
                            question=s.get("question", s.get("context", s.get("text", ""))),
                            expected=cached.get("expected", ""),
                            response=cached.get("response", ""),
                            verdict=verdict,
                            severity=s.get("severity", cached.get("severity", "medium")),
                            owasp=s.get("owasp", cached.get("owasp", "")),
                            tags=s.get("tags", cached.get("tags", [])),
                        )
                        sr.add(r)
                        if on_result:
                            on_result(r)
                        continue

            # Filter out done samples for actual execution
            todo = [s for s in samples if s.get("id", "") not in done_ids]
            for s in todo:
                s["_suite"] = name

            harness = Harness(
                target=self.target,
                samples=todo,
                build_messages=suite.build_messages,
                check=suite.check,
                max_workers=self.max_workers,
                on_result=cp_callback if todo else None,
            )
            results = harness.run()
            for r in results:
                sr.add(r)
            report.suites.append(sr)

        report.finished_at = datetime.datetime.now().isoformat(timespec="seconds")
        cp.complete()  # Archive checkpoint on successful completion
        return report

    def _register_builtin_suites(self) -> None:
        """Auto-register all built-in suites from ALL_SUITES."""
        from ..suites import ALL_SUITES
        for SuiteClass in ALL_SUITES:
            try:
                suite = SuiteClass()
                self._suites[suite.name] = suite
            except Exception:
                pass
