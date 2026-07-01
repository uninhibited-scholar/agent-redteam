"""Dashboard backend — embedded HTTP server + WebSocket for the React frontend.

Zero core dependencies (Python stdlib http.server + threading).
Serves the built SPA from dashboard/static/ and provides:
  GET  /api/report   — last scan report as JSON
  GET  /api/suites   — available suites
  WS   /ws           — real-time telemetry during scan
"""
from __future__ import annotations
import json, os, threading, webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse

from ..core.result import ScanReport


class DashboardState:
    """Shared state between HTTP handler and scan worker."""
    def __init__(self):
        self.report: ScanReport | None = None
        self.report_json: str = "{}"
        self.ws_clients: list = []
        self.lock = threading.Lock()

    def set_report(self, report: ScanReport):
        with self.lock:
            self.report = report
            self.report_json = json.dumps(report.to_dict(), ensure_ascii=False)

    def broadcast(self, msg: dict):
        """Broadcast a message to all WebSocket clients (simplified)."""
        data = json.dumps(msg, ensure_ascii=False)
        # In a real impl this would write to WS frames; for now we store events
        # that the frontend polls or we use a proper WS handler.


_state = DashboardState()


def get_static_dir() -> str:
    """Find the dashboard static directory."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "static")


class DashboardHandler(SimpleHTTPRequestHandler):
    """Serves static files + JSON API endpoints."""

    def __init__(self, *args, **kwargs):
        static_dir = get_static_dir()
        super().__init__(*args, directory=static_dir, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/report":
            self._json_response(_state.report_json)
        elif parsed.path == "/api/suites":
            suites = []
            if _state.report:
                for s in _state.report.suites:
                    suites.append({"name": s.name, "total": s.total, "score": s.score})
            self._json_response(json.dumps({"suites": suites}, ensure_ascii=False))
        elif parsed.path == "/api/health":
            self._json_response('{"status":"ok"}')
        else:
            # SPA fallback: serve index.html for unknown routes
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
        pass  # Suppress default logging


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def serve_dashboard(
    report: ScanReport | None = None,
    host: str = "127.0.0.1",
    port: int = 7878,
    open_browser: bool = True,
) -> None:
    """Start the dashboard server.

    Args:
        report: Optional pre-computed scan report to display
        host: Bind address
        port: Port (default 7878)
        open_browser: Auto-open browser
    """
    if report:
        _state.set_report(report)

    static_dir = get_static_dir()
    if not os.path.exists(os.path.join(static_dir, "index.html")):
        print(f"Dashboard static files not found at {static_dir}")
        print("Build the frontend first: cd web && npm run build")
        return

    server = ThreadedHTTPServer((host, port), DashboardHandler)
    url = f"http://{host}:{port}"

    print(f"\n  Agent Redteam Dashboard running at {url}\n")
    print(f"  Press Ctrl+C to stop.\n")

    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopping dashboard...")
        server.shutdown()
