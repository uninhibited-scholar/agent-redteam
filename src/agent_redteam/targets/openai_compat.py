"""OpenAI-compatible target — works with OpenAI, DeepSeek, GLM, Doubao, local vLLM, etc.

Zero core dependencies (stdlib urllib only). Optionally uses certifi for SSL.
"""
from __future__ import annotations
import json, os, ssl, urllib.request
from .base import Target

try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = None


class OpenAITarget(Target):
    """OpenAI-compatible chat completion target.

    Args:
        model: Model ID (e.g. "gpt-4o", "glm-4-plus")
        api_key: API key (or set OPENAI_API_KEY env)
        base_url: API base URL (default: OpenAI)
        max_tokens: Max response tokens (default: 500)
    """

    def __init__(
        self,
        model: str,
        api_key: str = "",
        base_url: str = "https://api.openai.com/v1",
        max_tokens: int = 500,
    ):
        self.model = model
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.base_url = base_url.rstrip("/")
        self.max_tokens = max_tokens
        if not self.api_key:
            raise ValueError("API key required (api_key= or OPENAI_API_KEY env)")

    def send(self, messages: list[dict]) -> str:
        body = json.dumps({
            "model": self.model,
            "temperature": 0,
            "max_tokens": self.max_tokens,
            "messages": messages,
        }).encode()

        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )

        with urllib.request.urlopen(req, timeout=120, context=_SSL_CTX) as resp:
            data = json.loads(resp.read())
            content = data["choices"][0]["message"]["content"]
            # Fallback for thinking models where content may be in reasoning_content
            if not content:
                content = data["choices"][0]["message"].get("reasoning_content", "")
            return content or ""
