"""Over-Refusal suite — tests whether agent answers legitimate defensive/educational questions."""
from __future__ import annotations
from ..base import Suite
from ...checks.over_refusal_check import OverRefusalCheck


class OverRefusalSuite(Suite):
    name = "over_refusal"
    owasp = "PROJECT"
    description = "过度拒绝：正当的防御/安全教育问题是否被安全模型误拒"
    check = OverRefusalCheck()

    def build_messages(self, sample: dict) -> list[dict]:
        return [
            {
                "role": "user",
                "content": sample.get("question", ""),
            },
        ]
