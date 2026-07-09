"""First-run onboarding helpers.

The init workflow creates a local scan config and prints the exact next
commands a new user can run. It deliberately avoids contacting providers or
running scans; onboarding should be predictable, offline, and safe for CI.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
from typing import Literal


OutputFormat = Literal["terminal", "json", "markdown"]


PROVIDER_DEFAULTS = {
    "openai": {
        "model": "gpt-4o",
        "base_url": "https://api.openai.com/v1",
        "needs_key": True,
    },
    "claude": {
        "model": "claude-3-5-sonnet-latest",
        "base_url": "",
        "needs_key": True,
    },
    "zai": {
        "model": "GLM-5.2",
        "base_url": "https://api.z.ai/api/anthropic/v1",
        "needs_key": True,
    },
    "deepseek": {
        "model": "deepseek-chat",
        "base_url": "https://api.deepseek.com/v1",
        "needs_key": True,
    },
    "qwen": {
        "model": "qwen-plus",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "needs_key": True,
    },
    "azure": {
        "model": "<azure-deployment-name>",
        "base_url": "https://<resource>.openai.azure.com",
        "needs_key": True,
    },
    "ollama": {
        "model": "llama3",
        "base_url": "http://localhost:11434",
        "needs_key": False,
    },
    "local": {
        "model": "local-agent",
        "base_url": "",
        "needs_key": False,
    },
}


@dataclass
class InitOptions:
    target: str = "openai"
    model: str = ""
    base_url: str = ""
    api_key: str = ""
    suites: str = "injection,info_leak,supply_chain"
    workers: int = 4
    max_tokens: int = 500
    fail_below: float = 70
    config_path: str = ""
    force: bool = False
    dry_run: bool = False


@dataclass
class InitResult:
    path: str
    target: str
    model: str
    base_url: str
    key_configured: bool
    existed: bool
    written: bool
    dry_run: bool
    content_preview: str
    next_commands: list[str]
    warnings: list[str]

    def to_dict(self) -> dict:
        return asdict(self)


def default_config_path() -> Path:
    return Path(os.path.expanduser("~/.agent-redteam/config"))


def initialize_project(options: InitOptions) -> InitResult:
    target = options.target or "openai"
    defaults = PROVIDER_DEFAULTS.get(target, PROVIDER_DEFAULTS["openai"])
    model = options.model or defaults["model"]
    base_url = options.base_url if options.base_url else defaults["base_url"]
    path = Path(options.config_path).expanduser() if options.config_path else default_config_path()
    existed = path.exists()
    warnings: list[str] = []

    if existed and not options.force and not options.dry_run:
        warnings.append("Config already exists; pass --force to overwrite it.")

    if defaults["needs_key"] and not options.api_key:
        warnings.append("No API key was provided; the config contains a placeholder you must edit before scanning.")

    content = build_config_content(
        target=target,
        model=model,
        base_url=base_url,
        api_key=options.api_key,
        suites=options.suites,
        workers=options.workers,
        max_tokens=options.max_tokens,
        fail_below=options.fail_below,
        needs_key=bool(defaults["needs_key"]),
    )
    written = False
    if not options.dry_run and (not existed or options.force):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        try:
            path.chmod(0o600)
        except OSError:
            warnings.append("Could not set config permissions to 0600 on this platform.")
        written = True

    return InitResult(
        path=str(path),
        target=target,
        model=model,
        base_url=base_url,
        key_configured=bool(options.api_key) or not defaults["needs_key"],
        existed=existed,
        written=written,
        dry_run=options.dry_run,
        content_preview=_redacted_config(content),
        next_commands=next_commands(target=target, model=model, base_url=base_url),
        warnings=warnings,
    )


def build_config_content(
    *,
    target: str,
    model: str,
    base_url: str,
    api_key: str,
    suites: str,
    workers: int,
    max_tokens: int,
    fail_below: float,
    needs_key: bool,
) -> str:
    key_value = api_key if api_key else ("<paste-api-key-here>" if needs_key else "")
    lines = [
        "# Agent Redteam local scan config",
        "# Created by: agent-redteam init",
        "# Security: keep this file local; API keys must never be committed.",
        "",
        f"target: {target}",
        f"model: {model}",
    ]
    if base_url:
        lines.append(f"base_url: {base_url}")
    if needs_key:
        lines.append(f"api_key: {key_value}")
    lines.extend([
        "",
        "# Fast first-run suites. Remove this line or set suites: all for a full benchmark.",
        f"suites: {suites}",
        f"workers: {workers}",
        f"max_tokens: {max_tokens}",
        f"fail_below: {fail_below:g}",
        "",
    ])
    return "\n".join(lines)


def next_commands(*, target: str, model: str, base_url: str) -> list[str]:
    scan = f"agent-redteam scan --target {target} --model {model} --limit 3"
    if target == "ollama":
        scan = f"agent-redteam scan --target ollama --model {model} --limit 3"
    elif target == "local":
        scan = "agent-redteam scan --target local --model local-agent --endpoint http://127.0.0.1:8000 --limit 3"
    return [
        "agent-redteam list",
        scan,
        "agent-redteam serve",
        "agent-redteam doctor",
    ]


def render_init_terminal(result: InitResult) -> str:
    status = "written" if result.written else "dry-run" if result.dry_run else "not written"
    lines = [
        "",
        "Agent Redteam Init",
        f"Config: {result.path} ({status})",
        f"Target: {result.target}",
        f"Model: {result.model}",
        f"API key configured: {'yes' if result.key_configured else 'no'}",
    ]
    if result.base_url:
        lines.append(f"Base URL: {result.base_url}")
    if result.warnings:
        lines.extend(["", "Warnings:"])
        lines.extend(f"- {w}" for w in result.warnings)
    lines.extend([
        "",
        "Config preview:",
        "```",
        result.content_preview.rstrip(),
        "```",
        "",
        "Next commands:",
    ])
    lines.extend(f"  {cmd}" for cmd in result.next_commands)
    lines.append("")
    return "\n".join(lines)


def render_init_markdown(result: InitResult) -> str:
    lines = [
        "# Agent Redteam Init",
        "",
        f"- **Config:** `{result.path}`",
        f"- **Written:** `{result.written}`",
        f"- **Target:** `{result.target}`",
        f"- **Model:** `{result.model}`",
        f"- **API key configured:** `{result.key_configured}`",
    ]
    if result.warnings:
        lines.extend(["", "## Warnings", ""])
        lines.extend(f"- {w}" for w in result.warnings)
    lines.extend(["", "## Next Commands", ""])
    lines.extend(f"```bash\n{cmd}\n```" for cmd in result.next_commands)
    lines.append("")
    return "\n".join(lines)


def render_init_json(result: InitResult) -> str:
    return json.dumps(result.to_dict(), ensure_ascii=False, indent=2)


def _redacted_config(content: str) -> str:
    lines = []
    for line in content.splitlines():
        if line.strip().startswith("api_key:") and "<paste-api-key-here>" not in line:
            lines.append("api_key: [REDACTED]")
        else:
            lines.append(line)
    return "\n".join(lines) + "\n"
