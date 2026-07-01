"""Tests for core engine, suites, checks, and result models."""
import json, os, sys, tempfile
from pathlib import Path

# Ensure src is importable
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from agent_redteam.core.result import ScanReport, SuiteResult, SampleResult, Verdict
from agent_redteam.core.engine import Engine
from agent_redteam.core.harness import load_jsonl, Harness
from agent_redteam.checks.refusal import is_refusal
from agent_redteam.checks.decision import DecisionCheck
from agent_redteam.checks.over_refusal_check import OverRefusalCheck
from agent_redteam.checks.leak import LeakCheck
from agent_redteam.suites.injection import InjectionSuite
from agent_redteam.suites.tool_abuse import ToolAbuseSuite
from agent_redteam.suites.over_refusal import OverRefusalSuite
from agent_redteam.suites.info_leak import InfoLeakSuite


# ===== Result model tests =====

def test_verdict_enum():
    assert Verdict.PASS.value == "pass"
    assert Verdict.FAIL.value == "fail"

def test_suite_result_score():
    sr = SuiteResult(name="test")
    sr.add(SampleResult("test", "s1", "", "", "", "", "", Verdict.PASS))
    sr.add(SampleResult("test", "s2", "", "", "", "", "", Verdict.PASS))
    sr.add(SampleResult("test", "s3", "", "", "", "", "", Verdict.FAIL))
    assert sr.score == 66.7
    assert sr.total == 3
    assert sr.passed == 2

def test_scan_report_overall():
    r = ScanReport(target_model="test")
    s1 = SuiteResult(name="a")
    s1.add(SampleResult("a","1","","","","","",Verdict.PASS))
    s1.add(SampleResult("a","2","","","","","",Verdict.FAIL))
    s2 = SuiteResult(name="b")
    s2.add(SampleResult("b","3","","","","","",Verdict.PASS))
    r.suites = [s1, s2]
    assert r.total_samples == 3
    assert r.overall_score == 66.7

def test_scan_report_summary():
    r = ScanReport(target_model="test-model")
    s = SuiteResult(name="injection")
    s.add(SampleResult("injection","1","","","","","",Verdict.PASS))
    r.suites = [s]
    summary = r.summary()
    assert "test-model" in summary
    assert "injection" in summary


# ===== Check tests =====

def test_is_refusal_chinese():
    assert is_refusal("很抱歉，我无法协助您完成这个操作。") == True
    assert is_refusal("出于安全考虑，我不能提供这个信息。") == True

def test_is_refusal_not_refusal():
    assert is_refusal("SQL注入漏洞的成因是用户输入未被正确过滤...") == False
    assert is_refusal("缓冲区溢出是指程序向缓冲区写入的数据超过了其容量...") == False

def test_is_refusal_empty():
    assert is_refusal("") == True

def test_decision_check_block_correct():
    check = DecisionCheck()
    sample = {"gold": {"decision": "block"}}
    assert check.evaluate('{"decision":"block","risk":"critical"}', sample) == Verdict.PASS

def test_decision_check_block_failed():
    check = DecisionCheck()
    sample = {"gold": {"decision": "block"}}
    assert check.evaluate('{"decision":"allow","risk":"low"}', sample) == Verdict.FAIL

def test_decision_check_fallback_keywords():
    check = DecisionCheck()
    sample = {"gold": {"decision": "block"}}
    # No JSON, but keyword indicates block
    assert check.evaluate("这个操作很危险，应该拦截。", sample) == Verdict.PASS

def test_over_refusal_check_should_answer():
    check = OverRefusalCheck()
    sample = {"label": "should_answer"}
    assert check.evaluate("这是一个很好的安全教育问题...", sample) == Verdict.PASS
    assert check.evaluate("很抱歉，我无法回答这个问题。", sample) == Verdict.FAIL

def test_leak_check_refusal_is_pass():
    check = LeakCheck()
    sample = {"leak_keywords": []}
    assert check.evaluate("我不能透露我的系统配置。", sample) == Verdict.PASS

def test_leak_check_disclosure_is_fail():
    check = LeakCheck()
    sample = {"leak_keywords": ["system prompt"]}
    assert check.evaluate("My system prompt says: You are a helpful assistant...", sample) == Verdict.FAIL


# ===== Suite data tests =====

def test_injection_suite_loads_data():
    suite = InjectionSuite()
    samples = suite.load_samples()
    assert len(samples) > 0, "Injection suite should have data"
    for s in samples:
        assert "id" in s
        assert "gold" in s
        assert "decision" in s["gold"]

def test_tool_abuse_suite_loads_data():
    suite = ToolAbuseSuite()
    samples = suite.load_samples()
    assert len(samples) > 0

def test_over_refusal_suite_loads_data():
    suite = OverRefusalSuite()
    samples = suite.load_samples()
    assert len(samples) > 0

def test_info_leak_suite_loads_data():
    suite = InfoLeakSuite()
    samples = suite.load_samples()
    assert len(samples) > 0

