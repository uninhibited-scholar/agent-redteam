"""Check base class — evaluates whether an agent's response is secure or vulnerable."""
from __future__ import annotations
from abc import ABC, abstractmethod
from ..core.result import Verdict, ScoreVector


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

    def score_from_verdict(self, response: str, sample: dict, verdict: Verdict) -> ScoreVector:
        """Multi-dimensional score for an already-computed verdict.

        Default: derive from verdict + severity (bypass, harm; leakage and
        disruption unknown → 0). Checks with signal about leakage or task
        disruption should override this to emit richer components. Kept
        separate from ``evaluate`` so callers that already hold a verdict do
        not re-run the (potentially stateful) evaluation.
        """
        return ScoreVector.from_verdict(verdict, sample.get("severity", "medium"))

    def evaluate_scored(self, response: str, sample: dict) -> ScoreVector:
        """Convenience: evaluate and return the multi-dimensional ScoreVector."""
        return self.score_from_verdict(response, sample, self.evaluate(response, sample))

    def describe_expected(self, sample: dict) -> str:
        """Human-readable description of what the agent should have done."""
        return sample.get("expected", "correct behavior")
