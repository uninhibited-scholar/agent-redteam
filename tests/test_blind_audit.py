"""Tests for blind human-audit / judge-validity tooling (paper §2.4)."""
import pytest
from agent_redteam.core.result import SampleResult, Verdict, ScoreVector
from agent_redteam.blind_audit import (
    export_worksheet, cohens_kappa, confusion, spearman_rho, validity_report,
)


def _mk(sid, verdict, severity="high", impact=None):
    sv = None
    if impact is not None:
        # a vector whose .impact equals the requested value at leakage=1
        sv = ScoreVector(bypass=(verdict == Verdict.FAIL), harm=impact, leakage=1.0)
    return SampleResult(
        suite="inj", sample_id=sid, category="c", difficulty="medium",
        question=f"q-{sid}", expected="e", response=f"resp-{sid}",
        verdict=verdict, severity=severity, score_vector=sv,
    )


class TestExportWorksheet:
    def test_strips_verdict_from_worksheet(self):
        ws, key = export_worksheet([_mk("1", Verdict.FAIL)])
        row = ws[0]
        assert "verdict" not in row and "auto_verdict" not in row
        assert row["human_verdict"] == "" and row["human_harm_rank"] == ""
        # the verdict is only in the private answer key
        assert key[row["audit_id"]]["auto_verdict"] == "fail"

    def test_excludes_error_skip(self):
        ws, key = export_worksheet([
            _mk("1", Verdict.PASS), _mk("2", Verdict.ERROR), _mk("3", Verdict.SKIP),
        ])
        assert len(ws) == 1 and len(key) == 1

    def test_deterministic_shuffle(self):
        samples = [_mk(str(i), Verdict.PASS) for i in range(10)]
        a, _ = export_worksheet(samples, seed=7)
        b, _ = export_worksheet(samples, seed=7)
        c, _ = export_worksheet(samples, seed=8)
        assert [r["audit_id"] for r in a] == [r["audit_id"] for r in b]
        assert [r["audit_id"] for r in a] != [r["audit_id"] for r in c]  # seed matters

    def test_response_truncated(self):
        s = _mk("1", Verdict.FAIL)
        s.response = "x" * 5000
        ws, _ = export_worksheet([s], response_chars=100)
        assert len(ws[0]["response"]) == 100

    def test_limit_prunes_key_too(self):
        samples = [_mk(str(i), Verdict.PASS) for i in range(20)]
        ws, key = export_worksheet(samples, limit=5)
        assert len(ws) == 5 and len(key) == 5
        assert set(key) == {r["audit_id"] for r in ws}

    def test_accepts_plain_dicts(self):
        d = _mk("1", Verdict.FAIL).to_dict()
        ws, key = export_worksheet([d])
        assert len(ws) == 1


class TestKappa:
    def test_perfect_agreement(self):
        a = ["pass", "fail", "pass", "fail"]
        assert cohens_kappa(a, a) == 1.0

    def test_total_disagreement_below_chance(self):
        assert cohens_kappa(["pass", "fail"], ["fail", "pass"]) < 0.0

    def test_constant_identical_is_one(self):
        assert cohens_kappa(["fail", "fail"], ["fail", "fail"]) == 1.0

    def test_constant_disagree_is_zero(self):
        assert cohens_kappa(["fail", "fail"], ["pass", "pass"]) == 0.0

    def test_length_mismatch_raises(self):
        with pytest.raises(ValueError):
            cohens_kappa(["pass"], ["pass", "fail"])

    def test_empty_is_zero(self):
        assert cohens_kappa([], []) == 0.0


class TestConfusion:
    def test_fp_fn_rates(self):
        # human gold: fail, fail, pass, pass ; auto: fail, pass, fail, pass
        auto = ["fail", "pass", "fail", "pass"]
        human = ["fail", "fail", "pass", "pass"]
        c = confusion(auto, human)
        assert c["tp"] == 1 and c["fn"] == 1 and c["fp"] == 1 and c["tn"] == 1
        assert c["fp_rate"] == 0.5 and c["fn_rate"] == 0.5
        assert c["agreement"] == 0.5

    def test_no_positives(self):
        c = confusion(["pass", "pass"], ["pass", "pass"])
        assert c["fn_rate"] is None and c["fp_rate"] == 0.0


class TestSpearman:
    def test_monotonic_is_one(self):
        assert spearman_rho([1, 2, 3, 4], [10, 20, 30, 40]) == 1.0

    def test_inverse_is_minus_one(self):
        assert spearman_rho([1, 2, 3, 4], [40, 30, 20, 10]) == -1.0

    def test_ties_handled(self):
        # no crash, bounded
        r = spearman_rho([1, 1, 2, 2], [1, 2, 2, 3])
        assert -1.0 <= r <= 1.0

    def test_no_variance_is_zero(self):
        assert spearman_rho([5, 5, 5], [1, 2, 3]) == 0.0


class TestValidityReport:
    def _round_trip(self, labels):
        samples = [
            _mk("1", Verdict.FAIL, impact=1.0),
            _mk("2", Verdict.PASS, impact=0.0),
            _mk("3", Verdict.FAIL, impact=0.5),
        ]
        ws, key = export_worksheet(samples, seed=1)
        by_id = {r["audit_id"]: r for r in ws}
        # apply the provided (auto_verdict-keyed) human labels
        for aid, meta in key.items():
            hv, rank = labels[meta["sample_id"]]
            by_id[aid]["human_verdict"] = hv
            by_id[aid]["human_harm_rank"] = rank
        return validity_report(ws, key)

    def test_perfect_agreement_kappa_one(self):
        rep = self._round_trip({"1": ("fail", 3), "2": ("pass", 1), "3": ("fail", 2)})
        assert rep["kappa"] == 1.0 and rep["kappa_pass"] is True
        assert rep["labelled"] == 3

    def test_harm_ranking_correlates(self):
        # human ranks match impact order (1.0 > 0.5 > 0.0)
        rep = self._round_trip({"1": ("fail", 3), "2": ("pass", 1), "3": ("fail", 2)})
        assert rep["harm_spearman_rho"] == 1.0
        assert rep["harm_ranked_pairs"] == 3

    def test_partial_labels_skipped(self):
        rep = self._round_trip({"1": ("fail", 3), "2": ("", ""), "3": ("fail", 2)})
        assert rep["labelled"] == 2

    def test_disagreement_lowers_kappa(self):
        rep = self._round_trip({"1": ("pass", 1), "2": ("pass", 1), "3": ("fail", 2)})
        assert rep["kappa"] < 1.0 and rep["kappa_pass"] is False
