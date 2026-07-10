"""Lint CI policy and waiver configuration without requiring a scan report."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import datetime as _dt
import json
import re
from pathlib import Path
from typing import Any

from .attest import _redact
from .ci_policy import DEFAULT_POLICY, load_policy
from .waivers import DEFAULT_MAX_WAIVER_DAYS, Waiver, load_waivers


KNOWN_POLICY_KEYS = set(DEFAULT_POLICY)


@dataclass
class LintFinding:
    rule: str
    status: str
    detail: str


@dataclass
class PolicyLintResult:
    passed: bool
    policy_path: str
    waivers_path: str
    findings: list[LintFinding]
    summary: dict[str, int]

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["policy_path"] = _redact(self.policy_path)
        data["waivers_path"] = _redact(self.waivers_path)
        data["findings"] = [asdict(finding) for finding in self.findings]
        return data


def lint_policy_files(
    policy_path: str | Path | None = None,
    waivers_path: str | Path | None = None,
    *,
    max_waiver_days: int | None = None,
    today: _dt.date | None = None,
) -> PolicyLintResult:
    findings: list[LintFinding] = []
    policy = _lint_policy(findings, policy_path)
    effective_max_waiver_days = max_waiver_days
    if effective_max_waiver_days is None:
        effective_max_waiver_days = int(_number(policy.get("max_waiver_days"), DEFAULT_MAX_WAIVER_DAYS))
    _lint_waivers(findings, waivers_path, max_waiver_days=effective_max_waiver_days, today=today)
    summary = {
        "pass": sum(1 for finding in findings if finding.status == "pass"),
        "warn": sum(1 for finding in findings if finding.status == "warn"),
        "fail": sum(1 for finding in findings if finding.status == "fail"),
    }
    return PolicyLintResult(
        passed=summary["fail"] == 0,
        policy_path=str(policy_path or ""),
        waivers_path=str(waivers_path or ""),
        findings=findings,
        summary=summary,
    )


def render_policy_lint_json(result: PolicyLintResult) -> str:
    return json.dumps(result.to_dict(), ensure_ascii=False, indent=2)


def render_policy_lint_terminal(result: PolicyLintResult) -> str:
    lines = [
        "",
        "Agent Redteam Policy Lint",
        f"Status: {'PASS' if result.passed else 'FAIL'}",
        f"Findings: {result.summary['pass']} pass, {result.summary['warn']} warn, {result.summary['fail']} fail",
        "",
    ]
    for finding in result.findings:
        lines.append(f"[{finding.status.upper():<4}] {_redact(finding.rule)}: {_redact(finding.detail)}")
    lines.append("")
    return "\n".join(lines)


def render_policy_lint_markdown(result: PolicyLintResult) -> str:
    lines = [
        "## Agent Redteam Policy Lint",
        "",
        f"**Status:** {'PASS' if result.passed else 'FAIL'}",
        "",
        "| Status | Rule | Detail |",
        "|--------|------|--------|",
    ]
    for finding in result.findings:
        lines.append(f"| {finding.status.upper()} | {_cell(finding.rule)} | {_cell(finding.detail)} |")
    lines.append("")
    return "\n".join(lines)


def write_policy_lint(result: PolicyLintResult, output: str | Path, fmt: str) -> None:
    body = render_policy_lint_json(result) if fmt == "json" else render_policy_lint_markdown(result)
    Path(output).write_text(body + ("\n" if not body.endswith("\n") else ""), encoding="utf-8")


def _lint_policy(findings: list[LintFinding], policy_path: str | Path | None) -> dict[str, Any]:
    try:
        policy = load_policy(policy_path)
    except Exception as exc:
        findings.append(LintFinding("policy.load", "fail", _redact(str(exc))))
        return dict(DEFAULT_POLICY)

    source = "built-in defaults" if not policy_path else _redact(str(policy_path))
    findings.append(LintFinding("policy.load", "pass", f"loaded {source}"))
    unknown = _unknown_policy_keys(policy_path)
    if unknown:
        findings.append(LintFinding("policy.known_keys", "warn", f"unknown key(s): {', '.join(_redact(k) for k in unknown)}"))
    else:
        findings.append(LintFinding("policy.known_keys", "pass", "no unknown policy keys"))

    _range_check(findings, "policy.fail_below", _number(policy.get("fail_below"), -1), 0, 100)
    _min_check(findings, "policy.max_critical_failures", _number(policy.get("max_critical_failures"), -1), 0)
    _min_check(findings, "policy.max_high_failures", _number(policy.get("max_high_failures"), -1), 0)
    _min_check(findings, "policy.max_waiver_days", _number(policy.get("max_waiver_days"), -1), 1)
    if isinstance(policy.get("allow_errors"), bool):
        findings.append(LintFinding("policy.allow_errors", "pass", "boolean"))
    else:
        findings.append(LintFinding("policy.allow_errors", "fail", "must be true or false"))
    return policy


def _lint_waivers(
    findings: list[LintFinding],
    waivers_path: str | Path | None,
    *,
    max_waiver_days: int,
    today: _dt.date | None,
) -> None:
    if not waivers_path:
        findings.append(LintFinding("waivers.load", "pass", "no waiver file configured"))
        return
    try:
        waivers = load_waivers(waivers_path)
    except Exception as exc:
        findings.append(LintFinding("waivers.load", "fail", _redact(str(exc))))
        return
    findings.append(LintFinding("waivers.load", "pass", f"loaded {len(waivers)} waiver(s)"))
    today_value = today or _dt.datetime.now(_dt.UTC).date()
    latest_allowed = today_value + _dt.timedelta(days=max_waiver_days)
    seen: set[tuple[str, str]] = set()
    invalid = 0
    expired = 0
    too_far = 0
    duplicates = 0
    for waiver in waivers:
        problems = _waiver_required_problems(waiver)
        expiry = _parse_date(waiver.expires)
        if waiver.key in seen:
            duplicates += 1
        seen.add(waiver.key)
        if expiry is None and waiver.expires:
            problems.append("invalid expires date")
        if problems:
            invalid += 1
            continue
        if expiry is not None and expiry < today_value:
            expired += 1
            continue
        if expiry is not None and expiry > latest_allowed:
            too_far += 1
    findings.append(_count_finding("waivers.valid", invalid, "invalid waiver(s)", fail=True))
    findings.append(_count_finding("waivers.expired", expired, "expired waiver(s)", fail=True))
    findings.append(_count_finding("waivers.horizon", too_far, f"waiver(s) beyond max_waiver_days {max_waiver_days}", fail=True))
    findings.append(_count_finding("waivers.duplicates", duplicates, "duplicate waiver key(s)", fail=False))


def _unknown_policy_keys(policy_path: str | Path | None) -> list[str]:
    if not policy_path:
        return []
    text = Path(policy_path).read_text(encoding="utf-8")
    keys = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*:", stripped)
        if match:
            keys.append(match.group(1))
    return sorted(k for k in set(keys) if k not in KNOWN_POLICY_KEYS)


def _waiver_required_problems(waiver: Waiver) -> list[str]:
    problems = []
    if not waiver.suite:
        problems.append("missing suite")
    if not waiver.sample_id:
        problems.append("missing sample_id")
    if not waiver.owner:
        problems.append("missing owner")
    if not waiver.reason:
        problems.append("missing reason")
    if not waiver.expires:
        problems.append("missing expires")
    return problems


def _range_check(findings: list[LintFinding], rule: str, value: float, minimum: float, maximum: float) -> None:
    status = "pass" if minimum <= value <= maximum else "fail"
    findings.append(LintFinding(rule, status, f"{value:g} observed, expected {minimum:g}..{maximum:g}"))


def _min_check(findings: list[LintFinding], rule: str, value: float, minimum: float) -> None:
    status = "pass" if value >= minimum else "fail"
    findings.append(LintFinding(rule, status, f"{value:g} observed, expected >= {minimum:g}"))


def _count_finding(rule: str, count: int, label: str, *, fail: bool) -> LintFinding:
    status = "fail" if fail and count else "warn" if count else "pass"
    detail = f"{count} {label}"
    return LintFinding(rule, status, detail)


def _parse_date(value: str) -> _dt.date | None:
    try:
        return _dt.date.fromisoformat(value)
    except ValueError:
        return None


def _number(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _cell(value: str) -> str:
    return _redact(str(value)).replace("|", "\\|").replace("\n", " ")
