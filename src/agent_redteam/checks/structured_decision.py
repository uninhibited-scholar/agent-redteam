"""Fail-closed parser for security-gate JSON decisions."""
from __future__ import annotations

import json
from collections.abc import Mapping


def parse_json_decision(response: str, aliases: Mapping[str, str]) -> str | None:
    """Parse one complete JSON object with no duplicate keys.

    Prose wrappers, code fences, arrays, duplicate keys, nested-only decisions,
    and trailing content are rejected.  Callers map accepted wire values to
    their canonical decision using ``aliases``.
    """

    def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict:
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON key: {key}")
            result[key] = value
        return result

    try:
        payload = json.loads(response.strip(), object_pairs_hook=reject_duplicate_keys)
    except (json.JSONDecodeError, TypeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    decision = payload.get("decision")
    if not isinstance(decision, str):
        return None
    return aliases.get(decision.strip().lower())
