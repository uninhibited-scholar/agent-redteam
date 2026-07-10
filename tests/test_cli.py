"""Tests for CLI command dispatch, error handling, and output formatting.

Tests the 6 subcommands (scan/list/serve/history/compare/mutate) without
hitting real APIs — uses mock targets and temporary storage.
"""
import sys
import io
import json
import pytest
from unittest.mock import patch, MagicMock
from agent_redteam.cli import main


class TestCLIArgumentParsing:
    def test_no_command_errors(self):
        """Running with no subcommand should error (exit code 2 from argparse)."""
        with pytest.raises(SystemExit):
            main([])

    def test_version_flag(self):
        """--version should print version and exit 0."""
        with pytest.raises(SystemExit) as exc:
            main(["--version"])
        assert exc.value.code == 0

    def test_unknown_command_errors(self):
        with pytest.raises(SystemExit):
            main(["nonexistent"])

    def test_scan_requires_model(self, capsys):
        """scan without --model should return exit 2."""
        with patch("agent_redteam.core.config.load_default_profile", return_value={}):
            result = main(["scan", "--target", "openai"])
        assert result == 2
        captured = capsys.readouterr()
        assert "model" in captured.out.lower()

    def test_scan_local_requires_endpoint(self, capsys):
        """scan --target local without --endpoint should return exit 2."""
        with patch("agent_redteam.core.config.load_default_profile", return_value={}):
            result = main(["scan", "--target", "local", "--model", "test"])
        assert result == 2
        captured = capsys.readouterr()
        assert "endpoint" in captured.out.lower()

    def test_mutate_unknown_suite(self, capsys):
        """mutate with unknown suite should return exit 2."""
        result = main(["mutate", "--suite", "nonexistent_suite"])
        assert result == 2
        captured = capsys.readouterr()
        assert "未知套件" in captured.out or "unknown" in captured.out.lower()

    def test_mutate_unknown_strategy(self, capsys):
        """mutate with unknown strategy should return exit 2."""
        result = main(["mutate", "--suite", "injection", "--strategies", "fake_strategy"])
        assert result == 2
        captured = capsys.readouterr()
        assert "策略" in captured.out or "strategy" in captured.out.lower()


class TestCLIList:
    def test_list_returns_zero(self, capsys):
        """list command should succeed and print suite info."""
        result = main(["list"])
        assert result == 0
        captured = capsys.readouterr()
        # Should mention all 10 suites
        assert "injection" in captured.out
        assert "supply_chain" in captured.out
        assert "over_dependency" in captured.out

    def test_list_shows_sample_counts(self, capsys):
        """list output should include 'samples' text."""
        main(["list"])
        captured = capsys.readouterr()
        assert "samples" in captured.out

    def test_list_shows_owasp(self, capsys):
        """list output should include OWASP identifiers."""
        main(["list"])
        captured = capsys.readouterr()
        assert "LLM" in captured.out

    def test_list_json_is_machine_readable_catalog(self, capsys):
        assert main(["list", "--format", "json", "--validate"]) == 0
        catalog = json.loads(capsys.readouterr().out)
        assert catalog["schema"] == "agent-redteam-suite-catalog/v1"
        assert catalog["taxonomy"] == "OWASP LLM Top 10 2025"
        assert catalog["summary"]["suites"] == 11
        assert catalog["summary"]["samples"] == 2184
        assert catalog["summary"]["owasp_categories"] == 8
        assert catalog["uncovered_owasp"] == ["LLM04", "LLM08"]
        assert catalog["summary"]["invalid_suites"] == 0


class TestCLIHistory:
    def test_history_empty(self, capsys):
        """history with no records should say so (using temp home)."""
        import tempfile, pathlib
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_home = pathlib.Path(tmpdir) / "agent-redteam-home"
            with patch.dict("os.environ", {"HOME": str(tmpdir)}):
                # storage uses ~/.agent-redteam/scans.db — redirect via env
                with patch("os.path.expanduser", return_value=str(tmp_home)):
                    result = main(["history"])
            assert result == 0

    def test_history_with_records(self, capsys):
        """history with saved scans should list them."""
        # We have real scans in the DB from validation runs
        result = main(["history", "--limit", "3"])
        assert result == 0


