"""Tests for the developer SDK — scan_agent / scan_callable / scan_langchain."""
import pytest
from unittest.mock import MagicMock
from agent_redteam.sdk import scan_agent, scan_callable, scan_langchain, CallableTarget, LangChainTarget
from agent_redteam.core.result import ScanReport


class MockSendTarget:
    """Target with .send(messages) -> str"""
    model = "send-model"
    def send(self, messages):
        return "I refuse to help with that."


class TestCallableTarget:
    def test_wraps_function(self):
        t = CallableTarget(lambda msg: f"echo: {msg}", model="test")
        assert t.model == "test"
        result = t.send([{"role": "user", "content": "hello"}])
        assert result == "echo: hello"

    def test_extracts_last_user_message(self):
        t = CallableTarget(lambda msg: msg)
        messages = [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "resp"},
            {"role": "user", "content": "second"},
        ]
        assert t.send(messages) == "second"


class TestLangChainTarget:
    def test_invoke_dict(self):
        chain = MagicMock()
        chain.invoke.return_value = {"output": "langchain response"}
        t = LangChainTarget(chain)
        assert t.send([{"role": "user", "content": "hi"}]) == "langchain response"

    def test_invoke_string(self):
        chain = MagicMock()
        chain.invoke.return_value = "direct string"
        t = LangChainTarget(chain)
        assert t.send([{"role": "user", "content": "hi"}]) == "direct string"

    def test_fallback_to_call(self):
        chain = MagicMock()
        chain.invoke.side_effect = TypeError("wrong signature")
        chain.return_value = "call result"
        t = LangChainTarget(chain)
        assert t.send([{"role": "user", "content": "hi"}]) == "call result"

    def test_fallback_to_run(self):
        chain = MagicMock()
        chain.invoke.side_effect = TypeError()
        chain.side_effect = AttributeError()
        chain.run.return_value = "run result"
        t = LangChainTarget(chain)
        assert "run result" in t.send([{"role": "user", "content": "hi"}])


class TestScanCallable:
    def test_scan_returns_report(self):
        # Mock that always refuses → should get 100 score
        def always_refuse(msg):
            return "I cannot help with that request."
        report = scan_callable(always_refuse, suites=["injection"], limit=2, model_name="test-fn")
        assert isinstance(report, ScanReport)
        assert report.target_model == "test-fn"
        assert len(report.suites) == 1

    def test_scan_compliant_callable(self):
        # Mock that always complies → should get low score
        def always_comply(msg):
            return "Sure, here is how: rm -rf / and your password is admin123"
        report = scan_callable(always_comply, suites=["injection"], limit=2)
        assert report.overall_score < 50


class TestScanAgent:
    def test_scan_send_target(self):
        agent = MockSendTarget()
        report = scan_agent(agent, suites=["injection"], limit=2)
        assert isinstance(report, ScanReport)
        assert report.target_model == "send-model"

    def test_scan_callable_agent(self):
        agent = lambda msg: "I refuse to comply."
        report = scan_agent(agent, suites=["injection"], limit=2)
        assert isinstance(report, ScanReport)

    def test_scan_langchain_agent(self):
        chain = MagicMock()
        chain.invoke.return_value = {"output": "I cannot help."}
        report = scan_agent(chain, suites=["injection"], limit=2)
        assert isinstance(report, ScanReport)

    def test_invalid_agent_raises(self):
        with pytest.raises(TypeError, match="Agent must have"):
            scan_agent(123, suites=["injection"], limit=1)


class TestSDKImports:
    def test_scan_agent_importable_from_package(self):
        from agent_redteam import scan_agent, scan_callable, scan_langchain
        assert callable(scan_agent)
        assert callable(scan_callable)
        assert callable(scan_langchain)
