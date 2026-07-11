"""Agent Redteam — AI Agent 红队安全测试平台。

核心 API:
    from agent_redteam import Engine, OpenAITarget

    target = OpenAITarget(model="gpt-4o", base_url="https://api.openai.com/v1", api_key="sk-...")
    engine = Engine(target)
    report = engine.scan()
    print(report.summary())

SDK API (one-line integration):
    from agent_redteam import scan_agent, scan_callable, scan_langchain
    report = scan_agent(my_agent)
    report = scan_callable(lambda msg: model.generate(msg))
"""
from .core.engine import Engine
from .core.result import ScanReport, SuiteResult, SampleResult, Verdict
from .sdk import scan_agent, scan_callable, scan_langchain

__version__ = "0.5.0"
__all__ = [
    "Engine", "ScanReport", "SuiteResult", "SampleResult", "Verdict",
    "scan_agent", "scan_callable", "scan_langchain",
]
