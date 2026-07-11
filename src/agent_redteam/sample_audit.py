"""Offline quality audit for bundled attack samples.

The audit is deliberately heuristic: it reports suspicious patterns for a
human to review and never mutates suite data or invokes a target model.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import difflib
import json
import re
from typing import Any, Iterable

from .core.result import Verdict
from .taxonomy import OWASP_2025_RISKS, PROJECT_SPECIFIC


DEFAULT_MIN_OWASP_SAMPLES = 20
_DIFFICULTIES = ("easy", "medium", "hard")
_SEVERITIES = ("critical", "high", "medium", "low")
_GOLD_KEYS = ("decision", "action", "risk", "answer", "verdict")
_IGNORED_TEXT_KEYS = {"id", "gold", "severity", "difficulty", "owasp", "tags", "metadata"}


def audit_samples(
    suite_classes: Iterable[type] | None = None,
    *,
    min_owasp_samples: int = DEFAULT_MIN_OWASP_SAMPLES,
    similarity_threshold: float = 0.92,
    max_duplicate_pairs: int = 200,
) -> dict[str, Any]:
    """Return a deterministic, offline quality report for suite data."""
    if suite_classes is None:
        from .suites import ALL_SUITES
        suite_classes = ALL_SUITES

    findings: list[dict[str, Any]] = []
    suite_rows: list[dict[str, Any]] = []
    all_samples: list[tuple[str, dict[str, Any]]] = []
    owasp_counts: Counter[str] = Counter()
    total_samples = 0

    for suite_class in suite_classes:
        suite = suite_class()
        name = str(getattr(suite, "name", ""))
        try:
            samples = suite.load_samples()
        except Exception as exc:
            findings.append(_finding("load_error", "error", name, [], f"could not load samples: {exc}"))
            suite_rows.append({"name": name, "samples": 0, "load_error": str(exc)})
            continue

        total_samples += len(samples)
        for sample in samples:
            if isinstance(sample, dict):
                all_samples.append((name, sample))
                value = str(sample.get("owasp", "")).strip()
                if value:
                    owasp_counts[value] += 1

        suite_rows.append(_audit_suite(name, suite, samples, findings))

    duplicate_pairs = _find_duplicate_pairs(
        all_samples,
        threshold=similarity_threshold,
        max_pairs=max_duplicate_pairs,
    )
    for pair in duplicate_pairs:
        findings.append(_finding(
            "semantic_duplicate", "warning", pair["suite"], pair["sample_ids"],
            f"similarity {pair['similarity']:.3f} exceeds threshold {similarity_threshold:.3f}",
        ))

    missing_categories = [
        category for category in OWASP_2025_RISKS
        if owasp_counts.get(category, 0) < min_owasp_samples
    ]
    for category in missing_categories:
        findings.append(_finding(
            "owasp_coverage", "warning", "", [],
            f"{category} has {owasp_counts.get(category, 0)} samples; minimum is {min_owasp_samples}",
        ))

    errors = sum(1 for finding in findings if finding["status"] == "error")
    warnings = sum(1 for finding in findings if finding["status"] == "warning")
    return {
        "schema": "agent-redteam-sample-audit/v1",
        "offline": True,
        "thresholds": {
            "min_owasp_samples": min_owasp_samples,
            "similarity": similarity_threshold,
            "max_duplicate_pairs": max_duplicate_pairs,
        },
        "summary": {
            "suites": len(suite_rows),
            "samples": total_samples,
            "duplicate_pairs": len(duplicate_pairs),
            "errors": errors,
            "warnings": warnings,
            "passed": errors == 0,
        },
        "by_owasp": dict(sorted(owasp_counts.items())),
        "uncovered_owasp": missing_categories,
        "suites": sorted(suite_rows, key=lambda row: row["name"]),
        "findings": findings,
    }


def render_sample_audit_json(report: dict[str, Any]) -> str:
    """Render an audit report without exposing sample contents."""
    return json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _audit_suite(
    name: str,
    suite: Any,
    samples: list[Any],
    findings: list[dict[str, Any]],
) -> dict[str, Any]:
    valid = [sample for sample in samples if isinstance(sample, dict)]
    difficulty = Counter(str(sample.get("difficulty", "")).strip().lower() for sample in valid)
    severity = Counter(_severity_value(sample) for sample in valid)
    owasp = Counter(str(sample.get("owasp", "")).strip() for sample in valid)
    gold = Counter(_gold_label(sample) for sample in valid)
    missing_gold = [str(sample.get("id", "")) for sample in valid if not _gold_complete(sample)]
    missing_severity = [str(sample.get("id", "")) for sample in valid if _severity_value(sample) not in _SEVERITIES]
    missing_difficulty = [str(sample.get("id", "")) for sample in valid if str(sample.get("difficulty", "")).strip().lower() not in _DIFFICULTIES]

    if missing_gold:
        findings.append(_finding("gold_completeness", "error", name, missing_gold, "missing gold or recognized expected outcome"))
    if missing_severity:
        findings.append(_finding("severity_completeness", "error", name, missing_severity, "missing or invalid severity"))
    if missing_difficulty:
        findings.append(_finding("difficulty_completeness", "warning", name, missing_difficulty, "missing or invalid difficulty"))

    if len(valid) >= 50:
        _check_distribution(name, "difficulty_balance", difficulty, _DIFFICULTIES, findings)
        _check_distribution(name, "severity_balance", severity, _SEVERITIES, findings)

    discrimination = _probe_check(suite, valid)
    if discrimination.get("status") in {"warning", "error"}:
        findings.append(_finding(
            "check_discrimination", discrimination["status"], name, [], discrimination["detail"],
        ))

    return {
        "name": name,
        "samples": len(samples),
        "difficulty": dict(sorted(difficulty.items())),
        "severity": dict(sorted(severity.items())),
        "owasp": dict(sorted(owasp.items())),
        "gold_outcomes": dict(sorted(gold.items())),
        "gold_complete": not missing_gold,
        "severity_complete": not missing_severity,
        "difficulty_complete": not missing_difficulty,
        "check_discrimination": discrimination,
    }


def _check_distribution(
    suite: str,
    rule: str,
    counts: Counter[str],
    expected: tuple[str, ...],
    findings: list[dict[str, Any]],
) -> None:
    total = sum(counts.values())
    if not total:
        return
    dominant, dominant_count = counts.most_common(1)[0]
    if dominant_count / total > 0.8:
        findings.append(_finding(
            rule, "warning", suite, [],
            f"{dominant} represents {dominant_count}/{total} ({dominant_count / total:.1%})",
        ))


def _gold_complete(sample: dict[str, Any]) -> bool:
    gold = sample.get("gold")
    if isinstance(gold, dict) and gold:
        return bool(str(sample.get("label", "")).strip() or any(str(gold.get(key, "")).strip() for key in _GOLD_KEYS))
    # Multi-turn and multimodal suites encode expected failure signals rather
    # than a single gold decision. Treat those explicit rules as gold data.
    return bool(
        "fail_if_contains" in sample
        or sample.get("success_keywords")
        or sample.get("fail_if_acknowledges")
        or "expect_refuse" in sample
    )


def _severity_value(sample: dict[str, Any]) -> str:
    explicit = str(sample.get("severity", "")).strip().lower()
    if explicit:
        return explicit
    gold = sample.get("gold")
    if isinstance(gold, dict):
        return str(gold.get("risk", "")).strip().lower()
    return ""


def _gold_label(sample: dict[str, Any]) -> str:
    gold = sample.get("gold")
    if not isinstance(gold, dict) or not gold:
        if sample.get("fail_if_contains"):
            return "rules:fail_if_contains"
        if sample.get("success_keywords"):
            return "rules:success_keywords"
        if sample.get("fail_if_acknowledges") or "expect_refuse" in sample:
            return "rules:response_policy"
        return "<missing>"
    for key in ("decision", "action", "answer", "verdict", "risk"):
        value = str(gold.get(key, "")).strip().lower()
        if value:
            return f"{key}:{value}"
    return "<unclassified>"


def _probe_check(suite: Any, samples: list[dict[str, Any]]) -> dict[str, Any]:
    """Run conservative synthetic probes to expose an always-pass/fail check."""
    check = getattr(suite, "check", None)
    if check is None or not samples:
        return {"status": "not_applicable", "tested": 0, "reason": "suite has no check or samples"}
    canonical_pass = 0
    opposite_fail = 0
    tested = 0
    for sample in samples:
        canonical, opposite = _probe_responses(sample)
        if canonical is None or opposite is None:
            continue
        try:
            good = check.evaluate(canonical, sample)
            bad = check.evaluate(opposite, sample)
        except Exception:
            continue
        tested += 1
        canonical_pass += good == Verdict.PASS
        opposite_fail += bad == Verdict.FAIL
    if tested < 10:
        return {"status": "not_applicable", "tested": tested, "reason": "fewer than 10 compatible synthetic probes"}
    if canonical_pass == 0:
        return {"status": "warning", "tested": tested, "canonical_pass": canonical_pass, "opposite_fail": opposite_fail, "detail": "no canonical probe passed; check may be too strict or its probe is incompatible"}
    if opposite_fail == 0:
        return {"status": "warning", "tested": tested, "canonical_pass": canonical_pass, "opposite_fail": opposite_fail, "detail": "no opposite probe failed; check may be non-discriminating"}
    return {"status": "pass", "tested": tested, "canonical_pass": canonical_pass, "opposite_fail": opposite_fail}


def _probe_responses(sample: dict[str, Any]) -> tuple[Any, Any] | tuple[None, None]:
    gold = sample.get("gold") if isinstance(sample.get("gold"), dict) else {}
    decision = str(gold.get("decision", "")).strip().lower()
    if decision:
        opposite = "allow" if decision == "block" else "block" if decision == "allow" else None
        if opposite is None:
            return None, None
        return json.dumps({"decision": decision}), json.dumps({"decision": opposite})
    action = str(gold.get("action", "")).strip().lower()
    if action in {"refuse", "answer"}:
        if action == "refuse":
            return "I can't help with that request.", "Here is the requested content and an implementation."
        return "Here is a safe, defensive explanation.", "I can't help with that request."
    return None, None


def _find_duplicate_pairs(
    samples: list[tuple[str, dict[str, Any]]],
    *,
    threshold: float,
    max_pairs: int,
) -> list[dict[str, Any]]:
    normalized = [_normalized_text(sample) for _, sample in samples]
    token_sets = [set(re.findall(r"[\w]+", text, flags=re.UNICODE)) for text in normalized]
    inverted: defaultdict[str, list[int]] = defaultdict(list)
    for index, tokens in enumerate(token_sets):
        for token in tokens:
            if len(token) >= 3:
                inverted[token].append(index)
    candidates: set[tuple[int, int]] = set()
    for indexes in inverted.values():
        if len(indexes) > 80:
            continue
        for left, first in enumerate(indexes):
            for second in indexes[left + 1:]:
                candidates.add((min(first, second), max(first, second)))

    pairs: list[dict[str, Any]] = []
    for first, second in sorted(candidates):
        if not normalized[first] or not normalized[second]:
            continue
        union = token_sets[first] | token_sets[second]
        jaccard = len(token_sets[first] & token_sets[second]) / len(union) if union else 0.0
        if jaccard < threshold - 0.08:
            continue
        similarity = difflib.SequenceMatcher(None, normalized[first], normalized[second]).ratio()
        if similarity >= threshold:
            left_suite, left_sample = samples[first]
            right_suite, right_sample = samples[second]
            pairs.append({
                "suite": left_suite if left_suite == right_suite else f"{left_suite},{right_suite}",
                "sample_ids": [str(left_sample.get("id", "")), str(right_sample.get("id", ""))],
                "similarity": round(similarity, 4),
            })
            if len(pairs) >= max_pairs:
                break
    return pairs


def _normalized_text(sample: dict[str, Any]) -> str:
    values: list[str] = []

    def visit(value: Any, key: str = "") -> None:
        if key in _IGNORED_TEXT_KEYS:
            return
        if isinstance(value, dict):
            for child_key, child_value in value.items():
                visit(child_value, str(child_key))
        elif isinstance(value, list):
            for child in value:
                visit(child, key)
        elif isinstance(value, str):
            values.append(value)

    visit(sample)
    return " ".join(re.findall(r"[\w]+", " ".join(values).lower(), flags=re.UNICODE))


def _finding(rule: str, status: str, suite: str, sample_ids: list[str], detail: str) -> dict[str, Any]:
    return {
        "rule": rule,
        "status": status,
        "suite": suite,
        "sample_ids": sample_ids,
        "detail": detail,
    }
