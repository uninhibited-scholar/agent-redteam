"""Tests for target adapters — constructor validation, proxy detection, message format.

These tests do NOT hit real APIs. They verify:
- Constructor validation (missing API key raises)
- Proxy detection logic (env vars + port probing)
- Message format construction (Anthropic system extraction, OpenAI format)
- LocalTarget message extraction
- Response parsing (mocked)
"""
import json
import os
import sys
import pytest
from unittest.mock import patch, MagicMock
from io import BytesIO


class TestOpenAITarget:
    def test_missing_api_key_raises(self):
        """OpenAITarget must raise if no API key provided."""
        from agent_redteam.targets import OpenAITarget
        with pytest.raises(ValueError, match="API key"):
            OpenAITarget(model="gpt-4o", api_key="")

    def test_constructor_stores_params(self):
        from agent_redteam.targets import OpenAITarget
        t = OpenAITarget(model="gpt-4o", api_key="sk-test", base_url="https://api.openai.com/v1")
        assert t.model == "gpt-4o"
        assert t.api_key == "sk-test"
        assert t.base_url == "https://api.openai.com/v1"

    def test_base_url_trailing_slash_stripped(self):
        from agent_redteam.targets import OpenAITarget
        t = OpenAITarget(model="m", api_key="k", base_url="https://example.com/v1/")
        assert t.base_url == "https://example.com/v1"

    def test_env_api_key(self):
        from agent_redteam.targets import OpenAITarget
        with patch.dict(os.environ, {"OPENAI_API_KEY": "env-key"}):
            t = OpenAITarget(model="m")
            assert t.api_key == "env-key"

    def test_send_builds_correct_body(self):
        """Verify send() constructs the right request body."""
        from agent_redteam.targets import OpenAITarget
        t = OpenAITarget(model="gpt-4o", api_key="sk-test")

        captured_body = {}
        def mock_urlopen(req, **kw):
            captured_body['data'] = json.loads(req.data)
            captured_body['url'] = req.full_url
            captured_body['headers'] = dict(req.header_items())
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps({
                "choices": [{"message": {"content": "hello"}}]
            }).encode()
            mock_resp.__enter__ = lambda s: mock_resp
            mock_resp.__exit__ = MagicMock(return_value=False)
            return mock_resp

        with patch('urllib.request.urlopen', side_effect=mock_urlopen):
            result = t.send([{"role": "user", "content": "hi"}])

        assert result == "hello"
        assert captured_body['data']['model'] == 'gpt-4o'
        assert captured_body['data']['temperature'] == 0
        assert captured_body['data']['messages'] == [{"role": "user", "content": "hi"}]
        assert '/chat/completions' in captured_body['url']

    def test_send_fallback_to_reasoning_content(self):
        """Thinking models may put text in reasoning_content when content is empty."""
        from agent_redteam.targets import OpenAITarget
        t = OpenAITarget(model="o1", api_key="k")
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "choices": [{"message": {"content": "", "reasoning_content": "the answer"}}]
        }).encode()
        mock_resp.__enter__ = lambda s: mock_resp
        mock_resp.__exit__ = MagicMock(return_value=False)
        with patch('urllib.request.urlopen', return_value=mock_resp):
            result = t.send([{"role": "user", "content": "hi"}])
        assert result == "the answer"


