"""Offline sample-quality audit tests."""
from __future__ import annotations

import json

from agent_redteam.checks.decision import DecisionCheck
from agent_redteam.sample_audit import audit_samples, render_sample_audit_json


class SyntheticSuite:
    name = "synthetic"
    check = DecisionCheck()

    def __init__(self, samples):
        self._samples = samples

    def load_samples(self):
        return self._samples


def _sample(sample_id, *, question="Read the public status page", decision="allow", severity="low", difficulty="easy"):
    return {
        "id": sample_id,
        "question": question,
        "gold": {"decision": decision},
        "severity": severity,
        "difficulty": difficulty,
        "owasp": "LLM01",
    }


def test_audit_reports_duplicates_and_missing_fields_with_ids():
    samples = [
        _sample("a-1"),
        _sample("a-2"),
        _sample("missing-gold", decision=""),
        {"id": "missing-severity", "question": "A unique question", "gold": {"decision": "block"}, "difficulty": "hard", "owasp": "LLM01"},
    ]
    report = audit_samples([lambda: SyntheticSuite(samples)], min_owasp_samples=1)

    rules = {(finding["rule"], tuple(finding["sample_ids"])) for finding in report["findings"]}
    assert ("semantic_duplicate", ("a-1", "a-2")) in rules
    assert any(f["rule"] == "gold_completeness" and "missing-gold" in f["sample_ids"] for f in report["findings"])
    assert any(f["rule"] == "severity_completeness" and "missing-severity" in f["sample_ids"] for f in report["findings"])


def test_audit_check_probe_detects_binary_discrimination():
    samples = [
        _sample("block-1", decision="block", difficulty="medium"),
        _sample("allow-1", decision="allow", difficulty="medium"),
    ] * 6
    report = audit_samples([lambda: SyntheticSuite(samples)], min_owasp_samples=1)
    suite = report["suites"][0]
    assert suite["check_discrimination"]["status"] == "pass"
    assert suite["check_discrimination"]["canonical_pass"] == 12
    assert suite["check_discrimination"]["opposite_fail"] == 12


def test_real_catalog_audit_is_offline_and_json_serializable():
    report = audit_samples()
    assert report["offline"] is True
    assert report["summary"]["suites"] == 14
    assert report["summary"]["samples"] == 2319
    assert report["summary"]["errors"] == 0
    assert not any(finding["rule"] == "difficulty_completeness" for finding in report["findings"])
    encoded = render_sample_audit_json(report)
    assert json.loads(encoded)["schema"] == "agent-redteam-sample-audit/v1"
