"""Settings API — manage user preferences via /api/settings endpoints.

Settings are stored in ~/.agent-redteam/settings.json.
"""
from __future__ import annotations
import json, os

SETTINGS_PATH = os.path.expanduser("~/.agent-redteam/settings.json")

DEFAULT_SETTINGS = {
    "default_model": "",
    "default_base_url": "https://api.openai.com/v1",
    "workers": 4,
    "max_tokens": 500,
    "fail_below": 0,
    "theme": "dark",
    "notifications": True,
    "auto_open_browser": True,
}


def load_settings() -> dict:
    """Load settings from disk, falling back to defaults."""
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, encoding="utf-8") as f:
                saved = json.load(f)
            return {**DEFAULT_SETTINGS, **saved}
        except (json.JSONDecodeError, OSError):
            pass
    return dict(DEFAULT_SETTINGS)


def save_settings(settings: dict) -> None:
    """Save settings to disk."""
    os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)


def merge_settings(updates: dict) -> dict:
    """Merge updates into existing settings and save."""
    current = load_settings()
    current.update(updates)
    save_settings(current)
    return current
