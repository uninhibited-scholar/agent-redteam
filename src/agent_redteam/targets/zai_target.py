"""Z.ai (智谱) Anthropic-compatible target.

Uses the z.ai/api/anthropic endpoint with Anthropic Messages API format.
This endpoint has separate billing from open.bigmodel.cn OpenAI endpoint.
"""
from __future__ import annotations
import json, os, ssl, urllib.request
from .base import Target

try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = None


class ZaiTarget(Target):
    """Z.ai Anthropic-compatible target.

    Args:
        model: Model ID (e.g. "glm-4-plus", "glm-5.2")
        api_key: Z.ai API key
        base_url: Z.ai API base URL (default: https://api.z.ai/api/anthropic)
        max_tokens: Max response tokens
    """

    def __init__(
        self,
        model: str = "glm-4.5",
        api_key: str = "",
        base_url: str = "https://zcode.z.ai/api/v1/zcode-plan/anthropic",
        max_tokens: int = 500,
    ):
        self.model = model
        self.api_key = api_key or os.environ.get("ZAI_API_KEY", "")
        self.base_url = base_url.rstrip("/")
        self.max_tokens = max_tokens
        if not self.api_key:
            raise ValueError("API key required (api_key= or ZAI_API_KEY env)")

    def send(self, messages: list[dict]) -> str:
        # Extract system message (Anthropic uses top-level system param)
        system = ""
        user_msgs = []
        for m in messages:
            if m["role"] == "system":
                system += m["content"] + "\n"
            else:
                user_msgs.append(m)

        body = json.dumps({
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": system.strip() if system else None,
            "messages": user_msgs,
        }).encode()

        req = urllib.request.Request(
            f"{self.base_url}/messages",
            data=body,
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
        )

        with urllib.request.urlopen(req, timeout=120, context=_SSL_CTX) as resp:
            data = json.loads(resp.read())
            blocks = data.get("content", [])
            return " ".join(b.get("text", "") for b in blocks if b.get("type") == "text")
