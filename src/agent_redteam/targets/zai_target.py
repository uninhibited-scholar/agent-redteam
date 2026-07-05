"""Z.ai (智谱) Anthropic-compatible target.

Uses the z.ai/api/anthropic endpoint with Anthropic Messages API format.
Automatically detects and uses system HTTP proxy (needed for some networks).
"""
from __future__ import annotations
import json, os, ssl, urllib.request
from .base import Target

try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = None


def _detect_proxy() -> urllib.request.ProxyHandler | None:
    """Detect system HTTP proxy from env or common ports."""
    # Check env vars
    for var in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        val = os.environ.get(var, "")
        if val:
            return urllib.request.ProxyHandler({"http": val, "https": val})
    # Check common local proxy ports
    for port in (7897, 7890, 1087, 8080):
        try:
            import socket
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.1)
            s.connect(("127.0.0.1", port))
            s.close()
            return urllib.request.ProxyHandler({
                "http": f"http://127.0.0.1:{port}",
                "https": f"http://127.0.0.1:{port}",
            })
        except (OSError, ConnectionRefusedError):
            continue
    return None


class ZaiTarget(Target):
    """Z.ai Anthropic-compatible target.

    Args:
        model: Model ID (e.g. "GLM-5.2", "glm-4-plus")
        api_key: Z.ai API key
        base_url: Z.ai API base URL
        max_tokens: Max response tokens
        proxy: Optional proxy URL (auto-detected if not specified)
    """

    def __init__(
        self,
        model: str = "GLM-5.2",
        api_key: str = "",
        base_url: str = "https://api.z.ai/api/anthropic",
        max_tokens: int = 500,
        proxy: str = "",
    ):
        self.model = model
        self.api_key = api_key or os.environ.get("ZAI_API_KEY", "")
        self.base_url = base_url.rstrip("/")
        self.max_tokens = max_tokens
        if not self.api_key:
            raise ValueError("API key required (api_key= or ZAI_API_KEY env)")

        # Build opener with optional proxy
        handlers = []
        if proxy:
            handlers.append(urllib.request.ProxyHandler({
                "http": proxy, "https": proxy,
            }))
        else:
            detected = _detect_proxy()
            if detected:
                handlers.append(detected)
        if _SSL_CTX:
            handlers.append(urllib.request.HTTPSHandler(context=_SSL_CTX))
        self._opener = urllib.request.build_opener(*handlers) if handlers else None

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
            f"{self.base_url}/v1/messages",
            data=body,
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
        )

        opener = self._opener or urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=_SSL_CTX) if _SSL_CTX
            else urllib.request.HTTPSHandler()
        )
        with opener.open(req, timeout=120) as resp:
            data = json.loads(resp.read())
            blocks = data.get("content", [])
            return " ".join(b.get("text", "") for b in blocks if b.get("type") == "text")