class TestZaiTarget:
    def test_missing_api_key_raises(self):
        from agent_redteam.targets import ZaiTarget
        with pytest.raises(ValueError, match="API key"):
            ZaiTarget(model="GLM-5.2", api_key="")

    def test_env_api_key(self):
        from agent_redteam.targets import ZaiTarget
        with patch.dict(os.environ, {"ZAI_API_KEY": "env-key"}):
            t = ZaiTarget(model="GLM-5.2")
            assert t.api_key == "env-key"

    def test_constructor_with_proxy(self):
        from agent_redteam.targets import ZaiTarget
        t = ZaiTarget(model="GLM-5.2", api_key="k", proxy="http://127.0.0.1:7890")
        assert t.model == "GLM-5.2"
        assert t._opener is not None

    def test_send_extracts_system_message(self):
        """ZaiTarget uses Anthropic format — system message goes to top-level system param."""
        from agent_redteam.targets import ZaiTarget
        t = ZaiTarget(model="GLM-5.2", api_key="k")

        captured = {}
        def mock_open(req, **kw):
            captured['body'] = json.loads(req.data)
            captured['headers'] = dict(req.header_items())
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps({
                "content": [{"type": "text", "text": "response"}]
            }).encode()
            mock_resp.__enter__ = lambda s: mock_resp
            mock_resp.__exit__ = MagicMock(return_value=False)
            return mock_resp

        with patch.object(t, '_opener') as mock_opener:
            mock_opener.open.side_effect = mock_open
            result = t.send([
                {"role": "system", "content": "You are a bot"},
                {"role": "user", "content": "hi"},
            ])

        assert result == "response"
        # System should be extracted to top-level, not in messages
        assert captured['body']['system'] == "You are a bot"
        assert all(m['role'] != 'system' for m in captured['body']['messages'])
        assert captured['body']['model'] == 'GLM-5.2'
        # x-api-key header (Anthropic style, not Bearer)
        assert any('x-api-key' in k.lower() for k in captured['headers'])

    def test_proxy_detection_from_env(self):
        """_detect_proxy should read HTTPS_PROXY env var."""
        from agent_redteam.targets.zai_target import _detect_proxy
        with patch.dict(os.environ, {"HTTPS_PROXY": "http://proxy.example.com:8080"}):
            result = _detect_proxy()
        assert result is not None

    def test_proxy_detection_no_proxy(self):
        """_detect_proxy returns None when no proxy available."""
        from agent_redteam.targets.zai_target import _detect_proxy
        # Clear all proxy env vars
        env_backup = {}
        for var in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
            if var in os.environ:
                env_backup[var] = os.environ.pop(var)
        try:
            with patch('socket.socket') as mock_sock:
                mock_sock.return_value.connect.side_effect = ConnectionRefusedError()
                result = _detect_proxy()
            assert result is None
        finally:
            os.environ.update(env_backup)


class TestLocalTarget:
    def test_constructor(self):
        from agent_redteam.targets import LocalTarget
        t = LocalTarget(endpoint="http://localhost:8000/chat")
        assert t.endpoint == "http://localhost:8000/chat"
        assert t.model == "local-agent"

    def test_custom_model_name(self):
        from agent_redteam.targets import LocalTarget
        t = LocalTarget(endpoint="http://localhost:8000/chat", model="my-agent")
        assert t.model == "my-agent"

    def test_send_extracts_last_user_message(self):
        from agent_redteam.targets import LocalTarget
        t = LocalTarget(endpoint="http://localhost:8000/chat")

        captured = {}
        def mock_urlopen(req, **kw):
            captured['body'] = json.loads(req.data)
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps({"response": "ok"}).encode()
            mock_resp.__enter__ = lambda s: mock_resp
            mock_resp.__exit__ = MagicMock(return_value=False)
            return mock_resp

        with patch('urllib.request.urlopen', side_effect=mock_urlopen):
            result = t.send([
                {"role": "system", "content": "sys"},
                {"role": "user", "content": "first"},
                {"role": "assistant", "content": "reply"},
                {"role": "user", "content": "second"},
            ])

        assert result == "ok"
        # Last user message should be the "message" field
        assert captured['body']['message'] == "second"

    def test_send_accepts_string_response(self):
        from agent_redteam.targets import LocalTarget
        t = LocalTarget(endpoint="http://localhost:8000/chat")
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'"plain string response"'
        mock_resp.__enter__ = lambda s: mock_resp
        mock_resp.__exit__ = MagicMock(return_value=False)
        with patch('urllib.request.urlopen', return_value=mock_resp):
            result = t.send([{"role": "user", "content": "hi"}])
        assert result == "plain string response"


class TestTargetBase:
    def test_repr(self):
        from agent_redteam.targets import LocalTarget
        t = LocalTarget(endpoint="http://localhost:8000/chat", model="test-model")
        assert "LocalTarget" in repr(t)
        assert "test-model" in repr(t)

    def test_abstract_cannot_instantiate(self):
        from agent_redteam.targets.base import Target
        with pytest.raises(TypeError):
            Target()
