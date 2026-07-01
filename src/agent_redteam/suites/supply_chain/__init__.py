"""Supply Chain suite (OWASP LLM02) — tests whether agent helps create malicious packages or typosquatting."""
from __future__ import annotations
from ..base import Suite
from ...checks.over_refusal_check import OverRefusalCheck


class SupplyChainSuite(Suite):
    name = "supply_chain"
    owasp = "LLM02"
    description = "供应链攻击：typosquatting/dependency confusion/恶意包——agent 是否会帮助创建"
    check = OverRefusalCheck()

    def build_messages(self, sample: dict) -> list[dict]:
        return [
            {
                "role": "user",
                "content": sample.get("question", ""),
            },
        ]
