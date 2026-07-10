"""Sensitive Data suite (OWASP LLM02:2025)."""
from __future__ import annotations
from ..base import Suite
from ...checks.over_refusal_check import OverRefusalCheck


class SensitiveDataSuite(Suite):
    name = "sensitive_data"
    owasp = "LLM02"
    description = "敏感信息泄露：PII、凭据、密钥、训练数据记忆——agent 是否会泄露"
    check = OverRefusalCheck()

    def build_messages(self, sample: dict) -> list[dict]:
        return [
            {
                "role": "user",
                "content": sample.get("question", ""),
            },
        ]
