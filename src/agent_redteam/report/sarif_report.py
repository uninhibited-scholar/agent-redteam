"""GitHub-compatible SARIF 2.1.0 rendering for live and saved reports."""
from __future__ import annotations

import json
from typing import Any

from ..core.result import ScanReport, Verdict


_SEVERITY_TO_LEVEL = {
    "critical": "error",
    "high": "error",
    "medium": "warning",
    "low": "note",
}


def render_sarif(report: ScanReport) -> str:
    """Render SARIF from an in-memory scan report."""
    data = report.to_dict()
    data["samples"] = [
        sample.to_dict()
        for suite in report.suites
        for sample in suite.samples
    ]
    return render_sarif_dict(data)


def render_sarif_dict(report: dict[str, Any]) -> str:
    """Render SARIF from a saved JSON report without rerunning the target."""
    samples = report.get("samples", [])
    results = []
    rules: dict[str, dict[str, Any]] = {}

    for sample in samples:
        if str(sample.get("verdict", "")).lower() != Verdict.FAIL.value:
            continue

        suite = str(sample.get("suite", "unknown"))
        category = str(sample.get("category", ""))
        severity = str(sample.get("severity", "medium"))
        owasp = str(sample.get("owasp", ""))
        sample_id = str(sample.get("sample_id", "unknown"))
        rule_id = f"agent-redteam/{suite}/{category or 'default'}"

        if rule_id not in rules:
            owasp_label = owasp or "LLM??"
            rules[rule_id] = {
                "id": rule_id,
                "name": f"{suite}_{category}".replace("-", "_").replace(" ", "_"),
                "shortDescription": {
                    "text": f"Security test failure in {suite} ({owasp_label})"
                },
                "fullDescription": {
                    "text": (
                        f"The model failed this {severity} severity attack in the "
                        f"{suite} suite. Category: {category}. OWASP: {owasp_label}."
                    )
                },
                "helpUri": "https://github.com/uninhibited-scholar/agent-redteam#owasp-llm-top-10-coverage",
                "defaultConfiguration": {
                    "level": _SEVERITY_TO_LEVEL.get(severity, "warning"),
                },
                "properties": {
                    "tags": ["security", "llm", "red-team", owasp_label.lower()],
                    "precision": "high",
                },
            }

        response = str(sample.get("response", ""))[:300]
        question = str(sample.get("question", ""))[:200]
        results.append({
            "ruleId": rule_id,
            "level": _SEVERITY_TO_LEVEL.get(severity, "warning"),
            "message": {
                "text": (
                    f"[{sample_id}] {suite} — {severity.upper()}\n"
                    f"Attack: {question}\nResponse: {response}"
                ),
            },
            "locations": [{
                "physicalLocation": {
                    "artifactLocation": {
                        "uri": f"agent-redteam://samples/{suite}/{sample_id}",
                    },
                },
                "logicalLocations": [{
                    "name": suite,
                    "fullyQualifiedName": f"agent-redteam.suites.{suite}",
                }],
            }],
            "partialFingerprints": {
                "primaryLocationLineHash": f"{sample_id}:fail",
            },
            "properties": {
                "severity": severity,
                "owasp": owasp,
                "difficulty": sample.get("difficulty", ""),
                "tags": sample.get("tags", []),
                "sample_id": sample_id,
                "suite": suite,
                "category": category,
            },
        })

    total = _int(report.get("total_samples"), len(samples))
    passed = _int(report.get("total_passed"), _count(samples, Verdict.PASS.value))
    failed = _int(report.get("total_failed"), _count(samples, Verdict.FAIL.value))
    errors = _int(report.get("total_errors"), _count(samples, Verdict.ERROR.value))
    judged = _int(report.get("total_judged"), passed + failed)
    completion_rate = report.get(
        "completion_rate", round(100.0 * judged / total, 1) if total else 0.0
    )
    run_status = str(report.get(
        "run_status",
        "no_data" if total == 0 or judged == 0
        else "incomplete" if judged < total
        else "complete",
    ))

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
            "invocations": [{"executionSuccessful": run_status == "complete"}],
            "properties": {
                "overall_score": report.get("overall_score", 0),
                "total_samples": total,
                "total_passed": passed,
                "total_failed": failed,
                "total_errors": errors,
                "total_judged": judged,
                "completion_rate": completion_rate,
                "run_status": run_status,
                "target_model": report.get("target_model", "unknown"),
            },
        }],
    }
    return json.dumps(sarif, ensure_ascii=False, indent=2)


def _count(samples: list[dict[str, Any]], verdict: str) -> int:
    return sum(1 for sample in samples if str(sample.get("verdict", "")).lower() == verdict)


def _int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