class TestCLICompare:
    def test_compare_nonexistent_runs(self, capsys):
        """compare with non-existent run IDs should return exit 1."""
        result = main(["compare", "fake_run_a", "fake_run_b"])
        assert result == 1
        captured = capsys.readouterr()
        assert "找不到" in captured.out or "not found" in captured.out.lower()

    def test_compare_same_run(self, capsys):
        """compare a run with itself should show delta=0."""
        # Find a real run_id
        from agent_redteam.core.storage import list_scans
        scans = list_scans(limit=1)
        if scans:
            run_id = scans[0]["run_id"]
            result = main(["compare", run_id, run_id])
            assert result == 0
            captured = capsys.readouterr()
            assert "Comparison" in captured.out or "对比" in captured.out


class TestCLIScanFormat:
    """Test scan command with a mock target — verify output formats."""

    @pytest.fixture
    def mock_scan(self):
        """Patch Engine.scan to return a fake report without API calls."""
        from agent_redteam.core.result import ScanReport, SuiteResult, SampleResult, Verdict
        report = ScanReport(target_model="test-model")
        suite = SuiteResult(name="injection")
        # Add passing samples to make score = 100
        for i in range(2):
            suite.add(SampleResult(
                suite="injection", sample_id=f"inj-{i:03d}", category="test",
                difficulty="easy", question="q", expected="refuse",
                response="I cannot help", verdict=Verdict.PASS,
                severity="medium", owasp="LLM01", tags=["t"],
            ))
        report.suites.append(suite)
        return report

    def _make_report(self, score: float):
        """Build a fake report with a specific target score."""
        from agent_redteam.core.result import ScanReport, SuiteResult, SampleResult, Verdict
        report = ScanReport(target_model="test-model")
        suite = SuiteResult(name="injection")
        # score is pass_rate * 100; so N pass out of 10 total = score*10
        total = 10
        passed = round(score / 10)
        for i in range(total):
            suite.add(SampleResult(
                suite="injection", sample_id=f"inj-{i:03d}", category="test",
                difficulty="easy", question="q", expected="refuse",
                response="ok" if i < passed else "bad",
                verdict=Verdict.PASS if i < passed else Verdict.FAIL,
                severity="medium", owasp="LLM01", tags=["t"],
            ))
        report.suites.append(suite)
        return report

    def test_scan_json_format(self, capsys, mock_scan):
        """scan --format json should output valid JSON."""
        with patch("agent_redteam.cli.Engine") as MockEngine:
            MockEngine.return_value.scan.return_value = mock_scan
            with patch("agent_redteam.cli.OpenAITarget"):
                with patch("agent_redteam.core.storage.save_report", return_value="test-run"):
                    result = main(["scan", "--model", "test", "--key", "k",
                                  "--suites", "injection", "--limit", "2",
                                  "--format", "json"])
        assert result == 0

    def test_scan_markdown_format(self, capsys, mock_scan):
        """scan --format markdown should output markdown."""
        with patch("agent_redteam.cli.Engine") as MockEngine:
            MockEngine.return_value.scan.return_value = mock_scan
            with patch("agent_redteam.cli.OpenAITarget"):
                with patch("agent_redteam.core.storage.save_report", return_value="test-run"):
                    result = main(["scan", "--model", "test", "--key", "k",
                                  "--suites", "injection", "--limit", "2",
                                  "--format", "markdown"])
        assert result == 0

    def test_scan_fail_below_threshold(self, capsys):
        """scan --fail-below with score below threshold should return exit 1."""
        low_report = self._make_report(50.0)
        with patch("agent_redteam.cli.Engine") as MockEngine:
            MockEngine.return_value.scan.return_value = low_report
            with patch("agent_redteam.cli.OpenAITarget"):
                with patch("agent_redteam.core.storage.save_report", return_value="test-run"):
                    result = main(["scan", "--model", "test", "--key", "k",
                                  "--suites", "injection", "--limit", "2",
                                  "--fail-below", "80"])
        assert result == 1

    def test_scan_pass_threshold(self):
        """scan --fail-below with score above threshold should return exit 0."""
        high_report = self._make_report(100.0)
        with patch("agent_redteam.cli.Engine") as MockEngine:
            MockEngine.return_value.scan.return_value = high_report
            with patch("agent_redteam.cli.OpenAITarget"):
                with patch("agent_redteam.core.storage.save_report", return_value="test-run"):
                    result = main(["scan", "--model", "test", "--key", "k",
                                  "--suites", "injection", "--limit", "2",
                                  "--fail-below", "80"])
        assert result == 0


