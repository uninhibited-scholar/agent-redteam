"""Azure OpenAI target — for models deployed on Azure OpenAI Service.

Zero dependencies (stdlib urllib only). Azure uses a different URL pattern
(deployment-based) and api-key header instead of Bearer auth.
"""
from __future__ import annotations
import json, os, ssl, urllib.request
from .base import Target

try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = None


class AzureTarget(Target):
    """Azure OpenAI target.

    Azure differs from standard OpenAI:
    - URL: {endpoint}/openai/deployments/{deployment}/chat/completions?api-version=xxx
    - Auth: api-key header (not Bearer)
    - Model is tied to the deployment name, not passed in body

    Args:
        deployment: Azure deployment name (e.g. "gpt-4o-deployment")
        endpoint: Azure endpoint (e.g. "https://my-resource.openai.azure.com")
        api_key: Azure API key (or set AZURE_OPENAI_API_KEY env)
        api_version: Azure API version (default: 2024-10-21)
        max_tokens: Max response tokens
    """

    def __init__(
        self,
        deployment: str,
        endpoint: str = "",
        api_key: str = "",
        api_version: str = "2024-10-21",
        max_tokens: int = 500,
    ):
        self.model = deployment  # Store deployment name as model for reports
        self.deployment = deployment
        self.endpoint = endpoint.rstrip("/") or os.environ.get("AZURE_OPENAI_ENDPOINT", "")
        self.api_key = api_key or os.environ.get("AZURE_OPENAI_API_KEY", "")
        self.api_version = api_version
        self.max_tokens = max_tokens
        if not self.endpoint:
            raise ValueError("Azure endpoint required (endpoint= or AZURE_OPENAI_ENDPOINT env)")
        if not self.api_key:
            raise ValueError("API key required (api_key= or AZURE_OPENAI_API_KEY env)")

    def send(self, messages: list[dict]) -> str:
        body = json.dumps({
            "messages": messages,
            "max_tokens": self.max_tokens,
            "temperature": 0,
        }).encode()

        url = (
            f"{self.endpoint}/openai/deployments/{self.deployment}"
            f"/chat/completions?api-version={self.api_version}"
        )

        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "api-key": self.api_key,  # Azure uses api-key header, not Bearer
                "Content-Type": "application/json",
            },
        )

        with urllib.request.urlopen(req, timeout=120, context=_SSL_CTX) as resp:
            data = json.loads(resp.read())
            content = data["choices"][0]["message"]["content"]
            if not content:
                content = data["choices"][0]["message"].get("reasoning_content", "")
            return content or ""
