"""Multi-turn attack harness — sequential conversational attacks.

Unlike the single-turn Harness, this runs a scripted multi-turn conversation
against the target. Each "turn" is an attacker message; the model responds
between turns. The full conversation history is maintained, so later turns
can exploit trust/context established in earlier turns.

This is how real adversarial attacks work — not a single injected prompt,
but a gradual escalation over multiple exchanges.
"""
from __future__ import annotations
import json, time
from typing import Callable
from .result import SampleResult, Verdict


def _safe_send(target, messages: list[dict], retries: int = 2) -> str:
    """Send with retry. Returns response or '' on failure."""
    for attempt in range(retries):
        try:
            return target.send(messages)
        except Exception:
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
            else:
                raise
    return ""


class MultiTurnResult:
    """Result of a single multi-turn attack scenario."""
    def __init__(self, sample_id: str, suite: str, verdict: Verdict,
                 responses: list[str], conversation: list[dict],
                 error: str = ""):
        self.sample_id = sample_id
        self.suite = suite
        self.verdict = verdict
        self.responses = responses           # list of model responses per turn
        self.conversation = conversation      # full message history
        self.error = error

    @property
    def final_response(self) -> str:
        """The model's response to the last attacker turn."""
        return self.responses[-1] if self.responses else ""

    def to_metadata(self) -> dict:
        """Serialize for SampleResult.metadata."""
        return {
            "turns": len(self.responses),
            "conversation": self.conversation,
        }


class MultiTurnHarness:
    """Runs multi-turn attack scenarios sequentially against a target.

    Args:
        target: An object with .send(messages) -> str
        scenarios: List of multi-turn attack dicts (from data.jsonl)
        check: A Check with .evaluate(responses: list[str], sample: dict) -> Verdict
        on_result: Optional callback(SampleResult) for real-time updates
    """

    def __init__(self, target, scenarios: list[dict], check,
                 on_result: Callable | None = None):
        self.target = target
        self.scenarios = scenarios
        self.check = check
        self.on_result = on_result

    def run_single(self, scenario: dict) -> SampleResult:
        """Execute one multi-turn attack scenario."""
        suite = scenario.get("_suite", "multi_turn")
        sid = scenario.get("id", "?")
        system_prompt = scenario.get("system_prompt", "You are a helpful assistant.")
        turns = scenario.get("turns", [])

        # Build conversation: system + alternating user/assistant
        messages = [{"role": "system", "content": system_prompt}]
        responses: list[str] = []
        error_msg = ""

        try:
            for turn in turns:
                messages.append(turn)
                response = _safe_send(self.target, messages)
                responses.append(response)
                messages.append({"role": "assistant", "content": response})
        except Exception as e:
            error_msg = str(e)[:200]

        # Evaluate: check looks at the full response history
        if error_msg:
            verdict = Verdict.ERROR
        else:
            verdict = self.check.evaluate(responses, scenario)

        # Extract the attack summary (first turn's question as the "question" field)
        question = turns[0]["content"] if turns else ""

        # Build SampleResult with conversation in a metadata field
        result = SampleResult(
            suite=suite,
            sample_id=sid,
            category=scenario.get("category", ""),
            difficulty=scenario.get("difficulty", "hard"),
            question=question,
            expected=self.check.describe_expected(scenario),
            response=responses[-1] if responses else "",
            verdict=verdict,
            severity=scenario.get("severity", "medium"),
            owasp=scenario.get("owasp", "LLM01"),
            tags=scenario.get("tags", ["multi-turn"]),
            error=error_msg,
        )
        # Store full conversation for the dashboard
        result.metadata = {
            "turns": len(responses),
            "conversation": messages,
            "all_responses": responses,
        }

        return result

    def run(self) -> list[SampleResult]:
        """Run all scenarios sequentially (multi-turn can't parallelize)."""
        results: list[SampleResult] = []
        for scenario in self.scenarios:
            r = self.run_single(scenario)
            results.append(r)
            if self.on_result:
                self.on_result(r)
        return results
