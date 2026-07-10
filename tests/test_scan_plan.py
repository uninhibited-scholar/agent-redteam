"""Tests for offline scan scope and budget planning."""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from agent_redteam.cli import main
from agent_redteam.scan_plan import build_scan_plan, parse_suite_selection


def test_full_scan_plan_matches_catalog_without_network_calls():
    plan = build_scan_plan(
        target="openai",
        model="test-model",
        suite_names=None,
        limit=0,
        max_tokens=500,
        workers=4,
    )
    body = plan.to_dict()
    assert body["total_suites"] == 13
    assert body["total_calls"] == 2334
    assert body["output_token_ceiling"] == 1_167_000
    assert body["max_attempts_per_call"] == 3
    assert body["max_calls_with_retries"] == 7002
    assert body["max_output_token_ceiling_with_retries"] == 3_501_000
    assert body["network_calls_performed"] == 0
    assert body["retry_calls_included"] is False


def test_limited_selected_plan_calculates_per_suite_batches():
    plan = build_scan_plan(
        target="ollama",
        model="local-model",
        suite_names=["injection", "data_poisoning"],
        limit=10,
        max_tokens=200,
        workers=3,
    )
    assert plan.total_calls == 20
    assert plan.output_token_ceiling == 4000
    assert plan.estimated_parallel_batches == 8


def test_multi_turn_plan_counts_each_turn_as_a_sequential_call():
    plan = build_scan_plan(
        target="openai",
        model="test-model",
        suite_names=["multi_turn"],
        limit=10,
        max_tokens=100,
        workers=8,
    )
    assert plan.suites[0].planned_samples == 10
    assert plan.suites[0].planned_calls == 30
    assert plan.suites[0].execution_mode == "sequential"
    assert plan.total_calls == 30
    assert plan.estimated_parallel_batches == 30


def test_suite_selection_supports_all_and_rejects_ambiguous_values():
    assert parse_suite_selection("") is None
    assert parse_suite_selection("all") is None
    assert parse_suite_selection("injection, info_leak") == ["injection", "info_leak"]
    with pytest.raises(ValueError, match="cannot be combined"):
        parse_suite_selection("all,injection")
    with pytest.raises(ValueError, match="duplicate"):
        parse_suite_selection("injection,injection")


def test_scan_plan_rejects_unknown_suite_and_invalid_ranges():
    kwargs = dict(target="openai", model="m", suite_names=["missing"], limit=0, max_tokens=10, workers=1)
    with pytest.raises(ValueError, match="unknown suite"):
        build_scan_plan(**kwargs)
    with pytest.raises(ValueError, match="workers"):
        build_scan_plan(**{**kwargs, "suite_names": None, "workers": 0})
    with pytest.raises(ValueError, match="max_tokens"):
        build_scan_plan(**{**kwargs, "suite_names": None, "max_tokens": 0})
    with pytest.raises(ValueError, match="limit"):
        build_scan_plan(**{**kwargs, "suite_names": None, "limit": -1})
    with pytest.raises(ValueError, match="max_attempts"):
        build_scan_plan(**{**kwargs, "suite_names": None, "max_attempts": 0})


def test_cli_dry_run_is_json_secret_safe_and_constructs_no_target(capsys):
    with patch("agent_redteam.cli.OpenAITarget") as target, patch("agent_redteam.cli.Engine") as engine:
        code = main([
            "scan", "--model", "test-model", "--key", "sk-plansecret1234567890",
            "--suites", "injection,data_poisoning", "--limit", "5",
            "--max-attempts", "4", "--dry-run", "--format", "json",
        ])
    body = capsys.readouterr().out
    parsed = json.loads(body)
    assert code == 0
    assert parsed["total_calls"] == 10
    assert parsed["max_calls_with_retries"] == 40
    assert parsed["network_calls_performed"] == 0
    assert "sk-plansecret1234567890" not in body
    target.assert_not_called()
    engine.assert_not_called()


def test_cli_rejects_unknown_suite_before_target_construction(capsys):
    with patch("agent_redteam.cli.OpenAITarget") as target:
        code = main(["scan", "--model", "test-model", "--suites", "typo_suite"])
    assert code == 2
    assert "unknown suite" in capsys.readouterr().out
    target.assert_not_called()
