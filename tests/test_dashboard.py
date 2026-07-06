"""Tests for the dashboard HTTP API and scan-config key handling.

Verifies that API keys are never leaked into HTTP responses, and that the
history/compare/scan-config endpoints work against a live ThreadedHTTPServer.
"""
import json, os, sys, tempfile, urllib.request
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from agent_redteam.core.config import (
    load_scan_config, has_api_key, scan_config_status,
)
from agent_redteam.dashboard.api import DashboardHandler, ThreadedHTTPServer, _state


# ===== Config / key handling =====

def test_load_scan_config_reads_file(monkeypatch=None):
    with tempfile.TemporaryDirectory() as d:
        cfg_path = os.path.join(d, "config")
        with open(cfg_path, "w") as f:
            f.write("api_key: sk-test-1234567890\nmodel: glm-4-plus\nbase_url: https://example.com/v1\n")

        with mock.patch("agent_redteam.core.config._config_path", return_value=cfg_path):
            cfg = load_scan_config()
        assert cfg["api_key"] == "sk-test-1234567890"
        assert cfg["model"] == "glm-4-plus"
        assert cfg["base_url"] == "https://example.com/v1"


def test_has_api_key_env_fallback():
    with tempfile.TemporaryDirectory() as d:
        cfg_path = os.path.join(d, "config")  # absent
        with mock.patch("agent_redteam.core.config._config_path", return_value=cfg_path), \
             mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-env-xyz"}, clear=False):
            assert has_api_key() is True
        # and without env
        env = {k: v for k, v in os.environ.items() if k != "OPENAI_API_KEY"}
        with mock.patch("agent_redteam.core.config._config_path", return_value=cfg_path), \
             mock.patch.dict(os.environ, env, clear=True):
            assert has_api_key() is False


def test_scan_config_status_never_exposes_key():
    """scan_config_status() must NOT contain the api_key — it's the public view."""
    with tempfile.TemporaryDirectory() as d:
        cfg_path = os.path.join(d, "config")
        with open(cfg_path, "w") as f:
            f.write("api_key: sk-super-secret-999\nmodel: gpt-4o\n")

        with mock.patch("agent_redteam.core.config._config_path", return_value=cfg_path):
            status = scan_config_status()

        assert status["key_configured"] is True
        assert status["default_model"] == "gpt-4o"
        # The secret must not appear anywhere in the serialized status
        assert "sk-super-secret-999" not in json.dumps(status)


# ===== HTTP API via live server =====

def _start_server():
    """Start the dashboard server on an ephemeral port, return (base_url, server)."""
    # Ensure a key exists so /api/scan/config reports key_configured=True
    with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-liveserver-key"}, clear=False):
        server = ThreadedHTTPServer(("127.0.0.1", 0), DashboardHandler)
        import threading
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        port = server.server_address[1]
        return f"http://127.0.0.1:{port}", server


def _get(url):
    with urllib.request.urlopen(url, timeout=5) as r:
        return r.status, json.loads(r.read().decode())


def test_api_history_endpoint():
    base, server = _start_server()
    try:
        status, body = _get(f"{base}/api/history?limit=5")
        assert status == 200
        assert "scans" in body
        assert isinstance(body["scans"], list)
    finally:
        server.shutdown()


def test_api_scan_config_no_key_leak():
    base, server = _start_server()
    try:
        status, body = _get(f"{base}/api/scan/config")
        assert status == 200
        assert "key_configured" in body
        assert "suites" in body
        assert isinstance(body["suites"], list)
        # The live-server key must never appear in the response
        assert "sk-liveserver-key" not in json.dumps(body)
    finally:
        server.shutdown()


def test_api_health():
    base, server = _start_server()
    try:
        status, body = _get(f"{base}/api/health")
        assert status == 200
        assert body["status"] == "ok"
        assert "scanning" in body
    finally:
        server.shutdown()


