"""DeepSeek target — uses DeepSeek's OpenAI-compatible API.

Zero dependencies (stdlib urllib only). Works with deepseek-chat and
deepseek-reasoner models.
"""
from __future__ import annotations
import json, os, ssl, urllib.request
from .openai_compat import OpenAITarget

try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = None


class DeepSeekTarget(OpenAITarget):
    """DeepSeek target — extends OpenAITarget with DeepSeek defaults.

    DeepSeek's API is OpenAI-compatible, so we inherit send() logic.
    Only the defaults differ: base_url, env var, and reasoning_content
    handling for deepseek-reasoner.

    Args:
        model: Model ID (e.g. "deepseek-chat", "deepseek-reasoner")
        api_key: DeepSeek API key (or set DEEPSEEK_API_KEY env)
        max_tokens: Max response tokens
    """

    def __init__(
        self,
        model: str = "deepseek-chat",
        api_key: str = "",
        base_url: str = "https://api.deepseek.com/v1",
        max_tokens: int = 500,
    ):
        super().__init__(
            model=model,
            api_key=api_key or os.environ.get("DEEPSEEK_API_KEY", ""),
            base_url=base_url,
            max_tokens=max_tokens,
        )
        if not self.api_key:
            raise ValueError("API key required (api_key= or DEEPSEEK_API_KEY env)")
