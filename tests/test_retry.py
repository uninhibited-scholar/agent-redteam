"""Fail-fast and bounded retry behavior for model calls."""
from __future__ import annotations

from email.message import Message
from urllib.error import HTTPError
from unittest.mock import patch

import pytest

from agent_redteam.core.engine import Engine
from agent_redteam.core.harness import Harness, send_message
from agent_redteam.core.result import Verdict


class _Target:
    model = "retry-test"

    def __init__(self, outcomes):
        self.outcomes = iter(outcomes)
        self.calls = 0

    def send(self, _messages):
        self.calls += 1
        outcome = next(self.outcomes)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class _Check:
    def evaluate(self, _response, _sample):
        return Verdict.PASS

    def describe_expected(self, _sample):
        return "success"


def _http_error(code: int, *, retry_after: str = "") -> HTTPError:
    headers = Message()
    if retry_after:
        headers["Retry-After"] = retry_after
    return HTTPError(
        "https://example.test/chat?api_key=secret-in-url",
        code,
        "test error",
        headers,
        None,
    )


def test_permanent_http_4xx_fails_fast_without_sleep():
    target = _Target([_http_error(401), "should-not-run"])
    with patch("agent_redteam.core.harness.time.sleep") as sleep:
        with pytest.raises(HTTPError):
            send_message(target, [], max_attempts=3)
    assert target.calls == 1
    sleep.assert_not_called()


def test_rate_limit_retries_and_honors_bounded_retry_after():
    target = _Target([_http_error(429, retry_after="7"), "ok"])
    with patch("agent_redteam.core.harness.time.sleep") as sleep:
        assert send_message(target, [], max_attempts=3) == "ok"
    assert target.calls == 2
    sleep.assert_called_once_with(7.0)


def test_retry_after_is_capped_and_server_errors_are_bounded():
    target = _Target([_http_error(503, retry_after="999")] * 3)
    with patch("agent_redteam.core.harness.time.sleep") as sleep:
        with pytest.raises(HTTPError):
            send_message(target, [], max_attempts=3)
    assert target.calls == 3
    assert [call.args[0] for call in sleep.call_args_list] == [30.0, 30.0]


def test_http_error_report_does_not_include_endpoint_query_secret():
    target = _Target([_http_error(403)])
    harness = Harness(
        target,
        [{"id": "one", "question": "q", "_suite": "test"}],
        lambda sample: [{"role": "user", "content": sample["question"]}],
        _Check(),
        max_workers=1,
    )
    result = harness.run()[0]
    assert result.verdict == Verdict.ERROR
    assert result.error == "HTTP 403 test error"
    assert "api_key" not in result.error
    assert "secret-in-url" not in result.error


def test_engine_rejects_unbounded_attempt_counts():
    with pytest.raises(ValueError, match="between 1 and 10"):
        Engine(_Target([]), max_attempts=0)
    with pytest.raises(ValueError, match="between 1 and 10"):
        Engine(_Target([]), max_attempts=11)


def test_legacy_retry_keyword_and_positional_callback_remain_compatible():
    target = _Target(["ok", "ok"])
    assert send_message(target, [], retries=1) == "ok"

    observed = []
    harness = Harness(
        target,
        [{"id": "one", "question": "q", "_suite": "test"}],
        lambda sample: [{"role": "user", "content": sample["question"]}],
        _Check(),
        1,
        observed.append,
    )
    assert harness.run()[0].verdict == Verdict.PASS
    assert len(observed) == 1
