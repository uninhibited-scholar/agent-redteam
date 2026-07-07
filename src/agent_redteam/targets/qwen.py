"""Qwen (通义千问) target — Alibaba Cloud's DashScope OpenAI-compatible API.

Zero dependencies (stdlib urllib only). Works with qwen-turbo, qwen-plus,
qwen-max, and qwen-long models.
"""
from __future__ import annotations
import json, os, ssl, urllib.request
from .openai_compat import OpenAITarget


class QwenTarget(OpenAITarget):
    """Qwen / DashScope target — extends OpenAITarget with Qwen defaults.

    Alibaba's DashScope API is OpenAI-compatible at /compatible-mode/v1.
    Models: qwen-turbo (fast), qwen-plus (balanced), qwen-max (best),
    qwen-long (long context).

    Args:
        model: Model ID (e.g. "qwen-plus", "qwen-max")
        api_key: DashScope API key (or set DASHSCOPE_API_KEY env)
        max_tokens: Max response tokens
    """

    def __init__(
        self,
        model: str = "qwen-plus",
        api_key: str = "",
        base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1",
        max_tokens: int = 500,
    ):
        super().__init__(
            model=model,
            api_key=api_key or os.environ.get("DASHSCOPE_API_KEY", ""),
            base_url=base_url,
            max_tokens=max_tokens,
        )
        if not self.api_key:
            raise ValueError("API key required (api_key= or DASHSCOPE_API_KEY env)")
