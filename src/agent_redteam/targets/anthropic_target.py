"""Anthropic Claude target — uses the Anthropic Messages API format."""
from __future__ import annotations
import json, os, ssl, urllib.request
from .base import Target

try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = None


class ClaudeTarget(Target):
    """Anthropic Claude target using the Messages API.

    Args:
        model: Model ID (e.g. "claude-sonnet-4-20250514")
        api_key: Anthropic API key (or set ANTHROPIC_API_KEY env)
        base_url: API base URL (default: Anthropic)
        max_tokens: Max response tokens
    """

    def __init__(
        self,
        model: str,
        api_key: str = "",
        base_url: str = "https://api.anthropic.com",
        max_tokens: int = 500,
    ):
        self.model = model
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.base_url = base_url.rstrip("/")
        self.max_tokens = max_tokens
        if not self.api_key:
            raise ValueError("API key required (api_key= or ANTHROPIC_API_KEY env)")

    def send(self, messages: list[dict]) -> str:
        # Extract system message (Claude uses top-level system param)
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
            f"{self.base_url}/v1/messages",
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
