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
