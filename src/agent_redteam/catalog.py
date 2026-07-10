"""Built-in suite catalog inspection without running a scan."""
from __future__ import annotations

from collections import Counter
import json
from typing import Iterable

from .taxonomy import OWASP_2025_RISKS, PROJECT_SPECIFIC, TAXONOMY_ID


REQUIRED_SAMPLE_FIELDS = ("id", "owasp")


def build_catalog(suite_classes: Iterable[type] | None = None) -> dict:
    """Return a deterministic inventory and metadata validation summary.

    This intentionally inspects only bundled suite data.  It never creates a
    target or invokes the scanning engine, so it is safe to run in CI and when
    no provider credentials are available.
    """
    if suite_classes is None:
        from .suites import ALL_SUITES
        suite_classes = ALL_SUITES

    suites: list[dict] = []
    all_owasp: Counter[str] = Counter()
    all_severity: Counter[str] = Counter()
    issue_counts: Counter[str] = Counter()
    total_samples = 0
    non_owasp_samples = 0

    for suite_class in suite_classes:
        suite = suite_class()
        name = str(getattr(suite, "name", ""))
        expected_owasp = str(getattr(suite, "owasp", ""))
        issues: Counter[str] = Counter()
        severity: Counter[str] = Counter()
        sample_owasp: Counter[str] = Counter()
        decision: Counter[str] = Counter()
        try:
            samples = suite.load_samples()
        except Exception as exc:
            suites.append({
                "name": name,
                "owasp": expected_owasp,
                "description": str(getattr(suite, "description", "")),
                "multi_turn": bool(getattr(suite, "is_multiturn", False)),
                "samples": 0,
                "severity": {},
                "sample_owasp": {},
                "decision": {},
                "issues": {"load_error": 1},
                "valid": False,
            })
            issue_counts["load_error"] += 1
            continue

        if expected_owasp not in OWASP_2025_RISKS and expected_owasp != PROJECT_SPECIFIC:
            issues["unknown_suite_mapping"] += 1

        seen_ids: set[str] = set()
        for sample in samples:
            if not isinstance(sample, dict):
                issues["invalid_record"] += 1
                continue
            for field in REQUIRED_SAMPLE_FIELDS:
                if not str(sample.get(field, "")).strip():
                    issues[f"missing_{field}"] += 1
            sample_id = str(sample.get("id", "")).strip()
            if sample_id:
                if sample_id in seen_ids:
                    issues["duplicate_id"] += 1
                seen_ids.add(sample_id)
            value = str(sample.get("owasp", "")).strip()
            if value:
                if value in OWASP_2025_RISKS:
                    sample_owasp[value] += 1
                elif value == PROJECT_SPECIFIC:
                    non_owasp_samples += 1
                else:
                    issues["unknown_owasp"] += 1
                # Multi-turn scenarios deliberately span multiple OWASP areas;
                # their suite-level mapping is a primary label, not a constraint.
                if expected_owasp and value != expected_owasp and not bool(getattr(suite, "is_multiturn", False)):
                    issues["owasp_mismatch"] += 1
            raw_severity = sample.get("severity")
            if not raw_severity and isinstance(sample.get("gold"), dict):
                raw_severity = sample["gold"].get("risk")
            value = str(raw_severity or "").strip().lower()
            if value:
                severity[value] += 1
            else:
                issues["missing_severity"] += 1
            if isinstance(sample.get("gold"), dict):
                raw_decision = str(sample["gold"].get("decision", "")).strip().lower()
                if raw_decision:
                    decision[raw_decision] += 1

        if not samples:
            issues["empty_suite"] += 1
        total_samples += len(samples)
        all_owasp.update(sample_owasp)
        all_severity.update(severity)
        issue_counts.update(issues)
        suites.append({
            "name": name,
            "owasp": expected_owasp,
            "description": str(getattr(suite, "description", "")),
            "multi_turn": bool(getattr(suite, "is_multiturn", False)),
            "samples": len(samples),
            "severity": dict(sorted(severity.items())),
            "sample_owasp": dict(sorted(sample_owasp.items())),
            "decision": dict(sorted(decision.items())),
            "issues": dict(sorted(issues.items())),
            "valid": not issues,
        })

    suites.sort(key=lambda row: row["name"])
    return {
        "schema": "agent-redteam-suite-catalog/v1",
        "taxonomy": TAXONOMY_ID,
        "summary": {
            "suites": len(suites),
            "samples": total_samples,
            "owasp_categories": len(all_owasp),
            "multi_turn_suites": sum(1 for suite in suites if suite["multi_turn"]),
            "non_owasp_samples": non_owasp_samples,
            "invalid_suites": sum(1 for suite in suites if not suite["valid"]),
            "issue_counts": dict(sorted(issue_counts.items())),
        },
        "by_owasp": dict(sorted(all_owasp.items())),
        "uncovered_owasp": sorted(set(OWASP_2025_RISKS) - set(all_owasp)),
        "by_severity": dict(sorted(all_severity.items())),
        "suites": suites,
    }


def render_catalog_json(catalog: dict) -> str:
    return json.dumps(catalog, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def render_catalog_markdown(catalog: dict) -> str:
    summary = catalog["summary"]
    lines = [
        "# Agent Redteam Suite Catalog",
        "",
        f"Taxonomy: {catalog['taxonomy']}.",
        "",
        f"{summary['suites']} suites, {summary['samples']} samples, "
        f"{summary['owasp_categories']} OWASP categories.",
        "",
        "| Suite | OWASP | Samples | Mode | Decisions | Metadata |",
        "|---|---:|---:|---|---|---|",
    ]
    for suite in catalog["suites"]:
        mode = "multi-turn" if suite["multi_turn"] else "single-turn"
        metadata = "valid" if suite["valid"] else ", ".join(
            f"{key}: {value}" for key, value in suite["issues"].items()
        )
        decisions = ", ".join(
            f"{key}:{value}" for key, value in suite.get("decision", {}).items()
        ) or "-"
        lines.append(
            f"| {suite['name']} | {suite['owasp']} | {suite['samples']} | {mode} | {decisions} | {metadata} |"
        )
    if summary["issue_counts"]:
        lines.extend(["", "## Validation issues", ""])
        lines.extend(f"- `{key}`: {value}" for key, value in summary["issue_counts"].items())
    return "\n".join(lines) + "\n"


def render_catalog_terminal(catalog: dict) -> str:
    summary = catalog["summary"]
    lines = [
        f"\nSuite catalog: {summary['suites']} suites, {summary['samples']} samples, "
        f"{summary['owasp_categories']} OWASP categories ({catalog['taxonomy']})\n",
    ]
    for suite in catalog["suites"]:
        mode = "multi" if suite["multi_turn"] else "single"
        status = "OK" if suite["valid"] else "INVALID"
        decisions = ", ".join(
            f"{key}:{value}" for key, value in suite.get("decision", {}).items()
        )
        decision_text = f"  {decisions}" if decisions else ""
        lines.append(
            f"  {suite['name']:<18} {suite['owasp']:<6} {suite['samples']:>4} samples  {mode:<6} {status}{decision_text}"
        )
    if summary["issue_counts"]:
        details = ", ".join(f"{key}={value}" for key, value in summary["issue_counts"].items())
        lines.append(f"\nValidation issues: {details}")
    lines.append("")
    return "\n".join(lines)
