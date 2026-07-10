"""Generate reproducible benchmark attestations from scan JSON.

The attestation is a compact evidence card: it hashes the raw report, extracts
score/suite/failure summaries, redacts common secrets, and emits JSON or
Markdown that can be attached to releases, benchmark posts, or CI artifacts.
"""
from __future__ import annotations

from dataclasses import dataclass
import datetime as _dt
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from . import __version__


SECRET_PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9_\-]{16,}"), "sk-[REDACTED]"),
    (re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?[^'\"\s,;}]+"), r"\1=[REDACTED]"),
    (re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]+"), "Bearer [REDACTED]"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.DOTALL), "[REDACTED PRIVATE KEY]"),
    (re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"), "[REDACTED_EMAIL]"),
]


@dataclass
class AttestationOptions:
    max_failures: int = 12
    include_pass_samples: bool = False
    snippet_chars: int = 280


def load_report(path: str | Path) -> tuple[dict[str, Any], bytes]:
    raw = Path(path).read_bytes()
    text = raw.decode("utf-8", errors="replace")
    return _extract_json_object(text), raw


def attest_report(path: str | Path, options: AttestationOptions | None = None) -> dict[str, Any]:
    opts = options or AttestationOptions()
    report, raw = load_report(path)
    samples = _as_list(report.get("samples"))
    suites = _as_list(report.get("suites"))
    failed = [s for s in samples if str(s.get("verdict", "")).lower() == "fail"]
    errors = [s for s in samples if str(s.get("verdict", "")).lower() == "error"]
    passes = [s for s in samples if str(s.get("verdict", "")).lower() == "pass"]

    suite_rows = []
    for suite in suites:
        suite_rows.append({
            "name": suite.get("name", ""),
            "score": suite.get("score", 0),
            "passed": suite.get("passed", 0),
            "failed": suite.get("failed", 0),
            "errors": suite.get("errors", 0),
            "total": suite.get("total", 0),
        })

    suite_rows.sort(key=lambda s: (_number(s.get("score"), 0), -_number(s.get("failed"), 0)))
    failures = [_sample_evidence(s, opts.snippet_chars) for s in _rank_failures(failed)[:opts.max_failures]]
    pass_samples = []
    if opts.include_pass_samples:
        pass_samples = [_sample_evidence(s, opts.snippet_chars) for s in passes[:opts.max_failures]]

    canonical = _canonical_public_report(report)
    raw_sha = hashlib.sha256(raw).hexdigest()
    canonical_sha = hashlib.sha256(json.dumps(canonical, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
    run_id = _run_id(report, raw_sha)

    return {
        "schema": "agent-redteam-attestation/v1",
        "run_id": run_id,
        "generated_at": _dt.datetime.now(_dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "generator": {
            "name": "agent-redteam",
            "version": __version__,
        },
        "source": {
            "path": str(path),
            "raw_sha256": raw_sha,
            "canonical_sha256": canonical_sha,
            "json_was_extracted": _raw_has_prefix(raw),
        },
        "target": {
            "model": report.get("target_model", ""),
            "started_at": report.get("started_at", ""),
            "finished_at": report.get("finished_at", ""),
        },
        "score": {
            "overall": report.get("overall_score", 0),
            "total_samples": report.get("total_samples", len(samples)),
            "passed": report.get("total_passed", len(passes)),
            "failed": report.get("total_failed", len(failed)),
            "errors": len(errors),
            "decision_metrics": report.get("decision_metrics", {"available": False}),
        },
        "suite_breakdown": suite_rows,
        "risk_summary": _risk_summary(failed),
        "top_failures": failures,
        "pass_evidence": pass_samples,
        "limitations": [
            "Scores are point-in-time results and can vary with model sampling, provider changes, and prompt routing.",
            "The attestation hashes the source report, but it does not prove the target provider or model identity.",
            "Response snippets are redacted and truncated for safer publication.",
        ],
    }


def render_attestation_json(attestation: dict[str, Any]) -> str:
    return json.dumps(attestation, ensure_ascii=False, indent=2)


def render_attestation_markdown(attestation: dict[str, Any]) -> str:
    score = attestation["score"]
    target = attestation["target"]
    source = attestation["source"]
    lines = [
        f"# Agent Redteam Attestation — {target.get('model') or 'unknown model'}",
        "",
        f"- **Run ID:** `{attestation['run_id']}`",
        f"- **Overall Score:** {score['overall']}/100",
        f"- **Samples:** {score['total_samples']} total, {score['passed']} passed, {score['failed']} failed, {score['errors']} errors",
        f"- **Started:** {target.get('started_at') or 'unknown'}",
        f"- **Finished:** {target.get('finished_at') or 'unknown'}",
        f"- **Raw SHA-256:** `{source['raw_sha256']}`",
        f"- **Canonical SHA-256:** `{source['canonical_sha256']}`",
        "",
        "## Suite Breakdown",
        "",
        "| Suite | Score | Passed | Failed | Errors | Total |",
        "|-------|------:|-------:|-------:|-------:|------:|",
    ]
    for suite in attestation["suite_breakdown"]:
        lines.append(
            f"| {suite['name']} | {suite['score']} | {suite['passed']} | "
            f"{suite['failed']} | {suite['errors']} | {suite['total']} |"
        )

    metrics = score.get("decision_metrics", {})
    if metrics.get("available"):
        lines.extend([
            "",
            "## Decision Balance",
            "",
            f"- **Block recall:** {metrics.get('block_recall')}/100",
            f"- **Allow acceptance:** {metrics.get('allow_acceptance')}/100",
            f"- **Balanced score:** {metrics.get('balanced_score')}/100",
        ])

    lines.extend(["", "## Risk Summary", "", "| Field | Count |", "|-------|------:|"])
    for key, value in attestation["risk_summary"].items():
        if isinstance(value, dict):
            for child, count in value.items():
                lines.append(f"| {key}.{child} | {count} |")
        else:
            lines.append(f"| {key} | {value} |")

    if attestation["top_failures"]:
        lines.extend(["", "## Top Failure Evidence", ""])
        for item in attestation["top_failures"]:
            lines.extend([
                f"### {item['sample_id']} — {item['suite']} ({item['severity']})",
                "",
                f"- **Category:** {item['category']}",
                f"- **OWASP:** {item['owasp']}",
                f"- **Tags:** {', '.join(item['tags']) if item['tags'] else 'none'}",
                "",
                "**Question snippet**",
                "",
                "```text",
                item["question_snippet"],
                "```",
                "",
                "**Response snippet**",
                "",
                "```text",
                item["response_snippet"],
                "```",
                "",
            ])

    lines.extend([
        "## Limitations",
        "",
    ])
    for limitation in attestation["limitations"]:
        lines.append(f"- {limitation}")
    lines.append("")
    return "\n".join(lines)


def _extract_json_object(text: str) -> dict[str, Any]:
    decoder = json.JSONDecoder()
    starts = [m.start() for m in re.finditer(r"\{", text)]
    for start in starts:
        try:
            obj, _ = decoder.raw_decode(text[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and ("suites" in obj or "samples" in obj or "overall_score" in obj):
            return obj
    raise ValueError("No scan report JSON object found")


def _sample_evidence(sample: dict[str, Any], limit: int) -> dict[str, Any]:
    return {
        "suite": _redact(str(sample.get("suite", ""))),
        "sample_id": _redact(str(sample.get("sample_id", ""))),
        "category": _redact(str(sample.get("category", ""))),
        "difficulty": _redact(str(sample.get("difficulty", ""))),
        "severity": _redact(str(sample.get("severity", ""))),
        "owasp": _redact(str(sample.get("owasp", ""))),
        "tags": [_redact(str(tag)) for tag in _as_list(sample.get("tags"))],
        "question_snippet": _snippet(sample.get("question", ""), limit),
        "expected_snippet": _snippet(sample.get("expected", ""), limit),
        "response_snippet": _snippet(sample.get("response", ""), limit),
    }


def _rank_failures(samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return sorted(
        samples,
        key=lambda s: (
            severity_rank.get(str(s.get("severity", "")).lower(), 4),
            str(s.get("suite", "")),
            str(s.get("sample_id", "")),
        ),
    )


def _risk_summary(failed: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "failed_total": len(failed),
        "by_suite": _counts(failed, "suite"),
        "by_severity": _counts(failed, "severity"),
        "by_owasp": _counts(failed, "owasp"),
    }


def _counts(samples: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for sample in samples:
        value = _redact(str(sample.get(key, "") or "unknown"))
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))


def _canonical_public_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "target_model": report.get("target_model", ""),
        "started_at": report.get("started_at", ""),
        "finished_at": report.get("finished_at", ""),
        "overall_score": report.get("overall_score", 0),
        "total_samples": report.get("total_samples", 0),
        "total_passed": report.get("total_passed", 0),
        "total_failed": report.get("total_failed", 0),
        "suites": report.get("suites", []),
        "sample_verdicts": [
            {
                "suite": s.get("suite", ""),
                "sample_id": s.get("sample_id", ""),
                "verdict": s.get("verdict", ""),
                "severity": s.get("severity", ""),
                "owasp": s.get("owasp", ""),
            }
            for s in _as_list(report.get("samples"))
        ],
    }


def _run_id(report: dict[str, Any], raw_sha: str) -> str:
    model = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(report.get("target_model", "model")).strip()) or "model"
    started = re.sub(r"[^0-9T]+", "", str(report.get("started_at", "")))[:15] or raw_sha[:12]
    return f"{model}-{started}-{raw_sha[:8]}"


def _snippet(value: Any, limit: int) -> str:
    text = _redact(str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)].rstrip() + "..."


def _redact(text: str) -> str:
    redacted = text
    for pattern, repl in SECRET_PATTERNS:
        redacted = pattern.sub(repl, redacted)
    return redacted


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _number(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _raw_has_prefix(raw: bytes) -> bool:
    stripped = raw.lstrip()
    return not stripped.startswith(b"{")
