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
            for s in samples:
                s["_suite"] = name

            harness = Harness(
                target=self.target,
                samples=samples,
                build_messages=suite.build_messages,
                check=suite.check,
                max_workers=self.max_workers,
                on_result=on_result,
            )
            results = harness.run()
            for r in results:
                sr.add(r)
            report.suites.append(sr)

        report.finished_at = datetime.datetime.now().isoformat(timespec="seconds")
        return report

    def _register_builtin_suites(self) -> None:
        """Auto-register the four built-in suites."""
        try:
            from ..suites.injection import InjectionSuite
            self._suites["injection"] = InjectionSuite()
        except Exception:
            pass
        try:
            from ..suites.tool_abuse import ToolAbuseSuite
            self._suites["tool_abuse"] = ToolAbuseSuite()
        except Exception:
            pass
        try:
            from ..suites.over_refusal import OverRefusalSuite
            self._suites["over_refusal"] = OverRefusalSuite()
        except Exception:
            pass
        try:
            from ..suites.info_leak import InfoLeakSuite
            self._suites["info_leak"] = InfoLeakSuite()
        except Exception:
            pass
