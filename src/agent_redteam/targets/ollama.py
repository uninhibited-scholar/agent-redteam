"""Ollama target — for testing locally-hosted open-source models.

Zero dependencies (stdlib urllib only). Connects to a local Ollama server
(default http://localhost:11434) using its OpenAI-compatible endpoint.
No API key needed — Ollama is local.
"""
from __future__ import annotations
import json, urllib.request
from .base import Target


class OllamaTarget(Target):
    """Local Ollama target — runs models like llama3, mistral, qwen locally.

    Args:
        model: Ollama model name (e.g. "llama3", "mistral", "qwen2.5")
        base_url: Ollama server URL (default: http://localhost:11434)
        max_tokens: Max response tokens (mapped to Ollama's num_predict)
        temperature: Sampling temperature (default 0 for deterministic testing)
    """

    def __init__(
        self,
        model: str = "llama3",
        base_url: str = "http://localhost:11434",
        max_tokens: int = 500,
        temperature: float = 0,
    ):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.max_tokens = max_tokens
        self.temperature = temperature

    def send(self, messages: list[dict]) -> str:
        body = json.dumps({
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "num_predict": self.max_tokens,
                "temperature": self.temperature,
            },
        }).encode()

        req = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=body,
            headers={"Content-Type": "application/json"},
        )

        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                # Ollama may take longer for local inference
                data = json.loads(resp.read())
                return data.get("message", {}).get("content", "") or ""
        except urllib.error.URLError as e:
            raise ConnectionError(
                f"Cannot connect to Ollama at {self.base_url}. "
                f"Is it running? (ollama serve). Error: {e}"
            ) from e
