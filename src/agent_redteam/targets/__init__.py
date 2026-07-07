"""Target adapters — unified interface for sending messages to AI agents."""
from .base import Target
from .openai_compat import OpenAITarget
from .local import LocalTarget
from .ollama import OllamaTarget
from .deepseek import DeepSeekTarget
from .azure import AzureTarget
from .qwen import QwenTarget

# ClaudeTarget imported separately because it needs Anthropic API key
try:
    from .anthropic_target import ClaudeTarget
except ImportError:
    ClaudeTarget = None  # type: ignore

# ZaiTarget — uses Z.ai Anthropic endpoint (separate billing from open.bigmodel.cn)
try:
    from .zai_target import ZaiTarget
except ImportError:
    ZaiTarget = None  # type: ignore

__all__ = [
    "Target",
    "OpenAITarget",
    "ClaudeTarget",
    "ZaiTarget",
    "LocalTarget",
    "OllamaTarget",
    "DeepSeekTarget",
    "AzureTarget",
    "QwenTarget",
]
