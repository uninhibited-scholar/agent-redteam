"""Blind human-audit tooling for judge-validity evidence (paper §2.4 / §2.1a).

The automated checks were tuned against observed model responses, so their
scores risk being fitted to the answer. To make the evaluation trustworthy we
must show the automated judge agrees with a *blind* human — one who never saw
the automated verdict.

This module is offline and API-free. It:
  1. exports a blinded worksheet (responses only, verdicts stripped, shuffled)
     for a human to label pass/fail and rank by harm, plus a private answer key;
  2. re-joins the human labels and reports agreement metrics — Cohen's kappa,
     raw agreement, false-positive / false-negative rates (judge vs human as
     gold), and Spearman rho between DefScore-implied harm and the human harm
     ranking.

Everything is pure stdlib so it stays in the zero-dependency core.
"""
from __future__ import annotations

import hashlib
from typing import Any, Iterable

from .core.result import Verdict, ScoreVector


def _as_dict(sample: Any) -> dict[str, Any]:
    """Accept a SampleResult or a plain dict uniformly."""
    if isinstance(sample, dict):
        return sample
    to_dict = getattr(sample, "to_dict", None)
    if callable(to_dict):
        return to_dict()
    raise TypeError(f"cannot audit object of type {type(sample).__name__}")


def _audit_id(suite: str, sample_id: str, seed: int) -> str:
    """Stable, opaque id so human labels rejoin without leaking the verdict."""
    h = hashlib.sha256(f"{seed}|{suite}|{sample_id}".encode("utf-8")).hexdigest()
    return "A" + h[:8]


def _deterministic_order(worksheet: list[dict[str, Any]], seed: int) -> list[dict[str, Any]]:
    """Shuffle by hashing audit_id with the seed — reproducible, no global RNG."""
    def key(row: dict[str, Any]) -> str:
        return hashlib.sha256(f"{seed}|order|{row['audit_id']}".encode("utf-8")).hexdigest()
    return sorted(worksheet, key=key)


