"""YAML-like configuration for scan profiles.

Uses stdlib only — a minimal key: value parser (no yaml dependency).
Supports .redteam.yml files with target/suite/parameter presets.

Example .redteam.yml:
    model: glm-4-plus
    base_url: https://open.bigmodel.cn/api/paas/v4
    suites: injection,info_leak,sensitive_data
    max_tokens: 300
    workers: 6
    fail_below: 80
"""
from __future__ import annotations
import os, re
from typing import Optional


PROFILE_NAMES = [".redteam.yml", ".redteam.yaml", "redteam.yml"]


def find_profile(start_dir: str = ".") -> Optional[str]:
    """Find a .redteam.yml file in the current or parent directories."""
    d = os.path.abspath(start_dir)
    for _ in range(5):  # Check up to 5 levels up
        for name in PROFILE_NAMES:
            path = os.path.join(d, name)
            if os.path.isfile(path):
                return path
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    return None


def load_profile(path: str) -> dict:
    """Load a .redteam.yml file. Returns a dict of config values."""
    config = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r'^(\w+)\s*:\s*(.+)$', line)
            if m:
                key, val = m.group(1), m.group(2).strip()
                # Try to convert numeric values
                if val.isdigit():
                    config[key] = int(val)
                elif re.match(r'^\d+\.\d+$', val):
                    config[key] = float(val)
                elif val.lower() in ("true", "false"):
                    config[key] = val.lower() == "true"
                else:
                    config[key] = val
    return config


def load_default_profile() -> dict:
    """Load profile from the current directory if it exists."""
    path = find_profile()
    if path:
        return load_profile(path)
    return {}


# --- Scan config (~/.agent-redteam/config) — API key storage, never exposed ---

_CONFIG_PATH = os.path.join(os.path.expanduser("~/.agent-redteam"), "config")
_CONFIG_KEYS = ("api_key", "base_url", "model", "workers", "max_tokens")


def _config_path() -> str:
    os.makedirs(os.path.dirname(_CONFIG_PATH), exist_ok=True)
    return _CONFIG_PATH


def load_scan_config() -> dict:
    """Load scan config from ~/.agent-redteam/config, falling back to env vars.

    Reads a simple ``key: value`` file (same parser as profiles). Recognised
    keys: api_key, base_url, model, workers, max_tokens. Unknown keys are
    ignored. Environment variables OPENAI_API_KEY / OPENAI_BASE_URL act as a
    fallback when the file omits the corresponding field.

    SECURITY: the returned dict contains the api_key for in-process use by the
    scan engine ONLY. It must never be serialised into an HTTP response, log
    line, or frontend payload — use ``has_api_key()`` / ``scan_config_status()``
    for any externally-visible status.
    """
    cfg: dict = {}
    path = _config_path()
    if os.path.isfile(path):
        cfg = load_profile(path)
        # Restrict to recognised keys
        cfg = {k: v for k, v in cfg.items() if k in _CONFIG_KEYS}

    # Env fallbacks
    if not cfg.get("api_key"):
        env_key = os.environ.get("OPENAI_API_KEY", "")
        if env_key:
            cfg["api_key"] = env_key
    if not cfg.get("base_url"):
        env_url = os.environ.get("OPENAI_BASE_URL", "")
        if env_url:
            cfg["base_url"] = env_url
    return cfg


def has_api_key() -> bool:
    """Return True iff an API key is available (file or env)."""
    return bool(load_scan_config().get("api_key"))


def scan_config_status() -> dict:
    """Externally-safe view of the scan config — NO api_key.

    Used by the dashboard API so the frontend can show whether a key is
    configured and pre-fill model/base_url defaults without ever receiving the
    key itself.
    """
    cfg = load_scan_config()
    return {
        "key_configured": bool(cfg.get("api_key")),
        "default_model": cfg.get("model", ""),
        "default_base_url": cfg.get("base_url", ""),
        "config_path": _config_path(),
    }


def create_profile(path: str, **kwargs) -> str:
    """Create a .redteam.yml file with the given values."""
    lines = ["# Agent Redteam scan profile", ""]
    defaults = {
        "model": "gpt-4o",
        "base_url": "https://api.openai.com/v1",
        "suites": "all",
        "max_tokens": 500,
        "workers": 4,
        "fail_below": 0,
    }
    defaults.update(kwargs)
    for k, v in defaults.items():
        lines.append(f"{k}: {v}")
    content = "\n".join(lines) + "\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return content
