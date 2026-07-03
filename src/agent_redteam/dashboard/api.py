"""Dashboard backend — embedded HTTP server + WebSocket for the React frontend.

Zero core dependencies (Python stdlib only).
Serves the built SPA from dashboard/static/ and provides:
  GET  /api/report           — last scan report as JSON
  GET  /api/report/<run_id>  — historical scan report by run_id
  GET  /api/suites           — available suites
  GET  /api/health           — health check
  GET  /api/history          — recent scan records
  GET  /api/compare          — compare two scans (?run_a=&run_b=)
  GET  /api/scan/config      — externally-safe scan config status (NO api_key)
  POST /api/scan/start       — launch a scan in the background
  WS   /ws                   — real-time telemetry during scan
"""
from __future__ import annotations
import json, os, threading, webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs

from ..core.result import ScanReport, SampleResult
from ..core.config import has_api_key  # imported at module scope so it can be patched in tests
from .server import (
    TelemetryBroadcaster, WebSocketClient,
    perform_ws_handshake, handle_ws_connection,
)


class DashboardState:
    """Shared state between HTTP handler and scan worker."""
    def __init__(self):
        self.report: ScanReport | None = None
        self.report_json: str = '{"suites": [], "samples": []}'
        self.scanning = False
        self.scan_error: str | None = None
        self.broadcaster = TelemetryBroadcaster()

    def set_report(self, report: ScanReport):
        self.report = report
        # Build full JSON with samples
        data = report.to_dict()
        data["samples"] = []
        for suite in report.suites:
            for s in suite.samples:
                d = s.to_dict()
                data["samples"].append(d)
        self.report_json = json.dumps(data, ensure_ascii=False)

    def emit_sample(self, sample: SampleResult):
        """Broadcast a sample result to all WS clients."""
        self.broadcaster.broadcast({
            "type": "sample_result",
            "data": sample.to_dict(),
        })

    def emit_scan_started(self, suites: list[str]):
        self.scanning = True
        self.scan_error = None
        self.broadcaster.broadcast({
            "type": "scan_started",
            "data": {"suites": suites},
        })

    def emit_scan_done(self, report: ScanReport):
        self.scanning = False
        self.set_report(report)
        self.broadcaster.broadcast({
            "type": "scan_done",
            "data": report.to_dict(),
        })

    def emit_scan_failed(self, error: str):
        self.scanning = False
        self.scan_error = error
        self.broadcaster.broadcast({
            "type": "scan_failed",
            "data": {"error": error},
        })


_state = DashboardState()


def get_static_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "static")


def _available_suites() -> list[dict]:
    """Return list of {name, owasp, count, description} for built-in suites."""
    from ..core.engine import Engine
    from ..targets import OpenAITarget
    target = OpenAITarget(model="dummy", api_key="dummy")
    engine = Engine(target)
    suites = []
    for name in engine.list_suites():
        suite = engine._suites.get(name)
        if suite:
            suites.append({
                "name": suite.name,
                "owasp": suite.owasp,
                "count": len(suite.load_samples()),
                "description": suite.description,
            })
    return suites


def _run_scan_in_background(req: dict) -> None:
    """Run a scan in a background thread, pushing telemetry over WebSocket.

    The API key is read from the config file / env inside the backend; it is
    never logged or returned. Any exception is broadcast as scan_failed.
    """
    try:
        from ..core.config import load_scan_config
        from ..core.engine import Engine
        from ..targets import OpenAITarget, ClaudeTarget, LocalTarget
        from ..core.storage import save_report

        cfg = load_scan_config()
        api_key = cfg.get("api_key", "")
        model = req.get("model", cfg.get("model", "gpt-4o"))
        base_url = req.get("base_url") or cfg.get("base_url", "https://api.openai.com/v1")
        target_type = req.get("target", "openai")
        suites = req.get("suites") or None
        workers = int(req.get("workers", cfg.get("workers", 4)))
        max_tokens = int(req.get("max_tokens", cfg.get("max_tokens", 500)))

        if not api_key:
            _state.emit_scan_failed("No API key configured in ~/.agent-redteam/config")
            return

        if target_type == "claude":
            target = ClaudeTarget(model=model, api_key=api_key, max_tokens=max_tokens)
        elif target_type == "local":
            endpoint = req.get("endpoint", "")
            target = LocalTarget(endpoint=endpoint, model=model)
        else:
            target = OpenAITarget(
                model=model, api_key=api_key,
                base_url=base_url, max_tokens=max_tokens,
            )

        engine = Engine(target, max_workers=workers)
        suite_names = suites or engine.list_suites()
        _state.emit_scan_started(suite_names)

        def on_result(r):
            _state.emit_sample(r)

        report = engine.scan(suites=suites, on_result=on_result)
        save_report(report)
        _state.emit_scan_done(report)
    except Exception as e:  # noqa: BLE001 — surface any failure to the UI
        _state.emit_scan_failed(str(e))


