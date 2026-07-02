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
