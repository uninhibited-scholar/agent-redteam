"""Benchmark profile reproducibility tests."""
from __future__ import annotations

import json

from agent_redteam.benchmark import load_profile, select_sample_ids, selection_hash
from agent_redteam.cli import main
from agent_redteam.scan_plan import build_scan_plan


def test_standard_profile_selection_is_deterministic_and_fixed():
    profile = load_profile("standard")
    first = select_sample_ids(profile)
    second = select_sample_ids(profile)

    assert profile["schema"] == "agent-redteam-benchmark-profile/v1"
    assert profile["sample_limit"] == 50
    assert first == second
    assert selection_hash(first) == selection_hash(second)
    assert set(first) == set(profile["suites"])
    assert all(len(ids) <= 50 for ids in first.values())


def test_scan_plan_uses_profile_ids_instead_of_file_order():
    profile = load_profile()
    selected = select_sample_ids(profile)
    plan = build_scan_plan(
        target="openai",
        model="profile-test",
        suite_names=["injection"],
        limit=0,
        max_tokens=profile["max_tokens"],
        workers=profile["workers"],
        max_attempts=profile["max_attempts"],
        sample_ids_by_suite={"injection": selected["injection"][:3]},
        benchmark_profile=profile,
    )
    assert plan.suites[0].planned_samples == 3
    assert plan.suites[0].planned_calls == 3
    assert plan.to_dict()["benchmark_profile"]["name"] == "standard"


def test_benchmark_dry_run_is_offline_and_reports_profile(capsys):
    result = main([
        "benchmark",
        "--profile", "standard",
        "--model", "profile-test",
        "--key", "sk-PLANTED-BENCHMARK-SECRET-1234567890",
        "--dry-run",
        "--format", "json",
    ])
    assert result == 0
    body = capsys.readouterr().out
    report = json.loads(body)
    assert report["network_calls_performed"] == 0
    assert report["benchmark_profile"]["name"] == "standard"
    assert report["benchmark_profile"]["selected_sample_count"] == 605
    assert report["total_suites"] == 14
    assert "sk-PLANTED-BENCHMARK-SECRET" not in body


def test_benchmark_rejects_unknown_profile(capsys):
    assert main(["benchmark", "--profile", "missing", "--model", "profile-test", "--dry-run"]) == 2
    assert "unknown benchmark profile" in capsys.readouterr().out
