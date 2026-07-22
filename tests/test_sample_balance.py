"""Tests for difficulty stratification (paper §2.2) and strict cell balance."""
import pytest
from agent_redteam.core.result import (
    ScoreVector, SampleResult, SuiteResult, Verdict, defense_metrics,
)
from agent_redteam.sample_audit import audit_cell_balance


def _mk(verdict, difficulty="medium", severity="medium", vector=None):
    return SampleResult(
        suite="s", sample_id="i", category="c", difficulty=difficulty,
        question="q", expected="e", response="r",
        verdict=verdict, severity=severity, score_vector=vector,
    )


class TestDefenseMetrics:
    def test_empty(self):
        m = defense_metrics([])
        assert m == {"n": 0, "asr": None, "defense_score": -1.0, "stealthy_asr": 0.0}

    def test_all_resisted(self):
        m = defense_metrics([_mk(Verdict.PASS, severity="critical") for _ in range(4)])
        assert m["n"] == 4 and m["asr"] == 0.0 and m["defense_score"] == 100.0

    def test_asr_counts_fails(self):
        rows = [_mk(Verdict.FAIL), _mk(Verdict.PASS), _mk(Verdict.PASS), _mk(Verdict.PASS)]
        assert defense_metrics(rows)["asr"] == 0.25

    def test_errors_excluded_from_n(self):
        rows = [_mk(Verdict.ERROR), _mk(Verdict.PASS)]
        assert defense_metrics(rows)["n"] == 1


class TestByDifficulty:
    def test_stratification(self):
        s = SuiteResult(name="s")
        s.add(_mk(Verdict.PASS, "easy"))
        s.add(_mk(Verdict.FAIL, "hard", severity="critical",
                  vector=ScoreVector(True, 1.0, leakage=1.0)))
        strat = s.by_difficulty()
        assert set(strat) == {"easy", "hard"}
        assert strat["easy"]["defense_score"] == 100.0
        assert strat["easy"]["asr"] == 0.0
        assert strat["hard"]["defense_score"] == 0.0
        assert strat["hard"]["asr"] == 1.0

    def test_unknown_bucket_for_blank_difficulty(self):
        s = SuiteResult(name="s")
        s.add(_mk(Verdict.PASS, ""))
        assert "unknown" in s.by_difficulty()


class _FakeSuite:
    name = "fake"
    _samples: list = []

    @classmethod
    def make(cls, name, samples):
        return type("FS", (), {
            "name": name,
            "load_samples": lambda self, s=samples: list(s),
        })


def _samples(**per_diff):
    out = []
    for diff, n in per_diff.items():
        out += [{"id": f"{diff}-{i}", "difficulty": diff} for i in range(n)]
    return out


class TestCellBalance:
    def test_balanced_equal_cells(self):
        suite = _FakeSuite.make("s1", _samples(easy=10, medium=10, hard=10))
        rep = audit_cell_balance([suite])
        assert rep["balanced"] is True
        assert rep["cells"]["s1"] == {"easy": 10, "medium": 10, "hard": 10}

    def test_unequal_cells_fail(self):
        suite = _FakeSuite.make("s1", _samples(easy=10, medium=8, hard=10))
        rep = audit_cell_balance([suite])
        assert rep["balanced"] is False
        assert any(f["rule"] == "cell_balance" for f in rep["findings"])

    def test_empty_tier_fails(self):
        suite = _FakeSuite.make("s1", _samples(easy=10, medium=10))  # no hard
        rep = audit_cell_balance([suite])
        assert rep["balanced"] is False

    def test_expected_k_enforced(self):
        suite = _FakeSuite.make("s1", _samples(easy=10, medium=10, hard=10))
        assert audit_cell_balance([suite], expected_k=10)["balanced"] is True
        assert audit_cell_balance([suite], expected_k=12)["balanced"] is False

    def test_load_error_reported(self):
        class Broken:
            name = "broken"
            def load_samples(self):
                raise RuntimeError("boom")
        rep = audit_cell_balance([Broken])
        assert rep["balanced"] is False
        assert any(f["rule"] == "load_error" for f in rep["findings"])
