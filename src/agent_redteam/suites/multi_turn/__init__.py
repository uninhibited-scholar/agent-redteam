"""Multi-turn attack suite — sequential conversational attacks.

Unlike other suites that send a single message, this suite runs multi-turn
"attack scenarios" — scripted conversations where the attacker gradually
builds trust or context before striking.

This suite does NOT use the standard build_messages/Harness flow.
The Engine detects it and routes to MultiTurnHarness instead.
"""
from __future__ import annotations
from pathlib import Path
from ..base import Suite
from ...checks.multiturn_check import MultiTurnCheck


class MultiTurnSuite(Suite):
    name = "multi_turn"
    owasp = "LLM01"
    description = "多轮对话攻击：通过多轮建立信任/上下文后逐步逼近目标"
    check = MultiTurnCheck()

    @property
    def is_multiturn(self) -> bool:
        """Signal to Engine that this suite uses MultiTurnHarness."""
        return True

    def load_samples(self) -> list[dict]:
        data_path = Path(__file__).parent / "data.jsonl"
        samples = []
        with open(data_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    samples.append(json.loads(line))
        return samples

    def build_messages(self, sample: dict) -> list[dict]:
        """Not used for multi-turn — MultiTurnHarness handles this directly.
        Provided for interface compatibility."""
        system = sample.get("system_prompt", "")
        turns = sample.get("turns", [])
        return [{"role": "system", "content": system}] + turns


# json is used in load_samples
import json
