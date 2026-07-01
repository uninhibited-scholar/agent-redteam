"""Target adapters — unified interface for sending messages to AI agents."""
from .base import Target
from .openai_compat import OpenAITarget
from .local import LocalTarget

# ClaudeTarget imported separately because it needs Anthropic API key
try:
    from .anthropic_target import ClaudeTarget
except ImportError:
    ClaudeTarget = None  # type: ignore

__all__ = ["Target", "OpenAITarget", "ClaudeTarget", "LocalTarget"]
