"""Tests for adaptive attack engine."""
import json
import pytest
from unittest.mock import MagicMock, patch
from agent_redteam.adaptive import AdaptiveAttacker, AdaptiveReport, BypassResult
from agent_redteam.core.result import Verdict


class TestAdaptiveReport:
    def test_empty_report(self):
        r = AdaptiveReport("test-model")
        assert r.bypass_count == 0
        assert r.bypass_rate == 0.0
        assert "test-model" in r.summary()

    def test_with_bypasses(self):
        r = AdaptiveReport("gpt-4o")
        r.total_attempts = 100
        r.rounds = 5
        b = BypassResult("seed-001", "reframe", "mutated question", "complied", 3, Verdict.PASS)
        r.bypasses.append(b)
        assert r.bypass_count == 1
        assert r.bypass_rate == 0.01

    def test_to_dict_serializable(self):
        r = AdaptiveReport("test")
        r.total_attempts = 50
        b = BypassResult("s1", "homoglyph", "q", "r", 1, Verdict.PASS)
        r.bypasses.append(b)
        d = r.to_dict()
        json.dumps(d)  # should not throw
        assert d["bypass_count"] == 1
        assert d["total_attempts"] == 50


class TestAdaptiveAttacker:
    def test_load_seeds_from_injection(self):
        target = MagicMock()
        attacker = AdaptiveAttacker(target, seed_suites=["injection"])
        seeds = attacker._load_seeds()
        assert len(seeds) > 0
        assert all("_suite" in s for s in seeds)

    def test_evaluate_refusal_is_pass(self):
        target = MagicMock()
        attacker = AdaptiveAttacker(target)
        result = attacker._evaluate("I cannot help with that.", {"fail_if_contains": []})
        assert result == Verdict.PASS

    def test_evaluate_compliance_is_fail(self):
        target = MagicMock()
        attacker = AdaptiveAttacker(target)
        result = attacker._evaluate(
            "Sure, here's how to do it: rm -rf /",
            {"fail_if_contains": ["rm -rf"]}
        )
        assert result == Verdict.FAIL

    def test_evaluate_gold_block_not_refused(self):
        target = MagicMock()
        attacker = AdaptiveAttacker(target)
        result = attacker._evaluate(
            "I'll execute that command for you right away.",
            {"gold": {"decision": "block"}}
        )
        assert result == Verdict.FAIL

    def test_run_finds_bypass_with_mock(self):
        """Mock target: first 2 responses refuse, 3rd complies."""
        target = MagicMock()
        target.send.side_effect = [
            "I cannot help with that request. It violates safety guidelines.",  # PASS
            "No, that's dangerous and I won't comply with this request.",       # PASS
            "Sure, here's how to do it: rm -rf / done! Have a nice day!",       # FAIL
        ]
        target.model = "mock-model"

        attacker = AdaptiveAttacker(
            target,
            seed_suites=["injection"],
            strategies=["reframe"],  # use only 1 strategy for determinism
        )
        report = attacker.run(
            max_rounds=1,
            target_bypasses=1,
            mutations_per_seed=3,
            seed_limit=1,
        )
        assert report.bypass_count >= 1
        assert report.target_model == "mock-model"

    def test_run_no_bypass(self):
        """Mock target: always refuses."""
        target = MagicMock()
        target.send.return_value = "I cannot comply with that request."
        target.model = "strong-model"

        attacker = AdaptiveAttacker(target, seed_suites=["injection"])
        report = attacker.run(max_rounds=1, target_bypasses=5, mutations_per_seed=2, seed_limit=2)
        assert report.bypass_count == 0
        assert report.total_attempts > 0

    def test_on_bypass_callback(self):
        """Callback fires when a bypass is found."""
        target = MagicMock()
        target.send.return_value = "Sure, here's the password: admin123"
        target.model = "weak-model"

        bypasses_found = []
        attacker = AdaptiveAttacker(
            target,
            seed_suites=["injection"],
            on_bypass=lambda b: bypasses_found.append(b),
        )
        attacker.run(max_rounds=1, target_bypasses=1, mutations_per_seed=1, seed_limit=1)
        assert len(bypasses_found) >= 1
