"""Checkpoint/resume reliability tests for single- and multi-turn scans."""
from __future__ import annotations

import os

import pytest

from agent_redteam.core.checkpoint import Checkpoint, make_scan_id, scan_fingerprint
from agent_redteam.core.engine import Engine
from agent_redteam.core.result import SampleResult, Verdict


class _DecisionCheck:
    def evaluate(self, response, sample):
        return Verdict.ERROR if response == "error" else Verdict.PASS

    def describe_expected(self, sample):
        return "a valid decision"


class _Suite:
    name = "resume_test"
    check = _DecisionCheck()

    def __init__(self, samples=None):
        self.samples = samples or [
            {"id": "one", "question": "one"},
            {"id": "two", "question": "two"},
        ]

    def load_samples(self):
        return [dict(sample) for sample in self.samples]

    def build_messages(self, sample):
        return [{"role": "user", "content": sample["question"]}]


class _MultiSuite(_Suite):
    name = "multi_resume_test"
    is_multiturn = True

    def __init__(self):
        self.samples = [
            {"id": "one", "turns": [{"role": "user", "content": "one"}]},
            {"id": "two", "turns": [{"role": "user", "content": "two"}]},
        ]


class _Target:
    model = "checkpoint-model"

    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = 0

    def send(self, messages):
        self.calls += 1
        return next(self.responses)


@pytest.fixture(autouse=True)
def _private_checkpoint_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "agent_redteam.core.checkpoint._checkpoint_dir", lambda: str(tmp_path)
    )


def _result(suite, sample_id, verdict):
    return SampleResult(
        suite=suite,
        sample_id=sample_id,
        category="",
        difficulty="",
        question="q",
        expected="e",
        response="r",
        verdict=verdict,
    )


def _engine(target, suite):
    engine = Engine(target, max_workers=1)
    engine._suites = {suite.name: suite}
    return engine


def test_checkpoint_keys_include_suite_and_errors_are_retryable():
    cp = Checkpoint("compound")
    cp.save(_result("suite_a", "same", Verdict.PASS))
    cp.save(_result("suite_b", "same", Verdict.ERROR))

    assert cp.completed_keys() == {("suite_a", "same")}
    assert cp.get("suite_a", "same")["verdict"] == "pass"
    assert cp.get("suite_b", "same")["verdict"] == "error"
    assert os.stat(cp.path).st_mode & 0o777 == 0o600


def test_latest_judged_result_replaces_retryable_error():
    cp = Checkpoint("latest")
    cp.save(_result("suite", "one", Verdict.ERROR))
    cp.save(_result("suite", "one", Verdict.FAIL))

    reloaded = Checkpoint("latest")
    assert reloaded.completed_keys() == {("suite", "one")}
    assert reloaded.get("suite", "one")["verdict"] == "fail"


def test_scan_scope_changes_when_selected_content_changes():
    full = [("suite", [{"id": "one"}, {"id": "two"}])]
    limited = [("suite", [{"id": "one"}])]
    assert scan_fingerprint(full) != scan_fingerprint(limited)
    assert make_scan_id("m", ["suite"], fingerprint="a", target="T") != make_scan_id(
        "m", ["suite"], fingerprint="b", target="T"
    )
    secret = "sk-secret-value-that-must-not-reach-a-path"
    assert secret not in make_scan_id(secret, [secret], fingerprint="x", target=secret)


def test_target_endpoint_and_check_implementation_are_in_scope():
    suite = _Suite()
    first = _Target([])
    second = _Target([])
    first.endpoint = "http://localhost:8001"
    second.endpoint = "http://localhost:8002"

    assert _engine(first, suite)._target_scope() != _engine(second, suite)._target_scope()
    assert Engine._suite_signature(suite) == Engine._suite_signature(_Suite())

    class _DifferentCheck(_DecisionCheck):
        def evaluate(self, response, sample):
            return Verdict.FAIL

    changed = _Suite()
    changed.check = _DifferentCheck()
    assert Engine._suite_signature(suite) != Engine._suite_signature(changed)


def test_single_turn_resume_reuses_pass_and_retries_error():
    suite = _Suite()
    first = _Target(["ok", "error"])
    report = _engine(first, suite).scan([suite.name])
    assert report.suites[0].errors == 1
    assert first.calls == 2

    second = _Target(["ok"])
    report = _engine(second, suite).scan([suite.name])
    assert second.calls == 1
    assert report.suites[0].passed == 2
    assert report.suites[0].errors == 0


def test_multiturn_resume_after_interruption_skips_completed_scenario():
    suite = _MultiSuite()
    first = _Target(["ok"])

    def interrupt_after_first(_result):
        raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        _engine(first, suite).scan([suite.name], on_result=interrupt_after_first)
    assert first.calls == 1

    second = _Target(["ok"])
    report = _engine(second, suite).scan([suite.name])
    assert second.calls == 1
    assert report.suites[0].passed == 2


def test_error_keeps_active_checkpoint_and_clean_run_archives_it(tmp_path):
    suite = _Suite(samples=[{"id": "one", "question": "one"}])
    _engine(_Target(["error"]), suite).scan([suite.name])
    active = list(tmp_path.glob("*.jsonl"))
    assert len(active) == 1

    _engine(_Target(["ok"]), suite).scan([suite.name])
    assert not list(tmp_path.glob("*.jsonl"))
    assert len(list(tmp_path.glob("*.jsonl.done"))) == 1
