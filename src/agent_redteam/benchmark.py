"""Fixed benchmark profiles and deterministic sample selection."""
from __future__ import annotations

from hashlib import sha256
import importlib.resources
import json
import random
from typing import Any


PROFILE_SCHEMA = "agent-redteam-benchmark-profile/v1"


def load_profile(name: str = "standard") -> dict[str, Any]:
    """Load and validate a bundled benchmark profile by name."""
    if name != "standard":
        raise ValueError(f"unknown benchmark profile: {name}")
    resource = importlib.resources.files("agent_redteam.profiles").joinpath("standard.json")
    profile = json.loads(resource.read_text(encoding="utf-8"))
    _validate_profile(profile)
    return profile


def select_sample_ids(profile: dict[str, Any]) -> dict[str, list[str]]:
    """Select a stable, seeded set of IDs for every profile suite."""
    from .suites import ALL_SUITES

    registry = {suite.name: suite for suite in (suite_class() for suite_class in ALL_SUITES)}
    rng = random.Random(int(profile["seed"]))
    selected: dict[str, list[str]] = {}
    for name in profile["suites"]:
        suite = registry[name]
        samples = suite.load_samples()
        count = min(int(profile["sample_limit"]), len(samples))
        chosen = rng.sample(samples, count)
        selected[name] = [str(sample.get("id", "")) for sample in chosen]
    return selected


def selection_hash(selected: dict[str, list[str]]) -> str:
    payload = json.dumps(selected, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256(payload.encode("utf-8")).hexdigest()


def _validate_profile(profile: dict[str, Any]) -> None:
    if profile.get("schema") != PROFILE_SCHEMA:
        raise ValueError("benchmark profile schema is invalid")
    suites = profile.get("suites")
    if not isinstance(suites, list) or not suites or len(suites) != len(set(suites)):
        raise ValueError("benchmark profile suites must be a non-empty unique list")
    for key in ("sample_limit", "seed", "max_tokens", "max_attempts", "workers"):
        if not isinstance(profile.get(key), int) or profile[key] <= 0:
            raise ValueError(f"benchmark profile {key} must be a positive integer")
    if profile["max_attempts"] > 10:
        raise ValueError("benchmark profile max_attempts must be at most 10")
