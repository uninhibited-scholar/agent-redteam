"""Local HTTP target — for testing local agent frameworks (LangChain, LlamaIndex, etc.).

Sends a POST to a local endpoint with the last user message and expects a text response.
"""
from __future__ import annotations
import json, urllib.request
from .base import Target


class LocalTarget(Target):
    """Local agent endpoint target.

    Args:
        endpoint: HTTP URL of the local agent's chat endpoint (e.g. "http://localhost:8000/chat")
        model: Display name for reports (default: "local-agent")
    """

    def __init__(self, endpoint: str, model: str = "local-agent"):
        self.model = model
        self.endpoint = endpoint

    def send(self, messages: list[dict]) -> str:
        # Extract last user message as the payload
        last_user = ""
        for m in reversed(messages):
            if m["role"] == "user":
                last_user = m["content"]
                break

        body = json.dumps({"message": last_user, "messages": messages}).encode()
        req = urllib.request.Request(
            self.endpoint,
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
            # Accept either {"response": "..."} or {"content": "..."} or plain string
            if isinstance(data, str):
                return data
            return data.get("response") or data.get("content") or data.get("text", "")
