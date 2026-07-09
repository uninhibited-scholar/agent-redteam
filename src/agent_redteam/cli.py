"""CLI entry point — agent-redteam command."""
from __future__ import annotations
import argparse, os, sys

from .core.engine import Engine
from .targets import OpenAITarget, ClaudeTarget, LocalTarget
from .report import render_report, render_json, render_markdown, render_sarif
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
    p_scan.add_argument("--target", choices=["openai", "claude", "zai", "local", "ollama", "deepseek", "azure", "qwen"], default=cfg.get("target", "openai"),
                        help="目标类型 (openai兼容 / claude / zai智谱 / local本地 / ollama本地模型 / deepseek / azure / qwen通义)")
    p_scan.add_argument("--endpoint", default="", help="本地 agent endpoint (target=local 时使用)")
    p_scan.add_argument("--suites", default=cfg.get("suites", ""), help="只跑特定套件，逗号分隔 (如 injection,info_leak)")
    p_scan.add_argument("--max-tokens", type=int, default=cfg.get("max_tokens", 500))
    p_scan.add_argument("--workers", type=int, default=cfg.get("workers", 4), help="并行 API 调用数")
    p_scan.add_argument("--format", choices=["terminal", "json", "markdown", "sarif"], default="terminal",
                        help="输出格式（terminal=终端报告 / json=机器可读 / markdown=文档 / sarif=GitHub Security tab）")
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

    # doctor command
    p_doc = sub.add_parser("doctor", help="项目发布前自检：版本、文档、Action、验证数据、产物")
    p_doc.add_argument("--root", default="", help="项目根目录（默认自动检测）")
    p_doc.add_argument("--format", choices=["terminal", "json", "markdown"], default="terminal",
                       help="输出格式")
    p_doc.add_argument("--fail-on-warn", action="store_true",
                       help="存在 warning 时也返回非 0（发布流水线可用）")

    # attest command
    p_att = sub.add_parser("attest", help="从扫描 JSON 生成可复现、脱敏的 benchmark 证据卡")
    p_att.add_argument("report", help="scan --format json 生成的报告文件（允许前面混有日志）")
    p_att.add_argument("--format", choices=["json", "markdown"], default="markdown",
                       help="输出格式")
    p_att.add_argument("--max-failures", type=int, default=12,
                       help="证据卡中最多列出的失败样本数")
    p_att.add_argument("--include-pass-samples", action="store_true",
                       help="同时包含少量通过样本证据（默认只列失败样本）")
    p_att.add_argument("--snippet-chars", type=int, default=280,
                       help="问题/响应片段最大长度")

    # init command
    p_init = sub.add_parser("init", help="生成本地配置和首跑命令，让新用户 5 分钟上手")
    p_init.add_argument("--target", choices=["openai", "claude", "zai", "local", "ollama", "deepseek", "azure", "qwen"],
                        default="openai", help="要初始化的模型/Agent 类型")
    p_init.add_argument("--model", default="", help="模型 ID；留空则按 target 选择推荐默认值")
    p_init.add_argument("--base-url", default="", help="自定义 API base URL")
    p_init.add_argument("--api-key", default="", help="写入本地配置的 API key（输出时会自动脱敏）")
    p_init.add_argument("--suites", default="injection,info_leak,supply_chain",
                        help="首跑套件，默认选 3 个高信号套件")
    p_init.add_argument("--workers", type=int, default=4)
    p_init.add_argument("--max-tokens", type=int, default=500)
    p_init.add_argument("--fail-below", type=float, default=70)
    p_init.add_argument("--config-path", default="", help="配置文件路径，默认 ~/.agent-redteam/config")
    p_init.add_argument("--force", action="store_true", help="覆盖已有配置")
    p_init.add_argument("--dry-run", action="store_true", help="只预览，不写文件")
    p_init.add_argument("--format", choices=["terminal", "json", "markdown"], default="terminal",
                        help="输出格式")

    # ci command
    p_ci = sub.add_parser("ci", help="按策略评估扫描 JSON，输出 CI 门禁结果")
    p_ci.add_argument("report", nargs="?", help="scan --format json 生成的报告文件")
    p_ci.add_argument("--policy", default="", help="策略文件路径（默认内置策略）")
    p_ci.add_argument("--format", choices=["terminal", "json", "markdown"], default="terminal",
                      help="输出格式")
    p_ci.add_argument("--summary-file", default="", help="额外写出 Markdown summary 文件（适合 $GITHUB_STEP_SUMMARY）")
    p_ci.add_argument("--print-sample-policy", action="store_true", help="打印 .agent-redteam-policy.yml 模板")

    # report command
    p_report = sub.add_parser("report", help="从扫描 JSON 生成独立 HTML/Markdown 报告")
    p_report.add_argument("scan_json", help="scan --format json 生成的报告文件")
    p_report.add_argument("--format", choices=["html", "markdown"], default="html",
                          help="输出格式")
    p_report.add_argument("--output", "-o", default="", help="输出文件；留空则打印到 stdout")
    p_report.add_argument("--max-failures", type=int, default=25,
                          help="报告中最多包含的失败证据数量")
    p_report.add_argument("--snippet-chars", type=int, default=420,
                          help="问题/响应片段最大长度")

    # review command
    p_review = sub.add_parser("review", help="从扫描 JSON 导出人工复核队列")
    p_review.add_argument("scan_json", help="scan --format json 生成的报告文件")
    p_review.add_argument("--format", choices=["jsonl", "markdown"], default="jsonl",
                          help="输出格式")
    p_review.add_argument("--output", "-o", default="", help="输出文件；留空则打印到 stdout")
    p_review.add_argument("--verdict", choices=["fail", "error", "all"], default="fail",
                          help="导出哪些样本供人工复核")
    p_review.add_argument("--max-records", type=int, default=0,
                          help="最多导出多少条；0 表示不限")
    p_review.add_argument("--snippet-chars", type=int, default=700,
                          help="问题/响应片段最大长度")

    # evidence command
    p_evidence = sub.add_parser("evidence", help="为 validation 目录生成可复现证据索引")
    p_evidence.add_argument("--root", default="validation", help="验证产物目录")
    p_evidence.add_argument("--format", choices=["markdown", "json"], default="markdown",
                            help="输出格式")
    p_evidence.add_argument("--output", "-o", default="", help="输出文件；留空则打印到 stdout")
    p_evidence.add_argument("--no-documents", action="store_true", help="不索引 Markdown 叙事报告")
    p_evidence.add_argument("--max-reports", type=int, default=0,
                            help="最多索引多少个 scan JSON；0 表示不限")

    # release-check command
    p_release = sub.add_parser("release-check", help="本地发布前门禁：doctor、测试、前端、evidence、产物")
    p_release.add_argument("--root", default="", help="项目根目录（默认自动检测）")
    p_release.add_argument("--format", choices=["terminal", "json", "markdown"], default="terminal",
                           help="输出格式")
    p_release.add_argument("--skip-tests", action="store_true", help="跳过 pytest")
    p_release.add_argument("--skip-frontend", action="store_true", help="跳过全部前端检查")
    p_release.add_argument("--skip-build", action="store_true", help="跳过前端生产构建")
    p_release.add_argument("--skip-evidence", action="store_true", help="跳过 validation evidence 索引检查")
    p_release.add_argument("--skip-artifacts", action="store_true", help="跳过 dist wheel/sdist 存在性检查")
    p_release.add_argument("--strict-warnings", action="store_true", help="doctor warning 也视为失败")
    p_release.add_argument("--timeout", type=int, default=300, help="每个外部命令的超时时间（秒）")

    args = parser.parse_args(argv)

    if args.command == "list":
        return _cmd_list()
    elif args.command == "history":
        return _cmd_history(args)
    elif args.command == "compare":
        return _cmd_compare(args)
    elif args.command == "mutate":
        return _cmd_mutate(args)
    elif args.command == "doctor":
        return _cmd_doctor(args)
    elif args.command == "attest":
        return _cmd_attest(args)
    elif args.command == "init":
        return _cmd_init(args)
    elif args.command == "ci":
        return _cmd_ci(args)
    elif args.command == "report":
        return _cmd_report(args)
    elif args.command == "review":
        return _cmd_review(args)
    elif args.command == "evidence":
        return _cmd_evidence(args)
    elif args.command == "release-check":
        return _cmd_release_check(args)
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
    elif args.target == "ollama":
        from .targets import OllamaTarget
        # Ollama: completely ignore config/args base_url (it's for cloud APIs).
        # Only respect a localhost/private URL if explicitly passed.
        ollama_base = "http://localhost:11434"
        if args.base_url and ("localhost" in args.base_url or "127.0.0.1" in args.base_url):
            ollama_base = args.base_url
        target = OllamaTarget(model=args.model or "llama3", base_url=ollama_base, max_tokens=args.max_tokens)
    elif args.target == "deepseek":
        from .targets import DeepSeekTarget
        target = DeepSeekTarget(model=args.model or "deepseek-chat", api_key=args.key, max_tokens=args.max_tokens)
    elif args.target == "azure":
        from .targets import AzureTarget
        endpoint = args.base_url if args.base_url != "https://api.openai.com/v1" else ""
        if not args.model:
            print("ERROR: --model (deployment name) required for azure target")
            return 2
        target = AzureTarget(deployment=args.model, endpoint=endpoint, api_key=args.key, max_tokens=args.max_tokens)
    elif args.target == "qwen":
        from .targets import QwenTarget
        target = QwenTarget(model=args.model or "qwen-plus", api_key=args.key, max_tokens=args.max_tokens)
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
        elif args.format == "sarif":
            print(render_sarif(report))
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


