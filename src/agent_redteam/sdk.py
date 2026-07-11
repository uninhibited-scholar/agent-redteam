"""Developer SDK — one-line integration for popular AI agent frameworks.

Usage:
    # Scan any agent that has a .send() or .invoke() method
    from agent_redteam import scan_agent
    report = scan_agent(my_agent)
    print(report.summary())

    # Scan a LangChain chain
    from agent_redteam import scan_langchain
    report = scan_langchain(my_chain)

    # Scan any callable (input: str → output: str)
    from agent_redteam import scan_callable
    report = scan_callable(lambda msg: my_model.generate(msg))
"""
from __future__ import annotations
from typing import Callable, Protocol
from .core.engine import Engine
from .core.result import ScanReport


class AgentLike(Protocol):
    """Anything with a .send(messages) or .invoke(messages) or __call__ method."""
    def send(self, messages: list[dict]) -> str: ...
    def invoke(self, messages: list[dict]) -> str: ...


class CallableTarget:
    """Wrap a plain callable (str → str) as a Target."""

    def __init__(self, fn: Callable[[str], str], model: str = "custom"):
        self.model = model
        self._fn = fn

    def send(self, messages: list[dict]) -> str:
        # Extract last user message
        for m in reversed(messages):
            if m.get("role") == "user":
                return self._fn(m["content"])
        return self._fn("")


class LangChainTarget:
    """Wrap a LangChain chain/agent as a Target."""

    def __init__(self, chain, model: str = "langchain"):
        self.model = model
        self._chain = chain

    def send(self, messages: list[dict]) -> str:
        # Extract last user message
        user_msg = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                user_msg = m["content"]
                break

        # Try different LangChain invocation patterns
        try:
            result = self._chain.invoke({"input": user_msg})
            if isinstance(result, str):
                return result
            if isinstance(result, dict):
                return result.get("output", result.get("result", str(result)))
            return str(result)
        except (TypeError, AttributeError):
            pass

        try:
            result = self._chain(user_msg)
            if isinstance(result, str):
                return result
            return str(result)
        except Exception:
            pass

        try:
            result = self._chain.run(user_msg)
            return str(result)
        except Exception as e:
            return f"[error: {e}]"


def scan_agent(
    agent,
    suites: list[str] | None = None,
    limit: int = 0,
    workers: int = 4,
) -> ScanReport:
    """Scan any agent-like object against the red-team test suites.

    The agent must have one of:
    - .send(messages: list[dict]) -> str
    - .invoke(messages: list[dict]) -> str
    - __call__(messages: list[dict]) -> str

    Args:
        agent: The agent to test
        suites: Specific suites to run (default: all)
        limit: Max samples per suite (0 = all)
        workers: Parallel workers

    Returns:
        ScanReport with pass/fail scores

    Example:
        >>> from agent_redteam import scan_agent
        >>> from my_app import my_agent
        >>> report = scan_agent(my_agent, suites=["injection", "info_leak"])
        >>> print(report.summary())
        >>> assert report.overall_score >= 70
    """
    # Detect the interface
    target = _wrap_target(agent)
    engine = Engine(target, max_workers=workers)

    if limit > 0:
        for suite in engine._suites.values():
            suite._limit = limit

    return engine.scan(suites=suites)


def scan_callable(
    fn: Callable[[str], str],
    suites: list[str] | None = None,
    limit: int = 0,
    model_name: str = "custom",
    workers: int = 4,
) -> ScanReport:
    """Scan a plain callable function (input: str → output: str).

    Args:
        fn: A function that takes a user message string and returns a response string
        suites: Specific suites to run (default: all)
        limit: Max samples per suite
        model_name: Display name for the report
        workers: Parallel workers

    Example:
        >>> import openai
        >>> client = openai.Client()
        >>> def chat(msg):
        ...     return client.chat.completions.create(
        ...         model="gpt-4o", messages=[{"role": "user", "content": msg}]
        ...     ).choices[0].message.content
        >>> from agent_redteam import scan_callable
        >>> report = scan_callable(chat, suites=["injection"])
    """
    target = CallableTarget(fn, model=model_name)
    engine = Engine(target, max_workers=workers)

    if limit > 0:
        for suite in engine._suites.values():
            suite._limit = limit

    return engine.scan(suites=suites)


def scan_langchain(
    chain,
    suites: list[str] | None = None,
    limit: int = 0,
    model_name: str = "langchain",
    workers: int = 4,
) -> ScanReport:
    """Scan a LangChain chain or agent.

    Args:
        chain: A LangChain Runnable (chain/agent/llm)
        suites: Specific suites to run (default: all)
        limit: Max samples per suite
        model_name: Display name for the report
        workers: Parallel workers

    Example:
        >>> from langchain_openai import ChatOpenAI
        >>> from langchain_core.prompts import ChatPromptTemplate
        >>> from agent_redteam import scan_langchain
        >>> llm = ChatOpenAI(model="gpt-4o")
        >>> prompt = ChatPromptTemplate.from_messages([
        ...     ("system", "You are a helpful assistant."),
        ...     ("user", "{input}"),
        ... ])
        >>> chain = prompt | llm
        >>> report = scan_langchain(chain, suites=["injection", "info_leak"])
    """
    target = LangChainTarget(chain, model=model_name)
    engine = Engine(target, max_workers=workers)

    if limit > 0:
        for suite in engine._suites.values():
            suite._limit = limit

    return engine.scan(suites=suites)


def _wrap_target(agent) -> object:
    """Detect the agent's interface and wrap it as a Target-compatible object."""
    # Already has .send()
    if hasattr(agent, "send") and callable(agent.send):
        # Check it takes messages parameter
        return agent

    # Has .invoke() (LangChain)
    if hasattr(agent, "invoke") and callable(agent.invoke):
        return LangChainTarget(agent)

    # Is callable
    if callable(agent):
        return CallableTarget(agent)

    raise TypeError(
        f"Agent must have .send(messages), .invoke(messages), or be callable. "
        f"Got: {type(agent).__name__}"
    )
