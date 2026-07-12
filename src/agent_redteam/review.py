"""Human review export for scan reports.

The scanner can produce false positives and ambiguous failures. This module
turns failed samples into review records that a human can mark as
true_positive, false_positive, or needs_review without re-running the scan.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Any, Literal

from .attest import _fenced_block, _markdown_text, _sample_evidence, load_report


ReviewVerdict = Literal["fail", "error", "all"]


@dataclass
class ReviewRecord:
    review_status: str
    reviewer: str
    notes: str
    suite: str
    sample_id: str
    category: str
    difficulty: str
    severity: str
    owasp: str
    tags: list[str]
    model_verdict: str
    question_snippet: str
    expected_snippet: str
    response_snippet: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_review_records(
    path: str | Path,
    *,
    verdict: ReviewVerdict = "fail",
    max_records: int = 0,
    snippet_chars: int = 700,
) -> list[ReviewRecord]:
    report, _ = load_report(path)
    samples = report.get("samples") if isinstance(report.get("samples"), list) else []
    selected = [_sample for _sample in samples if _include_sample(_sample, verdict)]
    if max_records > 0:
        selected = selected[:max_records]
    return [_record_from_sample(sample, snippet_chars) for sample in selected]


def render_review_jsonl(records: list[ReviewRecord]) -> str:
    return "\n".join(json.dumps(r.to_dict(), ensure_ascii=False) for r in records) + ("\n" if records else "")


def render_review_markdown(records: list[ReviewRecord]) -> str:
    lines = [
        "# Agent Redteam Human Review Queue",
        "",
        "Set `review_status` to one of: `true_positive`, `false_positive`, `needs_review`.",
        "",
        f"Total records: {len(records)}",
        "",
    ]
    for idx, record in enumerate(records, 1):
        lines.extend([
            f"## {idx}. {_markdown_text(record.sample_id)} — {_markdown_text(record.suite)}",
            "",
            f"- **Review status:** `{_markdown_text(record.review_status)}`",
            f"- **Reviewer:** `{_markdown_text(record.reviewer)}`",
            f"- **Notes:** {_markdown_text(record.notes) if record.notes else '_none_'}",
            f"- **Model verdict:** `{_markdown_text(record.model_verdict)}`",
            f"- **Severity:** `{_markdown_text(record.severity)}`",
            f"- **OWASP:** `{_markdown_text(record.owasp)}`",
            f"- **Category:** `{_markdown_text(record.category)}`",
            f"- **Tags:** {', '.join(_markdown_text(tag) for tag in record.tags) if record.tags else 'none'}",
            "",
            "### Question",
            "",
            *_fenced_block(record.question_snippet),
            "",
            "### Expected",
            "",
            *_fenced_block(record.expected_snippet),
            "",
            "### Response",
            "",
            *_fenced_block(record.response_snippet),
            "",
        ])
    return "\n".join(lines)


def summarize_review_records(records: list[ReviewRecord]) -> dict[str, Any]:
    by_severity: dict[str, int] = {}
    by_suite: dict[str, int] = {}
    for record in records:
        by_severity[record.severity] = by_severity.get(record.severity, 0) + 1
        by_suite[record.suite] = by_suite.get(record.suite, 0) + 1
    return {
        "total": len(records),
        "by_severity": dict(sorted(by_severity.items(), key=lambda kv: (-kv[1], kv[0]))),
        "by_suite": dict(sorted(by_suite.items(), key=lambda kv: (-kv[1], kv[0]))),
    }


def _record_from_sample(sample: dict[str, Any], snippet_chars: int) -> ReviewRecord:
    evidence = _sample_evidence(sample, snippet_chars)
    return ReviewRecord(
        review_status="needs_review",
        reviewer="",
        notes="",
        suite=evidence["suite"],
        sample_id=evidence["sample_id"],
        category=evidence["category"],
        difficulty=evidence["difficulty"],
        severity=evidence["severity"],
        owasp=evidence["owasp"],
        tags=evidence["tags"],
        model_verdict=str(sample.get("verdict", "")),
        question_snippet=evidence["question_snippet"],
        expected_snippet=evidence["expected_snippet"],
        response_snippet=evidence["response_snippet"],
    )


def _include_sample(sample: dict[str, Any], verdict: ReviewVerdict) -> bool:
    if verdict == "all":
        return True
    return str(sample.get("verdict", "")).lower() == verdict