def _cmd_doctor(args) -> int:
    from .project_audit import (
        audit_project,
        render_audit_json,
        render_audit_markdown,
        render_audit_terminal,
    )

    report = audit_project(args.root or None)
    if args.format == "json":
        print(render_audit_json(report))
    elif args.format == "markdown":
        print(render_audit_markdown(report))
    else:
        print(render_audit_terminal(report))

    if report.failed:
        return 1
    if args.fail_on_warn and report.warned:
        return 1
    return 0


def _cmd_attest(args) -> int:
    from .attest import (
        AttestationOptions,
        attest_report,
        render_attestation_json,
        render_attestation_markdown,
    )

    try:
        attestation = attest_report(
            args.report,
            AttestationOptions(
                max_failures=args.max_failures,
                include_pass_samples=args.include_pass_samples,
                snippet_chars=args.snippet_chars,
            ),
        )
    except Exception as exc:
        print(f"ERROR: failed to generate attestation: {exc}", file=sys.stderr)
        return 1

    if args.format == "json":
        print(render_attestation_json(attestation))
    else:
        print(render_attestation_markdown(attestation))
    return 0


def _cmd_init(args) -> int:
    from .onboarding import (
        InitOptions,
        initialize_project,
        render_init_json,
        render_init_markdown,
        render_init_terminal,
    )

    result = initialize_project(
        InitOptions(
            target=args.target,
            model=args.model,
            base_url=args.base_url,
            api_key=args.api_key,
            suites=args.suites,
            workers=args.workers,
            max_tokens=args.max_tokens,
            fail_below=args.fail_below,
            config_path=args.config_path,
            force=args.force,
            dry_run=args.dry_run,
        )
    )

    if args.format == "json":
        print(render_init_json(result))
    elif args.format == "markdown":
        print(render_init_markdown(result))
    else:
        print(render_init_terminal(result))

    if result.warnings and not result.written and not result.dry_run:
        return 1
    return 0