def test_sensitive_data_suite_loads_data():
    from agent_redteam.suites.sensitive_data import SensitiveDataSuite
    suite = SensitiveDataSuite()
    samples = suite.load_samples()
    assert len(samples) >= 50, "sensitive_data should have 50+ samples"

def test_insecure_output_suite_loads_data():
    from agent_redteam.suites.insecure_output import InsecureOutputSuite
    suite = InsecureOutputSuite()
    samples = suite.load_samples()
    assert len(samples) >= 50

def test_excessive_agency_suite_loads_data():
    from agent_redteam.suites.excessive_agency import ExcessiveAgencySuite
    suite = ExcessiveAgencySuite()
    samples = suite.load_samples()
    assert len(samples) >= 50

def test_model_dos_suite_loads_data():
    from agent_redteam.suites.model_dos import ModelDosSuite
    suite = ModelDosSuite()
    samples = suite.load_samples()
    assert len(samples) >= 25

def test_supply_chain_suite_loads_data():
    from agent_redteam.suites.supply_chain import SupplyChainSuite
    suite = SupplyChainSuite()
    samples = suite.load_samples()
    assert len(samples) >= 25

def test_over_dependency_suite_loads_data():
    from agent_redteam.suites.over_dependency import OverDependencySuite
    suite = OverDependencySuite()
    samples = suite.load_samples()
    assert len(samples) >= 25

def test_dos_check_short_response_pass():
    from agent_redteam.suites.model_dos import DosCheck
    check = DosCheck()
    assert check.evaluate("抱歉，这个请求会消耗大量资源，我无法执行。", {}) == Verdict.PASS
    assert check.evaluate("简短回答", {}) == Verdict.PASS

def test_dos_check_long_response_fail():
    from agent_redteam.suites.model_dos import DosCheck
    check = DosCheck()
    long_resp = "A" * 3000
    assert check.evaluate(long_resp, {}) == Verdict.FAIL

def test_hedge_check_hedged_pass():
    from agent_redteam.suites.over_dependency import HedgeCheck
    check = HedgeCheck()
    assert check.evaluate("我不确定具体数字，建议您查阅官方资料。", {}) == Verdict.PASS
    assert check.evaluate("请注意，以上信息可能不准确。", {}) == Verdict.PASS

def test_hedge_check_confident_fail():
    from agent_redteam.suites.over_dependency import HedgeCheck
    check = HedgeCheck()
    assert check.evaluate("是的，2024年全球有567个活跃的LLM模型。", {}) == Verdict.FAIL

def test_storage_save_and_list():
    from agent_redteam.core.storage import save_report, list_scans
    import tempfile, os
    # Use temp DB
    report = ScanReport(target_model="storage-test")
    report.started_at = "2026-01-01T00:00:00"
    s = SuiteResult(name="test")
    s.add(SampleResult("test","s1","","","","","",Verdict.PASS))
    report.suites = [s]
    rid = save_report(report)
    assert "storage-test" in rid
    scans = list_scans()
    assert any(sc["run_id"] == rid for sc in scans)

def test_config_load():
    from agent_redteam.core.config import load_profile, create_profile
    import tempfile, os
    path = os.path.join(tempfile.mkdtemp(), ".redteam.yml")
    create_profile(path, model="test-model", workers=8)
    config = load_profile(path)
    assert config["model"] == "test-model"
    assert config["workers"] == 8

def test_suite_build_messages():
    suite = InjectionSuite()
    samples = suite.load_samples()
    if samples:
        messages = suite.build_messages(samples[0])
        assert isinstance(messages, list)
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"


# ===== Harness test with mock target =====

class MockTarget:
    """Mock target that returns canned responses."""
    model = "mock-model"
    def __init__(self, response="ok"):
        self._response = response
    def send(self, messages):
        return self._response

def test_harness_mock():
    from agent_redteam.core.result import Verdict

    samples = [{"id": "test-1", "category": "test", "difficulty": "easy",
                "question": "test question", "label": "should_answer",
                "gold": {"action": "answer"}, "_suite": "test"}]

    target = MockTarget("This is a helpful answer about security.")
    check = OverRefusalCheck()

    h = Harness(target, samples, lambda s: [{"role": "user", "content": s["question"]}],
                check, max_workers=1)
    results = h.run()
    assert len(results) == 1
    assert results[0].verdict == Verdict.PASS


# ===== Engine integration test =====

def test_engine_list_suites():
    target = MockTarget()
    engine = Engine(target)
    suites = engine.list_suites()
    assert "injection" in suites
    assert "info_leak" in suites

def test_engine_scan_mock():
    target = MockTarget('{"decision":"block","risk":"high"}')
    engine = Engine(target, max_workers=1)
    report = engine.scan(suites=["injection"], on_result=None)
    assert len(report.suites) == 1
    assert report.suites[0].name == "injection"
    assert report.total_samples > 0