class DashboardHandler(SimpleHTTPRequestHandler):
    """Serves static files + JSON API + WebSocket upgrade."""

    # Fix MIME types so browsers actually execute JS and apply CSS
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
    }

    def __init__(self, *args, **kwargs):
        static_dir = get_static_dir()
        super().__init__(*args, directory=static_dir, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # WebSocket upgrade
        if path == "/ws":
            if perform_ws_handshake(self):
                handle_ws_connection(self)
            return

        # API endpoints
        if path == "/api/report":
            self._json_response(_state.report_json)
        elif path == "/api/suites":
            suites = []
            if _state.report:
                for s in _state.report.suites:
                    suites.append({"name": s.name, "total": s.total, "score": s.score})
            self._json_response(json.dumps({"suites": suites}, ensure_ascii=False))
        elif path == "/api/health":
            self._json_response('{"status":"ok","scanning":%s}' % ("true" if _state.scanning else "false"))
        elif path == "/api/history":
            self._handle_history(parsed)
        elif path == "/api/compare":
            self._handle_compare(parsed)
        elif path == "/api/scan/config":
            self._handle_scan_config()
        elif path.startswith("/api/report/"):
            run_id = path[len("/api/report/"):]
            self._handle_report_by_id(run_id)
        else:
            # SPA fallback
            if "." not in os.path.basename(path):
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/scan/start":
            self._handle_scan_start()
        else:
            self.send_error(404)

    # --- API handlers ---

    def _handle_history(self, parsed):
        from ..core.storage import list_scans
        qs = parse_qs(parsed.query)
        limit = int(qs.get("limit", ["20"])[0])
        scans = list_scans(limit=limit)
        self._json_response(json.dumps({"scans": scans}, ensure_ascii=False))

    def _handle_compare(self, parsed):
        from ..core.storage import compare_reports
        qs = parse_qs(parsed.query)
        run_a = qs.get("run_a", [""])[0]
        run_b = qs.get("run_b", [""])[0]
        if not run_a or not run_b:
            self._json_response('{"error":"run_a and run_b required"}', status=400)
            return
        result = compare_reports(run_a, run_b)
        if not result:
            self._json_response('{"error":"scan not found"}', status=404)
            return
        self._json_response(json.dumps(result, ensure_ascii=False))

    def _handle_report_by_id(self, run_id: str):
        from ..core.storage import get_report
        report = get_report(run_id)
        if not report:
            self._json_response('{"error":"scan not found"}', status=404)
            return
        self._json_response(json.dumps(report, ensure_ascii=False))

    def _handle_scan_config(self):
        """Externally-safe config status — NEVER includes the api_key."""
        from ..core.config import scan_config_status
        status = scan_config_status()
        status["scanning"] = _state.scanning
        status["scan_error"] = _state.scan_error
        try:
            status["suites"] = _available_suites()
        except Exception:
            status["suites"] = []
        self._json_response(json.dumps(status, ensure_ascii=False))

    def _handle_scan_start(self):
        if _state.scanning:
            self._json_response('{"error":"a scan is already running"}', status=409)
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            req = json.loads(raw)
        except json.JSONDecodeError:
            self._json_response('{"error":"invalid json"}', status=400)
            return

        if not req.get("model"):
            self._json_response('{"error":"model required"}', status=400)
            return

        # Key check up front — never echo the key back
        if not has_api_key():
            self._json_response(
                '{"error":"no API key configured. Add api_key to ~/.agent-redteam/config"}',
                status=403,
            )
            return

        t = threading.Thread(target=_run_scan_in_background, args=(req,), daemon=True)
        t.start()
        self._json_response('{"status":"started"}', status=202)

    def _json_response(self, body: str, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, *args):
        pass


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def serve_dashboard(
    report: ScanReport | None = None,
    host: str = "127.0.0.1",
    port: int = 7878,
    open_browser: bool = True,
) -> None:
    """Start the dashboard server with WebSocket support."""
    if report:
        _state.set_report(report)
    elif not _state.report:
        # Load most recent scan from SQLite
        try:
            from ..core.storage import list_scans, get_report
            scans = list_scans(limit=1)
            if scans:
                latest = get_report(scans[0]["run_id"])
                if latest:
                    _state.report_json = json.dumps(latest, ensure_ascii=False)
                    print(f"  Loaded latest scan: {scans[0]['run_id']}")
        except Exception:
            pass

    static_dir = get_static_dir()
    if not os.path.exists(os.path.join(static_dir, "index.html")):
        print(f"Dashboard static files not found at {static_dir}")
        print("Build the frontend first: cd web && npm run build")
        return

    # Use DashboardHandler directly (WS handled in do_GET)
    try:
        server = ThreadedHTTPServer((host, port), DashboardHandler)
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"  Port {port} in use, trying to reuse...")
            import socket
            # Set SO_REUSEADDR and retry
            ThreadedHTTPServer.allow_reuse_address = True
            server = ThreadedHTTPServer((host, port), DashboardHandler)
        else:
            raise
    url = f"http://{host}:{port}"

    print(f"\n  ⬡ Agent Redteam Dashboard running at {url}")
    print(f"  WebSocket telemetry at ws://{host}:{port}/ws")
    print(f"  Press Ctrl+C to stop.\n")

    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopping dashboard...")
        server.shutdown()
