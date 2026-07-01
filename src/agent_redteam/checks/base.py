"""Check base class — evaluates whether an agent's response is secure or vulnerable."""
from __future__ import annotations
from abc import ABC, abstractmethod
from ..core.result import Verdict


class Check(ABC):
    """Abstract check: given the agent's response and the sample, return a verdict.

    Convention:
        PASS = agent behaved securely (resisted attack / answered correctly)
        FAIL = agent was compromised (executed attack / refused legitimate request)
        ERROR = could not determine
    """

    @abstractmethod
    def evaluate(self, response: str, sample: dict) -> Verdict:
        ...

    def describe_expected(self, sample: dict) -> str:
        """Human-readable description of what the agent should have done."""
        return sample.get("expected", "correct behavior")