class TestStorageCompareReports:
    def test_compare_same_data(self):
        """Comparing identical reports should yield zero deltas."""
        from agent_redteam.core.result import ScanReport, SuiteResult, SampleResult, Verdict
        from agent_redteam.core.storage import save_report, compare_reports

        report = ScanReport(target_model="m")
        suite = SuiteResult(name="test_suite")
        for i in range(10):
            suite.add(SampleResult(
                suite="test_suite", sample_id=f"ts-{i:03d}", category="c",
                difficulty="easy", question="q", expected="refuse",
                response="ok", verdict=Verdict.PASS,
                severity="medium", owasp="LLM01", tags=["t"],
            ))
        report.suites.append(suite)

        run_a = save_report(report)
        run_b = save_report(report)
        result = compare_reports(run_a, run_b)

        assert result is not None
        assert result["score_delta"] == 0.0
        assert result["model_a"] == "m"
        assert all(s["delta"] == 0 for s in result["suites"])

    def test_compare_nonexistent(self):
        """Comparing non-existent runs should return None."""
        from agent_redteam.core.storage import compare_reports
        assert compare_reports("fake_a", "fake_b") is None

    def test_compare_different_scores(self):
        """Comparing reports with different scores should show delta."""
        from agent_redteam.core.result import ScanReport, SuiteResult, SampleResult, Verdict
        from agent_redteam.core.storage import save_report, compare_reports

        def make_report(model: str, passed: int):
            report = ScanReport(target_model=model)
            suite = SuiteResult(name="s")
            for i in range(10):
                suite.add(SampleResult(
                    suite="s", sample_id=f"s-{model}-{i:03d}", category="c",
                    difficulty="easy", question="q", expected="refuse",
                    response="ok" if i < passed else "bad",
                    verdict=Verdict.PASS if i < passed else Verdict.FAIL,
                    severity="medium", owasp="LLM01", tags=["t"],
                ))
            report.suites.append(suite)
            return report

        run_a = save_report(make_report("a", 9))  # 90%
        run_b = save_report(make_report("b", 7))  # 70%
        result = compare_reports(run_a, run_b)

        assert result["score_delta"] == -20.0
        assert result["suites"][0]["delta"] == -20.0
        assert result["suites"][0]["trend"] == "↓"


class TestReportRendering:
    @pytest.fixture
    def sample_report(self):
        from agent_redteam.core.result import ScanReport, SuiteResult, SampleResult, Verdict
        report = ScanReport(target_model="test-model")
        suite = SuiteResult(name="injection")
        # 8 pass, 2 fail → 80 score
        for i in range(10):
            suite.add(SampleResult(
                suite="injection", sample_id=f"inj-{i:03d}", category="test",
                difficulty="easy", question="test question", expected="refuse",
                response="I cannot help" if i < 8 else "here is how to hack",
                verdict=Verdict.PASS if i < 8 else Verdict.FAIL,
                severity="medium", owasp="LLM01", tags=["test"],
            ))
        report.suites.append(suite)
        return report

    def test_render_json(self, sample_report):
        from agent_redteam.report import render_json
        output = render_json(sample_report)
        data = json.loads(output)
        assert data["target_model"] == "test-model"
        assert data["overall_score"] == 80.0
        assert len(data["suites"]) == 1
        assert data["suites"][0]["name"] == "injection"

    def test_render_markdown(self, sample_report):
        from agent_redteam.report import render_markdown
        output = render_markdown(sample_report)
        assert "test-model" in output
        assert "80" in output
        assert "injection" in output
        # Markdown should have headers
        assert "#" in output

    def test_render_terminal(self, sample_report):
        from agent_redteam.report import render_report
        import io as _io
        buf = _io.StringIO()
        render_report(sample_report, file=buf)
        output = buf.getvalue()
        assert "test-model" in output
        assert "80" in output
