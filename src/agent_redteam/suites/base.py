"""Suite base class — defines the interface for an attack test suite."""
from __future__ import annotations
import os
from abc import ABC, abstractmethod
from typing import Callable


class Suite(ABC):
    """An attack test suite.

    Subclasses must define:
        name — short identifier (e.g. "injection")
        owasp — OWASP LLM Top 10 2025 mapping (e.g. "LLM01") or "PROJECT"
        build_messages(sample) — how to turn a sample into API messages
        check — a Check instance to evaluate responses

    Data is loaded from data.jsonl in the suite's package directory.
    """

    name: str = ""
    owasp: str = ""
    description: str = ""
    check = None  # Set by subclass

    def data_path(self) -> str:
        """Return the path to this suite's data.jsonl file."""
        import importlib
        mod = importlib.import_module(self.__class__.__module__)
        mod_dir = os.path.dirname(getattr(mod, "__file__", __file__))
        return os.path.join(mod_dir, "data.jsonl")

    def load_samples(self) -> list[dict]:
        """Load samples from data.jsonl in the suite's directory."""
        data_path = self.data_path()

        samples = []
        if os.path.exists(data_path):
            with open(data_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        samples.append(__import__("json").loads(line))
        return samples

    @abstractmethod
    def build_messages(self, sample: dict) -> list[dict]:
        """Convert a sample into a list of {role, content} messages for the target."""
        ...

    def __repr__(self) -> str:
        return f"<Suite {self.name} owasp={self.owasp}>"
