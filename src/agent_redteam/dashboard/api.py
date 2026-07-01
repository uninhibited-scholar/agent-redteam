"""Dashboard backend — embedded HTTP server + WebSocket for the React frontend.

Zero core dependencies (Python stdlib only).
Serves the built SPA from dashboard/static/ and provides:
  GET  /api/report   — last scan report as JSON
  GET  /api/suites   — available suites
  GET  /api/health   — health check
  WS   /ws           — real-time telemetry during scan
"""
from __future__ import annotations
import json, os, threading, webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse

from ..core.result import ScanReport, SampleResult
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


_state = DashboardState()


def get_static_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "static")


class DashboardHandler(SimpleHTTPRequestHandler):
    """Serves static files + JSON API + WebSocket upgrade."""

    def __init__(self, *args, **kwargs):
        static_dir = get_static_dir()
        super().__init__(*args, directory=static_dir, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)

        # WebSocket upgrade
        if parsed.path == "/ws":
            if perform_ws_handshake(self):
                handle_ws_connection(self)
            return

        # API endpoints
        if parsed.path == "/api/report":
            self._json_response(_state.report_json)
        elif parsed.path == "/api/suites":
            suites = []
            if _state.report:
                for s in _state.report.suites:
                    suites.append({"name": s.name, "total": s.total, "score": s.score})
            self._json_response(json.dumps({"suites": suites}, ensure_ascii=False))
        elif parsed.path == "/api/health":
            self._json_response('{"status":"ok","scanning":%s}' % ("true" if _state.scanning else "false"))
        else:
            # SPA fallback
            if "." not in os.path.basename(parsed.path):
                self.path = "/index.html"
            super().do_GET()

    def _json_response(self, body: str):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

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

    static_dir = get_static_dir()
    if not os.path.exists(os.path.join(static_dir, "index.html")):
        print(f"Dashboard static files not found at {static_dir}")
        print("Build the frontend first: cd web && npm run build")
        return

    # Use DashboardHandler directly (WS handled in do_GET)
    server = ThreadedHTTPServer((host, port), DashboardHandler)
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
