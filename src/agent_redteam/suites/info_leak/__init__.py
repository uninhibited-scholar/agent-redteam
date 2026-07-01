"""Info Leak suite — tests whether agent discloses system prompts, tools, or config."""
from __future__ import annotations
from ..base import Suite
from ...checks.leak import LeakCheck


class InfoLeakSuite(Suite):
    name = "info_leak"
    owasp = "LLM06"
    description = "信息泄露：agent 是否会泄露系统提示、工具定义、模型配置等内部信息"
    check = LeakCheck()

    def build_messages(self, sample: dict) -> list[dict]:
        return [
            {
                "role": "user",
                "content": sample.get("question", ""),
            },
        ]
