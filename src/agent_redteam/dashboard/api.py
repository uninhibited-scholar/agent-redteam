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
  GET  /api/samples          — paginated/filtered/sorted sample drill-down
                               (?page=&page_size=&suite=&verdict=&severity=&search=&sort_by=&sort_dir=)
  GET  /api/risk-matrix      — failure density per suite × severity bucket
  GET  /api/timeline         — per-sample result timeline in execution order
  GET  /api/settings         — UI settings (GET/POST)
  WS   /ws                   — real-time telemetry during scan
"""
from __future__ import annotations
import json, os, threading, webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs
from .settings_api import load_settings, merge_settings

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
        from ..targets import (
            OpenAITarget, ClaudeTarget, LocalTarget, ZaiTarget,
            OllamaTarget, DeepSeekTarget, AzureTarget, QwenTarget,
        )
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
        elif target_type == "zai":
            target = ZaiTarget(model=model, api_key=api_key, max_tokens=max_tokens)
        elif target_type == "ollama":
            target = OllamaTarget(model=model or "llama3", max_tokens=max_tokens)
        elif target_type == "deepseek":
            target = DeepSeekTarget(model=model or "deepseek-chat", api_key=api_key, max_tokens=max_tokens)
        elif target_type == "azure":
            target = AzureTarget(deployment=model, endpoint=base_url or "", api_key=api_key, max_tokens=max_tokens)
        elif target_type == "qwen":
            target = QwenTarget(model=model or "qwen-plus", api_key=api_key, max_tokens=max_tokens)
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

        # Per-suite sample cap (lets the wizard control scan scale).
        samples_per_suite = int(req.get("samples_per_suite", 0))
        if samples_per_suite > 0:
            for name in (suites or engine.list_suites()):
                s = engine._suites.get(name)
                if s:
                    s._limit = samples_per_suite

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
        elif path == "/api/settings":
            # GET only here — POST is routed in do_POST
            self._json_response(json.dumps(load_settings(), ensure_ascii=False))
        elif path == "/api/samples":
            self._handle_samples(parsed)
        elif path == "/api/risk-matrix":
            self._handle_risk_matrix(parsed)
        elif path == "/api/timeline":
            self._handle_timeline(parsed)
        elif path.startswith("/api/export/"):
            fmt = path[len("/api/export/"):]
            self._handle_export(fmt)
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
        elif parsed.path == "/api/settings":
            self._handle_settings_post()
        else:
            self.send_error(404)

    # --- API handlers ---

    def _load_samples(self) -> tuple[list[dict], dict]:
        """Load samples from current report_json.

        Returns (samples, report_meta) where report_meta holds the top-level
        report fields (target_model, timestamps, overall_score, totals).
        If no report is loaded, returns ([], {}).
        """
        if not _state.report_json or _state.report_json == '{"suites": [], "samples": []}':
            return [], {}
        try:
            data = json.loads(_state.report_json)
        except json.JSONDecodeError:
            return [], {}
        samples = list(data.get("samples", []))
        meta = {
            "target_model": data.get("target_model", ""),
            "started_at": data.get("started_at", ""),
            "finished_at": data.get("finished_at", ""),
            "overall_score": data.get("overall_score"),
            "total_samples": data.get("total_samples", len(samples)),
            "total_passed": data.get("total_passed"),
            "total_failed": data.get("total_failed"),
        }
        return samples, meta

    def _handle_samples(self, parsed):
        """Paginated / filtered / sorted sample drill-down.

        Query params:
          page        — 1-based page number (default 1)
          page_size   — items per page (default 25, capped at 200)
          suite       — filter by suite name (exact)
          verdict     — pass | fail | error
          severity    — low | medium | high | critical
          difficulty  — basic | intermediate | advanced
          search      — case-insensitive substring over question/response/category
          sort_by     — suite | sample_id | verdict | severity | category
                        (default: execution order = input order)
          sort_dir    — asc | desc (default asc)
        """
        qs = parse_qs(parsed.query)
        page = max(1, int(qs.get("page", ["1"])[0]))
        page_size = min(200, max(1, int(qs.get("page_size", ["25"])[0])))

        suite_q = qs.get("suite", [None])[0]
        verdict_q = qs.get("verdict", [None])[0]
        severity_q = qs.get("severity", [None])[0]
        difficulty_q = qs.get("difficulty", [None])[0]
        search_q = (qs.get("search", [None])[0] or "").lower()
        sort_by = qs.get("sort_by", [None])[0]
        sort_dir = qs.get("sort_dir", ["asc"])[0].lower()

        samples, meta = self._load_samples()

        # --- Filter ---
        def matches(s):
            if suite_q and s.get("suite") != suite_q:
                return False
            if verdict_q and s.get("verdict") != verdict_q:
                return False
            if severity_q and s.get("severity") != severity_q:
                return False
            if difficulty_q and s.get("difficulty") != difficulty_q:
                return False
            if search_q:
                hay = " ".join([
                    str(s.get("question", "")),
                    str(s.get("response", "")),
                    str(s.get("category", "")),
                    str(s.get("sample_id", "")),
                ]).lower()
                if search_q not in hay:
                    return False
            return True

        filtered = [s for s in samples if matches(s)]

        # --- Sort ---
        # Ranks map "worst" → highest number so that sort_dir=desc surfaces the
        # riskiest items first (critical before low, fail before pass).
        severity_rank = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        verdict_rank = {"pass": 0, "error": 1, "fail": 2}
        if sort_by in {"suite", "sample_id", "verdict", "severity", "category", "difficulty"}:
            reverse = (sort_dir == "desc")

            def sort_key(s):
                v = s.get(sort_by, "")
                if sort_by == "severity":
                    return severity_rank.get(v, -1)
                if sort_by == "verdict":
                    return verdict_rank.get(v, -1)
                return (v is None, v)
            filtered.sort(key=sort_key, reverse=reverse)

        # --- Paginate ---
        total = len(filtered)
        total_pages = (total + page_size - 1) // page_size if total else 0
        start = (page - 1) * page_size
        end = start + page_size
        page_items = filtered[start:end]

        # --- Facet counts for the filter bar (over ALL samples, pre-filter) ---
        facets = {
            "suite": {}, "verdict": {}, "severity": {}, "difficulty": {},
        }
        for s in samples:
            for k in facets:
                val = s.get(k)
                if val is not None:
                    facets[k][val] = facets[k].get(val, 0) + 1

        payload = {
            "items": page_items,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "facets": facets,
            "report": meta,
            "filters": {
                "suite": suite_q, "verdict": verdict_q,
                "severity": severity_q, "difficulty": difficulty_q,
                "search": search_q or None, "sort_by": sort_by, "sort_dir": sort_dir,
            },
        }
        self._json_response(json.dumps(payload, ensure_ascii=False))

    def _handle_risk_matrix(self, parsed):
        """Failure density per suite × severity bucket.

        Returns:
          {
            "suites":   ["injection", "tool_abuse", ...],
            "severities": ["critical","high","medium","low"],
            "matrix":   { "<suite>": {"critical": N, ...}, ... },
            "totals":   { "<suite>": {"fail": N, "pass": N, "error": N}, ... }
          }
        Useful for the RiskMatrix heatmap component.
        """
        samples, meta = self._load_samples()
        sev_order = ["critical", "high", "medium", "low"]
        suites_seen: list[str] = []
        matrix: dict[str, dict[str, int]] = {}
        totals: dict[str, dict[str, int]] = {}

        for s in samples:
            suite = s.get("suite", "?")
            sev = s.get("severity", "medium")
            verdict = s.get("verdict", "")
            if suite not in matrix:
                suites_seen.append(suite)
                matrix[suite] = {k: 0 for k in sev_order}
                totals[suite] = {"fail": 0, "pass": 0, "error": 0}
            if sev in matrix[suite] and verdict == "fail":
                matrix[suite][sev] += 1
            if verdict in totals[suite]:
                totals[suite][verdict] += 1

        # Order suites by total fail count descending (riskiest first)
        suites_seen.sort(key=lambda name: sum(matrix[name].values()), reverse=True)

        payload = {
            "suites": suites_seen,
            "severities": sev_order,
            "matrix": matrix,
            "totals": totals,
            "report": meta,
        }
        self._json_response(json.dumps(payload, ensure_ascii=False))

    def _handle_timeline(self, parsed):
        """Per-sample result in execution order (input order).

        Returns a compact list of {suite, sample_id, verdict, severity, category}
        so the SampleTimeline component can render a dense strip without pulling
        full response bodies.
        """
        samples, meta = self._load_samples()
        points = []
        for i, s in enumerate(samples):
            points.append({
                "index": i,
                "suite": s.get("suite", ""),
                "sample_id": s.get("sample_id", ""),
                "category": s.get("category", ""),
                "verdict": s.get("verdict", ""),
                "severity": s.get("severity", "medium"),
            })
        payload = {
            "points": points,
            "count": len(points),
            "report": meta,
        }
        self._json_response(json.dumps(payload, ensure_ascii=False))

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

    def _handle_export(self, fmt: str):
        """Export current report as JSON or Markdown for download."""
        if not _state.report_json or _state.report_json == '{"suites": [], "samples": []}':
            self._json_response('{"error":"no report available"}', status=404)
            return

        if fmt == "json":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="agent-redteam-report.json"')
            self.end_headers()
            self.wfile.write(_state.report_json.encode("utf-8"))
        elif fmt == "markdown":
            from ..core.result import ScanReport, SuiteResult, SampleResult, Verdict
            from ..report.markdown_report import render_markdown
            import json as _json
            data = _json.loads(_state.report_json)
            # Rebuild a minimal ScanReport for render_markdown
            report = ScanReport(
                target_model=data.get("target_model", "unknown"),
                started_at=data.get("started_at", ""),
                finished_at=data.get("finished_at", ""),
            )
            report.suites = []
            for s in data.get("suites", []):
                sr = SuiteResult(name=s["name"])
                sr.total = s["total"]
                sr.passed = s["passed"]
                sr.failed = s["failed"]
                sr.errors = s.get("errors", 0)
                sr.skipped = s.get("skipped", 0)
                # score is a property, don't set it directly
                # Rebuild samples for markdown detail
                for sm in data.get("samples", []):
                    if sm["suite"] == s["name"]:
                        sr.samples.append(SampleResult(
                            suite=sm["suite"], sample_id=sm["sample_id"],
                            category=sm["category"], difficulty=sm["difficulty"],
                            question=sm["question"], expected=sm["expected"],
                            response=sm["response"], verdict=Verdict(sm["verdict"]),
                            severity=sm["severity"], owasp=sm["owasp"],
                            tags=sm["tags"],
                        ))
                report.suites.append(sr)
            md = render_markdown(report)
            self.send_response(200)
            self.send_header("Content-Type", "text/markdown; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="agent-redteam-report.md"')
            self.end_headers()
            self.wfile.write(md.encode("utf-8"))
        else:
            self._json_response('{"error":"unsupported format. Use json or markdown"}', status=400)

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

    def _handle_settings_post(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            updates = json.loads(body)
            merged = merge_settings(updates)
            self._json_response(json.dumps(merged, ensure_ascii=False))
        except json.JSONDecodeError:
            self._json_response('{"error":"invalid json"}', status=400)

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
