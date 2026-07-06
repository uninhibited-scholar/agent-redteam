"""CLI entry point — agent-redteam command."""
from __future__ import annotations
import argparse, os, sys

from .core.engine import Engine
from .targets import OpenAITarget, ClaudeTarget, LocalTarget
from .report import render_report, render_json, render_markdown
from . import __version__


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="agent-redteam",
        description="AI Agent 红队安全测试平台 — 在发布前给你的 agent 跑安全扫描",
    )
    parser.add_argument("--version", action="version", version=f"agent-redteam {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    # Load config file defaults
    from .core.config import load_default_profile
    cfg = load_default_profile()

    # scan command
    p_scan = sub.add_parser("scan", help="对一个 agent 目标跑红队扫描")
    p_scan.add_argument("--model", default=cfg.get("model", ""), help="模型 ID (如 gpt-4o, glm-4-plus)")
    p_scan.add_argument("--base-url", default=cfg.get("base_url", os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")),
                        help="API base URL (默认从 ~/.agent-redteam/config 读取)")
    p_scan.add_argument("--key", default=cfg.get("api_key", cfg.get("key", os.environ.get("OPENAI_API_KEY", ""))), help="API key")
    p_scan.add_argument("--target", choices=["openai", "claude", "zai", "local"], default="openai",
                        help="目标类型 (默认: openai 兼容; zai 用智谱 Z.ai Anthropic 端点)")
    p_scan.add_argument("--endpoint", default="", help="本地 agent endpoint (target=local 时使用)")
    p_scan.add_argument("--suites", default=cfg.get("suites", ""), help="只跑特定套件，逗号分隔 (如 injection,info_leak)")
    p_scan.add_argument("--max-tokens", type=int, default=cfg.get("max_tokens", 500))
    p_scan.add_argument("--workers", type=int, default=cfg.get("workers", 4), help="并行 API 调用数")
    p_scan.add_argument("--format", choices=["terminal", "json", "markdown"], default="terminal")
    p_scan.add_argument("--fail-below", type=float, default=cfg.get("fail_below", 0), metavar="SCORE",
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

    # history command
    p_hist = sub.add_parser("history", help="查看历史扫描记录")
    p_hist.add_argument("--limit", type=int, default=20, help="显示条数")

    # compare command
    p_cmp = sub.add_parser("compare", help="对比两次扫描结果")
    p_cmp.add_argument("run_a", help="第一次扫描的 run_id")
    p_cmp.add_argument("run_b", help="第二次扫描的 run_id")

    # mutate command
    p_mut = sub.add_parser("mutate", help="给套件生成变异样本，缓解样本过时/被针对性修补的问题")
    p_mut.add_argument("--suite", required=True, help="目标套件名 (如 injection)")
    p_mut.add_argument("--strategies", default="homoglyph,zero_width,reframe,synonym,base64",
                        help="变异策略，逗号分隔")
    p_mut.add_argument("-n", "--count", type=int, default=20, help="生成样本数")
    p_mut.add_argument("--seed", type=int, default=None, help="随机种子 (可复现)")

    args = parser.parse_args(argv)

    if args.command == "list":
        return _cmd_list()
    elif args.command == "history":
        return _cmd_history(args)
    elif args.command == "compare":
        return _cmd_compare(args)
    elif args.command == "mutate":
        return _cmd_mutate(args)
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
    # Validate model
    if not args.model:
        print("ERROR: --model 必填，或在 ~/.agent-redteam/config 中配置 model")
        return 2

    # Build target
    if args.target == "claude":
        target = ClaudeTarget(model=args.model, api_key=args.key, max_tokens=args.max_tokens)
    elif args.target == "zai":
        from .targets import ZaiTarget
        target = ZaiTarget(model=args.model or "glm-4-plus", api_key=args.key, max_tokens=args.max_tokens)
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

    # Save to database
    try:
        from .core.storage import save_report
        run_id = save_report(report)
    except Exception:
        run_id = "unknown"

    # Output (only for non-serve mode; serve mode shows in browser)
    if not args.serve:
        if args.format == "json":
            print(render_json(report))
        elif args.format == "markdown":
            print(render_markdown(report))
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


def _cmd_history(args) -> int:
    from .core.storage import list_scans
    scans = list_scans(limit=args.limit)
    if not scans:
        print("  暂无历史扫描记录")
        return 0

    print(f"\n  历史扫描记录 ({len(scans)} 条):\n")
    print(f"  {'Run ID':<35} {'Model':<20} {'Score':>6} {'P/F':>10} {'Date':<20}")
    print(f"  {'─'*35} {'─'*20} {'─'*6} {'─'*10} {'─'*20}")
    for s in scans:
        pf = f"{s['total_passed']}/{s['total_passed']+s['total_failed']}"
        sc = "\033[92m" if s["overall_score"] >= 80 else "\033[93m" if s["overall_score"] >= 50 else "\033[91m"
        print(f"  {s['run_id']:<35} {s['target_model']:<20} {sc}{s['overall_score']:>6.1f}\033[0m {pf:>10} {s['created_at']:<20}")
    print()
    return 0


def _cmd_compare(args) -> int:
    from .core.storage import compare_reports
    result = compare_reports(args.run_a, args.run_b)
    if not result:
        print(f"  找不到扫描记录: {args.run_a} 或 {args.run_b}")
        print(f"  运行 'agent-redteam history' 查看可用记录")
        return 1

    print(f"\n  ╔══════════════════════════════════════════════════╗")
    print(f"  ║          Scan Comparison Report                  ║")
    print(f"  ╠══════════════════════════════════════════════════╣")
    print(f"  ║  A: {result['model_a']:<16} Score: {result['score_a']:>5.1f}              ║")
    delta = result['score_delta']
    dc = "\033[92m" if delta > 0 else "\033[91m" if delta < 0 else ""
    print(f"  ║  B: {result['model_b']:<16} Score: {result['score_b']:>5.1f}              ║")
    print(f"  ║  Delta: {dc}{delta:+.1f}\033[0m{'':>37}║")
    print(f"  ╠══════════════════════════════════════════════════╣")

    for s in result["suites"]:
        d = s["delta"]
        c = "\033[92m" if d > 0 else "\033[91m" if d < 0 else "\033[0m"
        line = f"  ║  {s['suite']:<16} {s['score_a']:>5.1f} -> {s['score_b']:>5.1f}  {c}{s['trend']} {d:+.1f}\033[0m"
        pad = 52 - len(line) + len(c) * 5 + 5  # approximate padding
        print(f"{line}{' ' * max(1, pad)}║")

    print(f"  ╚══════════════════════════════════════════════════╝\n")
    return 0


def _cmd_mutate(args) -> int:
    from .suites import ALL_SUITES
    from .mutate import append_mutations, STRATEGIES

    suite_cls = next((s for s in ALL_SUITES if s.name == args.suite), None)
    if suite_cls is None:
        names = ", ".join(s.name for s in ALL_SUITES)
        print(f"ERROR: 未知套件 '{args.suite}'。可选: {names}")
        return 2

    strategies = [s.strip() for s in args.strategies.split(",") if s.strip()]
    unknown = [s for s in strategies if s not in STRATEGIES]
    if unknown:
        print(f"ERROR: 未知策略 {unknown}。可选: {list(STRATEGIES)}")
        return 2

    suite = suite_cls()
    data_path = suite.data_path()
    added = append_mutations(data_path, strategies, args.count, seed=args.seed)
    print(f"  已向 {args.suite}/data.jsonl 追加 {added} 条变异样本 (策略: {', '.join(strategies)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
