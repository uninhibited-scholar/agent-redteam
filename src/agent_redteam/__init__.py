"""Agent Redteam — AI Agent 红队安全测试平台。

核心 API:
    from agent_redteam import Engine, OpenAITarget

    target = OpenAITarget(model="gpt-4o", base_url="https://api.openai.com/v1", api_key="sk-...")
    engine = Engine(target)
    report = engine.scan()
    print(report.summary())
"""
from .core.engine import Engine
from .core.result import ScanReport, SuiteResult, SampleResult, Verdict

__version__ = "0.2.0"
__all__ = ["Engine", "ScanReport", "SuiteResult", "SampleResult", "Verdict"]
