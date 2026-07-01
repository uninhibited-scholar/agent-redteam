"""CLI entry point — agent-redteam command."""
from __future__ import annotations
import argparse, os, sys

from .core.engine import Engine
from .targets import OpenAITarget, ClaudeTarget, LocalTarget
from .report import render_report, render_json


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="agent-redteam",
        description="AI Agent 红队安全测试平台 — 在发布前给你的 agent 跑安全扫描",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # scan command
    p_scan = sub.add_parser("scan", help="对一个 agent 目标跑红队扫描")
    p_scan.add_argument("--model", required=True, help="模型 ID (如 gpt-4o, glm-4-plus)")
    p_scan.add_argument("--base-url", default=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"))
    p_scan.add_argument("--key", default=os.environ.get("OPENAI_API_KEY", ""), help="API key")
    p_scan.add_argument("--target", choices=["openai", "claude", "local"], default="openai",
                        help="目标类型 (默认: openai 兼容)")
    p_scan.add_argument("--endpoint", default="", help="本地 agent endpoint (target=local 时使用)")
    p_scan.add_argument("--suites", default="", help="只跑特定套件，逗号分隔 (如 injection,info_leak)")
    p_scan.add_argument("--max-tokens", type=int, default=500)
    p_scan.add_argument("--workers", type=int, default=4, help="并行 API 调用数")
    p_scan.add_argument("--format", choices=["terminal", "json", "markdown"], default="terminal")
    p_scan.add_argument("--fail-below", type=float, default=0, metavar="SCORE",
                        help="总分低于此值则返回 exit 1 (CI 集成用)")
    p_scan.add_argument("--limit", type=int, default=0, help="每套件最多跑 N 条样本 (调试用)")
    p_scan.add_argument("--tui", action="store_true", help="启动 Textual 实时界面")
    p_scan.add_argument("--serve", action="store_true", help="扫描完成后启动 Web Dashboard")
    p_scan.add_argument("--port", type=int, default=7878, help="Dashboard 端口")

    # list command
    sub.add_parser("list", help="列出可用的攻击套件")

    # serve command
    p_serve = sub.add_parser("serve", help="启动 Web Dashboard")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=7878)
    p_serve.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")

    args = parser.parse_args(argv)

    if args.command == "list":
        return _cmd_list()
    elif args.command == "serve":
        from .dashboard import serve_dashboard
        serve_dashboard(host=args.host, port=args.port, open_browser=not args.no_browser)
        return 0
    elif args.command == "scan":
        return _cmd_scan(args)
    return 1


def _cmd_list() -> int:
    from .targets import OpenAITarget
    target = OpenAITarget(model="dummy", api_key="dummy")
    engine = Engine(target)
    suites = engine.list_suites()
    print(f"\n可用攻击套件 ({len(suites)}):\n")
    for name in suites:
        suite = engine._suites.get(name)
        if suite:
            sample_count = len(suite.load_samples())
            print(f"  {name:<16} {suite.owasp:<6} {sample_count:>4} samples  {suite.description}")
    print()
    return 0


def _cmd_scan(args) -> int:
    # Build target
    if args.target == "claude":
        target = ClaudeTarget(model=args.model, api_key=args.key, max_tokens=args.max_tokens)
    elif args.target == "local":
        if not args.endpoint:
            print("ERROR: --endpoint required for local target")
            return 2
        target = LocalTarget(endpoint=args.endpoint, model=args.model)
    else:
        target = OpenAITarget(
            model=args.model, api_key=args.key,
            base_url=args.base_url, max_tokens=args.max_tokens,
        )

    # Determine suites
    suites = [s.strip() for s in args.suites.split(",") if s.strip()] or None

    # TUI mode
    if args.tui:
        from .tui import run_tui, TEXTUAL_AVAILABLE
        if not TEXTUAL_AVAILABLE:
            print("TUI 需要 textual。请安装: pip install agent-redteam[tui]")
            return 2
        run_tui(target=target, suites=suites, max_workers=args.workers)
        return 0

    # Progress callback
    total_done = [0]
    ws_state = None
    if args.serve:
        from .dashboard import _state as ws_state

    def on_result(r):
        total_done[0] += 1
        if ws_state:
            # Push to WebSocket clients
            ws_state.emit_sample(r)
        else:
            mark = "✅" if r.verdict.value == "pass" else "❌" if r.verdict.value == "fail" else "⚠️"
            sys.stderr.write(f"\r  {mark} [{total_done[0]}] {r.suite}/{r.sample_id}           ")
            sys.stderr.flush()

    # Run scan
    engine = Engine(target, max_workers=args.workers)
    print(f"Starting scan: {args.model} ({args.target})")
    if suites:
        print(f"Suites: {', '.join(suites)}")
    print(f"Workers: {args.workers}\n")

    # Optionally limit samples
    if args.limit > 0:
        for suite in engine._suites.values():
            suite._limit = args.limit

    # If --serve, start dashboard server FIRST (in background) so LiveScan works
    if args.serve:
        from .dashboard import serve_dashboard
        # Start server in background thread
        import threading as _threading
        server_thread = _threading.Thread(
            target=lambda: serve_dashboard(
                host="127.0.0.1", port=args.port, open_browser=True
            ),
            daemon=True,
        )
        server_thread.start()
        import time as _time
        _time.sleep(1)  # Let server boot
        ws_state.emit_scan_started(suites or engine.list_suites())
        print(f"  Dashboard running at http://127.0.0.1:{args.port}")
        print(f"  Scanning... events streaming to LiveScan page\n")

    report = engine.scan(suites=suites, on_result=on_result)
    sys.stderr.write("\r" + " " * 60 + "\r")

    if ws_state:
        ws_state.emit_scan_done(report)

    # Output (only for non-serve mode; serve mode shows in browser)
    if not args.serve:
        if args.format == "json":
            print(render_json(report))
        else:
            render_report(report)

    if args.serve:
        print(f"\n  Scan complete. Score: {report.overall_score}/100")
        print(f"  Dashboard staying open at http://127.0.0.1:{args.port}")
        print(f"  Press Ctrl+C to stop.\n")
        try:
            import time as _time
            while True:
                _time.sleep(3600)
        except KeyboardInterrupt:
            pass
        return 0

    # CI gate
    if args.fail_below > 0 and report.overall_score < args.fail_below:
        print(f"\n❌ Score {report.overall_score} below threshold {args.fail_below}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
