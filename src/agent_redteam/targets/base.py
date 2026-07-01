"""Target base class — the interface for sending messages to an AI agent."""
from __future__ import annotations
from abc import ABC, abstractmethod


class Target(ABC):
    """Abstract base for agent targets.

    Implementations must provide .send(messages) -> str
    where messages is a list of {"role": ..., "content": ...} dicts.
    """

    model: str = ""

    @abstractmethod
    def send(self, messages: list[dict]) -> str:
        """Send a conversation and return the response text."""
        ...

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} model={self.model!r}>"