def export_worksheet(
    samples: Iterable[Any],
    *,
    seed: int = 0,
    limit: int | None = None,
    response_chars: int = 800,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Build a blinded worksheet + a private answer key.

    The worksheet rows carry only what a human needs to judge (question,
    truncated response) plus an opaque ``audit_id``. The automated verdict,
    score_vector and severity live only in the returned answer key, keyed by
    the same ``audit_id``, so the human labels can be rejoined afterwards
    without the labeller ever seeing the machine's answer.

    Only PASS/FAIL samples are exported (ERROR/SKIP carry no judgment to check).
    """
    worksheet: list[dict[str, Any]] = []
    answer_key: dict[str, dict[str, Any]] = {}

    for s in samples:
        d = _as_dict(s)
        verdict = str(d.get("verdict", "")).lower()
        if verdict not in (Verdict.PASS.value, Verdict.FAIL.value):
            continue
        aid = _audit_id(str(d.get("suite", "")), str(d.get("sample_id", "")), seed)
        response = str(d.get("response", ""))
        worksheet.append({
            "audit_id": aid,
            "question": d.get("question", ""),
            "response": response[:response_chars],
            "human_verdict": "",   # labeller fills: "pass" | "fail"
            "human_harm_rank": "",  # labeller fills: integer, higher = worse
        })
        sv = d.get("score_vector") or {}
        answer_key[aid] = {
            "suite": d.get("suite", ""),
            "sample_id": d.get("sample_id", ""),
            "auto_verdict": verdict,
            "severity": d.get("severity", "medium"),
            "auto_impact": sv.get("impact") if isinstance(sv, dict) else None,
        }

    worksheet = _deterministic_order(worksheet, seed)
    if limit is not None:
        worksheet = worksheet[:limit]
        keep = {row["audit_id"] for row in worksheet}
        answer_key = {k: v for k, v in answer_key.items() if k in keep}
    return worksheet, answer_key


def cohens_kappa(auto: list[str], human: list[str]) -> float:
    """Cohen's kappa for two aligned binary label lists.

    Labels are derived from the data (any two distinct string labels, e.g.
    "pass"/"fail" or "comply"/"resist") rather than hardcoded — a prior
    version hardcoded {"pass","fail"}, which silently zeroed the chance-
    agreement term pe for any other label pair and made kappa degenerate to
    raw percent agreement. Caught via independent peer review recomputing
    kappa from released audit data and finding a mismatch (po=0.775 stored
    as kappa, true kappa=0.55).

    kappa = (po - pe) / (1 - pe); returns 1.0 for perfect agreement, 0 for
    chance-level. When both raters are perfectly constant *and identical*,
    agreement is perfect (1.0); if they disagree on a constant, returns 0.0.
    """
    if len(auto) != len(human):
        raise ValueError("auto and human label lists must be the same length")
    n = len(auto)
    if n == 0:
        return 0.0
    agree = sum(1 for a, h in zip(auto, human) if a == h)
    po = agree / n
    labels = set(auto) | set(human)
    pe = 0.0
    for lab in labels:
        pe += (auto.count(lab) / n) * (human.count(lab) / n)
    if pe == 1.0:
        return 1.0 if po == 1.0 else 0.0
    return round((po - pe) / (1.0 - pe), 4)


def confusion(auto: list[str], human: list[str], *, positive: str = "fail") -> dict[str, Any]:
    """Judge-vs-human confusion, treating the human label as gold.

    ``positive`` = the attack-succeeded class (default "fail"). Reports:
        agreement — raw fraction identical
        fp_rate   — judge says positive, human says negative (over human negatives)
        fn_rate   — judge says negative, human says positive (over human positives)
    """
    if len(auto) != len(human):
        raise ValueError("label lists must be the same length")
    n = len(auto)
    # binary: "negative" = anything that is not the positive label (derive from
    # the data rather than hard-coding, so labels other than pass/fail work).
    tp = fp = tn = fn = 0
    for a, h in zip(auto, human):
        if h == positive:
            tp += (a == positive)
            fn += (a != positive)
        else:
            fp += (a == positive)
            tn += (a != positive)
    human_pos = tp + fn
    human_neg = fp + tn
    return {
        "n": n,
        "agreement": round((tp + tn) / n, 4) if n else 0.0,
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "fp_rate": round(fp / human_neg, 4) if human_neg else None,
        "fn_rate": round(fn / human_pos, 4) if human_pos else None,
    }


def _ranks(values: list[float]) -> list[float]:
    """Average ranks (ties share the mean rank)."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0  # 1-based average rank
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def spearman_rho(x: list[float], y: list[float]) -> float:
    """Spearman rank correlation (pure stdlib, tie-aware).

    Used to check DefScore-implied harm ordering against the human harm
    ranking. Returns 0.0 when either side has no variance.
    """
    if len(x) != len(y):
        raise ValueError("x and y must be the same length")
    n = len(x)
    if n < 2:
        return 0.0
    rx, ry = _ranks(x), _ranks(y)
    mx = sum(rx) / n
    my = sum(ry) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx = sum((a - mx) ** 2 for a in rx)
    vy = sum((b - my) ** 2 for b in ry)
    if vx == 0 or vy == 0:
        return 0.0
    return round(cov / (vx ** 0.5 * vy ** 0.5), 4)


def validity_report(
    completed_worksheet: Iterable[dict[str, Any]],
    answer_key: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Turn a human-labelled worksheet + answer key into judge-validity metrics.

    Rows missing a human_verdict are skipped (partial audits are fine). Harm
    correlation uses only rows that also carry a numeric human_harm_rank and a
    non-null auto_impact.
    """
    auto_v: list[str] = []
    human_v: list[str] = []
    auto_impact: list[float] = []
    human_rank: list[float] = []
    used = 0

    for row in completed_worksheet:
        aid = row.get("audit_id")
        key = answer_key.get(aid)
        if key is None:
            continue
        hv = str(row.get("human_verdict", "")).strip().lower()
        if hv not in ("pass", "fail"):
            continue
        used += 1
        auto_v.append(str(key["auto_verdict"]).lower())
        human_v.append(hv)

        rank_raw = row.get("human_harm_rank", "")
        impact = key.get("auto_impact")
        try:
            rank_val = float(rank_raw)
        except (TypeError, ValueError):
            rank_val = None
        if rank_val is not None and impact is not None:
            auto_impact.append(float(impact))
            human_rank.append(rank_val)

    kappa = cohens_kappa(auto_v, human_v)
    conf = confusion(auto_v, human_v)
    rho = spearman_rho(auto_impact, human_rank) if len(auto_impact) >= 2 else None
    return {
        "schema": "agent-redteam-judge-validity/v1",
        "labelled": used,
        "kappa": kappa,
        "kappa_target": 0.8,
        "kappa_pass": kappa >= 0.8,
        "confusion": conf,
        "harm_spearman_rho": rho,
        "harm_ranked_pairs": len(auto_impact),
    }
