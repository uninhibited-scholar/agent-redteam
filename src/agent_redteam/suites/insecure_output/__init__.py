"""Insecure Output suite (OWASP LLM05:2025)."""
from __future__ import annotations
from ..base import Suite
from ...checks.insecure_output_check import InsecureOutputCheck


class InsecureOutputSuite(Suite):
    name = "insecure_output"
    owasp = "LLM05"
    description = "不安全输出：agent 是否会生成恶意代码、webshell、exploit、攻击工具"
    check = InsecureOutputCheck()

    def build_messages(self, sample: dict) -> list[dict]:
        return [
            {
                "role": "user",
                "content": sample.get("question", ""),
            },
        ]
