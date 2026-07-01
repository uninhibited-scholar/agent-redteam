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

    # list command
    sub.add_parser("list", help="列出可用的攻击套件")

    args = parser.parse_args(argv)

    if args.command == "list":
        return _cmd_list()
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

    # Progress callback
    total_done = [0]
    def on_result(r):
        total_done[0] += 1
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

    report = engine.scan(suites=suites, on_result=on_result)
    sys.stderr.write("\r" + " " * 60 + "\r")  # clear progress line

    # Output
    if args.format == "json":
        print(render_json(report))
    else:
        render_report(report)

    # CI gate
    if args.fail_below > 0 and report.overall_score < args.fail_below:
        print(f"\n❌ Score {report.overall_score} below threshold {args.fail_below}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