def _cmd_ci(args) -> int:
    from .ci_policy import (
        evaluate_report,
        render_policy_json,
        render_policy_markdown,
        render_policy_terminal,
        sample_policy,
    )

    if args.print_sample_policy:
        print(sample_policy())
        return 0
    if not args.report:
        print("ERROR: report file is required unless --print-sample-policy is used", file=sys.stderr)
        return 2

    try:
        result = evaluate_report(args.report, args.policy or None)
    except Exception as exc:
        print(f"ERROR: failed to evaluate CI policy: {exc}", file=sys.stderr)
        return 1

    markdown = render_policy_markdown(result)
    if args.summary_file:
        try:
            with open(args.summary_file, "w", encoding="utf-8") as f:
                f.write(markdown)
        except OSError as exc:
            print(f"ERROR: failed to write summary file: {exc}", file=sys.stderr)
            return 1

    if args.format == "json":
        print(render_policy_json(result))
    elif args.format == "markdown":
        print(markdown)
    else:
        print(render_policy_terminal(result))

    return 0 if result.passed else 1


def _cmd_report(args) -> int:
    from .html_report import build_report, render_report_html, render_report_markdown

    try:
        report = build_report(
            args.scan_json,
            max_failures=args.max_failures,
            snippet_chars=args.snippet_chars,
        )
        content = render_report_html(report) if args.format == "html" else render_report_markdown(report)
    except Exception as exc:
        print(f"ERROR: failed to generate report: {exc}", file=sys.stderr)
        return 1

    if args.output:
        try:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(content)
        except OSError as exc:
            print(f"ERROR: failed to write report: {exc}", file=sys.stderr)
            return 1
        print(f"Wrote {args.format} report: {args.output}")
    else:
        print(content)
    return 0


