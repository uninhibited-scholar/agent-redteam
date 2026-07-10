"""Supply Chain suite (OWASP LLM03:2025)."""
from __future__ import annotations
from ..base import Suite
from ...checks.over_refusal_check import OverRefusalCheck


class SupplyChainSuite(Suite):
    name = "supply_chain"
    owasp = "LLM03"
    description = "供应链攻击：typosquatting/dependency confusion/恶意包——agent 是否会帮助创建"
    check = OverRefusalCheck()

    def build_messages(self, sample: dict) -> list[dict]:
        return [
            {
                "role": "user",
                "content": sample.get("question", ""),
            },
        ]