def test_api_scan_start_rejects_without_key():
    """POST /api/scan/start must 403 when no key is configured."""
    # Patch has_api_key to False for this test
    with mock.patch("agent_redteam.dashboard.api.has_api_key", return_value=False):
        base, server = _start_server()
        try:
            req = urllib.request.Request(
                f"{base}/api/scan/start",
                data=json.dumps({"model": "gpt-4o", "suites": [], "workers": 1, "max_tokens": 10, "target": "openai"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                urllib.request.urlopen(req, timeout=5)
                assert False, "should have raised"
            except urllib.error.HTTPError as e:
                assert e.code == 403
                body = json.loads(e.read().decode())
                assert "error" in body
                # no key in the error message
                assert "sk-liveserver-key" not in json.dumps(body)
        finally:
            server.shutdown()


# ===== /api/settings — GET/POST round-trip =====

def test_api_settings_get_post_round_trip():
    """POST /api/settings must persist, then GET must return the merged value."""
    base, server = _start_server()
    # Use an isolated temp settings file so we don't clobber real settings
    with tempfile.TemporaryDirectory() as d:
        settings_path = os.path.join(d, "settings.json")
        with mock.patch("agent_redteam.dashboard.settings_api.SETTINGS_PATH", settings_path):
            try:
                # GET default first
                _, before = _get(f"{base}/api/settings")
                assert before["workers"] == 4  # default

                # POST an update
                req = urllib.request.Request(
                    f"{base}/api/settings",
                    data=json.dumps({"workers": 12, "fail_below": 65}).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=5) as r:
                    posted = json.loads(r.read().decode())
                assert posted["workers"] == 12
                assert posted["fail_below"] == 65

                # GET must reflect the persisted merge
                _, after = _get(f"{base}/api/settings")
                assert after["workers"] == 12
                assert after["fail_below"] == 65
            finally:
                server.shutdown()


def test_api_settings_post_rejects_invalid_json():
    base, server = _start_server()
    try:
        req = urllib.request.Request(
            f"{base}/api/settings",
            data=b"not json",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=5)
            assert False, "should have raised"
        except urllib.error.HTTPError as e:
            assert e.code == 400
    finally:
        server.shutdown()


# ===== /api/samples — paginated drill-down =====

def _seed_report_into_state():
    """Populate the shared _state with a known ScanReport for samples tests."""
    from agent_redteam.core.result import (
        ScanReport, SuiteResult, SampleResult, Verdict,
    )

    def mk(suite, sid, verdict, severity="medium", category="cat",
           question="hello", response="world", difficulty="basic"):
        return SampleResult(
            suite=suite, sample_id=sid, category=category, difficulty=difficulty,
            question=question, expected="e", response=response, verdict=verdict,
            severity=severity, owasp="LLM01", tags=[],
        )

    report = ScanReport(target_model="test-model", started_at="t0", finished_at="t1")
    inj = SuiteResult(name="injection")
    inj.total = 3
    inj.samples = [
        mk("injection", "i1", Verdict.FAIL, "critical", "prompt_injection", "bypass", "got it"),
        mk("injection", "i2", Verdict.PASS, "medium", "prompt_injection", "jailbreak", "refused"),
        mk("injection", "i3", Verdict.FAIL, "high", "prompt_injection", "inject", "leaked"),
    ]
    inj.passed = 1
    inj.failed = 2
    leak = SuiteResult(name="info_leak")
    leak.total = 1
    leak.samples = [mk("info_leak", "l1", Verdict.ERROR, "low", "pii", "secret?", "")]
    leak.errors = 1
    report.suites = [inj, leak]
    _state.set_report(report)


def test_api_samples_default_returns_all_with_facets():
    base, server = _start_server()
    try:
        _seed_report_into_state()
        status, body = _get(f"{base}/api/samples?page=1&page_size=25")
        assert status == 200
        assert body["total"] == 4
        assert body["total_pages"] == 1
        assert body["page"] == 1
        assert body["facets"]["verdict"] == {"fail": 2, "pass": 1, "error": 1}
        assert body["facets"]["suite"] == {"injection": 3, "info_leak": 1}
        # report meta is echoed
        assert body["report"]["target_model"] == "test-model"
    finally:
        server.shutdown()


def test_api_samples_verdict_filter():
    base, server = _start_server()
    try:
        _seed_report_into_state()
        _, body = _get(f"{base}/api/samples?verdict=fail")
        assert body["total"] == 2
        assert all(i["verdict"] == "fail" for i in body["items"])
    finally:
        server.shutdown()


def test_api_samples_suite_and_severity_filter():
    base, server = _start_server()
    try:
        _seed_report_into_state()
        _, body = _get(f"{base}/api/samples?suite=injection&severity=critical")
        assert body["total"] == 1
        assert body["items"][0]["sample_id"] == "i1"
    finally:
        server.shutdown()


def test_api_samples_search_substring():
    base, server = _start_server()
    try:
        _seed_report_into_state()
        _, body = _get(f"{base}/api/samples?search=bypass")
        assert body["total"] == 1
        assert body["items"][0]["sample_id"] == "i1"
    finally:
        server.shutdown()


def test_api_samples_sort_severity_desc_riskiest_first():
    """sort_dir=desc must surface critical before low (security convention)."""
    base, server = _start_server()
    try:
        _seed_report_into_state()
        _, body = _get(f"{base}/api/samples?sort_by=severity&sort_dir=desc&page_size=10")
        sevs = [i["severity"] for i in body["items"]]
        # critical(3) > high(2) > medium(1) > low(0) in rank, so desc order:
        assert sevs == ["critical", "high", "medium", "low"], sevs
    finally:
        server.shutdown()


def test_api_samples_pagination_boundaries():
    base, server = _start_server()
    try:
        _seed_report_into_state()
        _, page1 = _get(f"{base}/api/samples?page=1&page_size=2")
        _, page2 = _get(f"{base}/api/samples?page=2&page_size=2")
        assert page1["total"] == 4
        assert page1["total_pages"] == 2
        assert len(page1["items"]) == 2
        assert len(page2["items"]) == 2
        # page 3 must be empty
        _, page3 = _get(f"{base}/api/samples?page=3&page_size=2")
        assert page3["items"] == []
        # page_size capped at 200
        _, big = _get(f"{base}/api/samples?page_size=999")
        assert big["page_size"] == 200
    finally:
        server.shutdown()


def test_api_samples_empty_report_state():
    base, server = _start_server()
    try:
        _state.report_json = '{"suites": [], "samples": []}'
        _, body = _get(f"{base}/api/samples")
        assert body["total"] == 0
        assert body["items"] == []
        assert body["facets"] == {"suite": {}, "verdict": {}, "severity": {}, "difficulty": {}}
    finally:
        server.shutdown()


# ===== /api/risk-matrix =====

def test_api_risk_matrix_structure():
    base, server = _start_server()
    try:
        _seed_report_into_state()
        _, body = _get(f"{base}/api/risk-matrix")
        assert body is not None
        assert "suites" in body
        assert "severities" in body
        assert body["severities"] == ["critical", "high", "medium", "low"]
        assert "matrix" in body and "totals" in body
        assert body["matrix"]["injection"]["critical"] == 1
        assert body["matrix"]["injection"]["high"] == 1
        assert body["totals"]["injection"]["fail"] == 2
        assert body["totals"]["injection"]["pass"] == 1
        # ERROR samples don't count toward any severity failure cell
        assert body["matrix"]["info_leak"]["low"] == 0
    finally:
        server.shutdown()


def test_api_risk_matrix_suites_ordered_by_risk():
    """Suites with more failures must be listed first."""
    base, server = _start_server()
    try:
        _seed_report_into_state()
        _, body = _get(f"{base}/api/risk-matrix")
        suites = body["suites"]
        # injection has 2 fail-severity hits, info_leak has 0 → injection first
        assert suites[0] == "injection"
    finally:
        server.shutdown()


# ===== /api/timeline =====

def test_api_timeline_compact_points():
    base, server = _start_server()
    try:
        _seed_report_into_state()
        _, body = _get(f"{base}/api/timeline")
        assert body["count"] == 4
        assert len(body["points"]) == 4
        assert body["points"][0]["index"] == 0
        # compact: no full response body in timeline points
        assert "response" not in body["points"][0]
        assert "question" not in body["points"][0]
        # but core identifying fields present
        for key in ("suite", "sample_id", "verdict", "severity", "category"):
            assert key in body["points"][0]
    finally:
        server.shutdown()