def _cmd_review(args) -> int:
    from .review import (
        build_review_records,
        render_review_jsonl,
        render_review_markdown,
        summarize_review_records,
    )

    try:
        records = build_review_records(
            args.scan_json,
            verdict=args.verdict,
            max_records=args.max_records,
            snippet_chars=args.snippet_chars,
        )
        content = render_review_jsonl(records) if args.format == "jsonl" else render_review_markdown(records)
    except Exception as exc:
        print(f"ERROR: failed to build review queue: {exc}", file=sys.stderr)
        return 1

    if args.output:
        try:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(content)
        except OSError as exc:
            print(f"ERROR: failed to write review queue: {exc}", file=sys.stderr)
            return 1
        summary = summarize_review_records(records)
        print(f"Wrote {args.format} review queue: {args.output} ({summary['total']} records)")
    else:
        print(content, end="" if content.endswith("\n") else "\n")
    return 0


def _cmd_evidence(args) -> int:
    from .evidence import (
        EvidenceOptions,
        build_evidence_index,
        render_evidence_json,
        render_evidence_markdown,
        write_evidence_index,
    )

    try:
        index = build_evidence_index(
            args.root,
            EvidenceOptions(
                include_documents=not args.no_documents,
                max_reports=args.max_reports,
            ),
        )
        content = render_evidence_json(index) if args.format == "json" else render_evidence_markdown(index)
    except Exception as exc:
        print(f"ERROR: failed to build evidence index: {exc}", file=sys.stderr)
        return 1

    if args.output:
        try:
            write_evidence_index(index, args.output, args.format)
        except OSError as exc:
            print(f"ERROR: failed to write evidence index: {exc}", file=sys.stderr)
            return 1
        summary = index["summary"]
        print(
            f"Wrote {args.format} evidence index: {args.output} "
            f"({summary['reports']} reports, {summary.get('auxiliary', 0)} auxiliary, "
            f"{summary['documents']} docs, {summary['skipped']} skipped)"
        )
    else:
        print(content)
    return 0


def _cmd_release_check(args) -> int:
    from .project_audit import default_project_root
    from .release_gate import (
        ReleaseCheckOptions,
        render_release_gate_json,
        render_release_gate_markdown,
        render_release_gate_terminal,
        run_release_gate,
    )

    root = args.root or default_project_root()
    result = run_release_gate(
        root,
        ReleaseCheckOptions(
            skip_tests=args.skip_tests,
            skip_frontend=args.skip_frontend,
            skip_build=args.skip_build,
            skip_evidence=args.skip_evidence,
            skip_artifacts=args.skip_artifacts,
            strict_warnings=args.strict_warnings,
            timeout_seconds=args.timeout,
        ),
    )

    if args.format == "json":
        print(render_release_gate_json(result))
    elif args.format == "markdown":
        print(render_release_gate_markdown(result))
    else:
        print(render_release_gate_terminal(result))
    return 0 if result.passed else 1


if __name__ == "__main__":
    sys.exit(main())
