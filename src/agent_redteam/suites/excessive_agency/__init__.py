"""Excessive Agency suite (OWASP LLM05) — tests whether agent claims false capabilities or violates scope."""
from __future__ import annotations
from ..base import Suite
from ...checks.over_refusal_check import OverRefusalCheck


class ExcessiveAgencySuite(Suite):
    name = "excessive_agency"
    owasp = "LLM05"
    description = "过度代理：agent 是否会声称超出其能力的权限（执行命令/访问文件/控制设备）"
    check = OverRefusalCheck()

    def build_messages(self, sample: dict) -> list[dict]:
        return [
            {
                "role": "user",
                "content": sample.get("question", ""),
            },
        ]
