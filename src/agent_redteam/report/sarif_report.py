"""SARIF report — GitHub Security tab compatible output (SARIF v2.1.0).

Generates a SARIF file that GitHub can ingest via `github/codeql-action/upload-sarif`.
Each failed sample becomes a "result" (security finding) with location info.
"""
from __future__ import annotations
import json
from ..core.result import ScanReport, Verdict


# SARIF severity mapping: our severity → SARIF level
_SEVERITY_TO_LEVEL = {
    "critical": "error",
    "high": "error",
    "medium": "warning",
    "low": "note",
}


def render_sarif(report: ScanReport) -> str:
    """Return a SARIF v2.1.0 JSON string for GitHub Security tab.

    Each failed sample becomes a result. Passing samples are not reported
    (SARIF only surfaces issues, not successes).
    """
    results = []
    rules = {}

    for suite in report.suites:
        for sample in suite.samples:
            if sample.verdict != Verdict.FAIL:
                continue  # Only report failures

            # Build a unique rule ID per suite+category
            rule_id = f"agent-redteam/{suite.name}/{sample.category or 'default'}"

            # Register rule metadata if not seen
            if rule_id not in rules:
                owasp = sample.owasp or "LLM??"
                rules[rule_id] = {
                    "id": rule_id,
                    "name": f"{suite.name}_{sample.category}".replace("-", "_").replace(" ", "_"),
                    "shortDescription": {
                        "text": f"Security test failure in {suite.name} ({owasp})"
                    },
                    "fullDescription": {
                        "text": f"The model failed this {sample.severity} severity attack "
                                f"in the {suite.name} suite. Category: {sample.category}. "
                                f"OWASP: {owasp}."
                    },
                    "helpUri": "https://github.com/uninhibited-scholar/agent-redteam#owasp-llm-top-10-coverage",
                    "defaultConfiguration": {
                        "level": _SEVERITY_TO_LEVEL.get(sample.severity, "warning"),
                    },
                    "properties": {
                        "tags": ["security", "llm", "red-team", owasp.lower()],
                        "precision": "high",
                    },
                }

            # Truncate response for the message (SARIF messages shouldn't be huge)
            resp_preview = (sample.response or "")[:300]
            question_preview = (sample.question or "")[:200]

            results.append({
                "ruleId": rule_id,
                "level": _SEVERITY_TO_LEVEL.get(sample.severity, "warning"),
                "message": {
                    "text": (
                        f"[{sample.sample_id}] {suite.name} — {sample.severity.upper()}\n"
                        f"Attack: {question_preview}\n"
                        f"Response: {resp_preview}"
                    ),
                },
                # SARIF requires a location; we use a synthetic artifact
                # since there's no source file — the "file" is the sample data.
                "locations": [{
                    "physicalLocation": {
                        "artifactLocation": {
                            "uri": f"agent-redteam://samples/{suite.name}/{sample.sample_id}",
                        },
                    },
                    "logicalLocations": [{
                        "name": suite.name,
                        "fullyQualifiedName": f"agent-redteam.suites.{suite.name}",
                    }],
                }],
                "partialFingerprints": {
                    "primaryLocationLineHash": f"{sample.sample_id}:{sample.verdict.value}",
                },
                "properties": {
                    "severity": sample.severity,
                    "owasp": sample.owasp or "",
                    "difficulty": sample.difficulty,
                    "tags": sample.tags,
                    "sample_id": sample.sample_id,
                    "suite": suite.name,
                    "category": sample.category,
                },
            })

    sarif = {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {
                "driver": {
                    "name": "agent-redteam",
                    "version": "0.3.0",
                    "informationUri": "https://github.com/uninhibited-scholar/agent-redteam",
                    "shortDescription": {
                        "text": "AI Agent red-team security scanner — OWASP LLM Top 10 coverage"
                    },
                    "rules": list(rules.values()),
                },
            },
            "results": results,
            # Summary as run-level property
            "properties": {
                "overall_score": report.overall_score,
                "total_samples": report.total_samples,
                "total_passed": report.total_passed,
                "total_failed": report.total_failed,
                "target_model": report.target_model,
            },
        }],
    }

    return json.dumps(sarif, ensure_ascii=False, indent=2)
