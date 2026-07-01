"""JSON report — machine-readable output for CI/CD integration."""
from __future__ import annotations
import json
from ..core.result import ScanReport


def render_json(report: ScanReport) -> str:
    """Return a JSON string of the full scan report."""
    data = report.to_dict()
    data["samples"] = []
    for suite in report.suites:
        for s in suite.samples:
            d = s.to_dict()
            d["suite_score"] = suite.score
            data["samples"].append(d)
    return json.dumps(data, ensure_ascii=False, indent=2)
