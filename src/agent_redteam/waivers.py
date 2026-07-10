"""Risk acceptance waivers for report-driven CI gates."""
from __future__ import annotations

from dataclasses import dataclass
import datetime as _dt
import json
from pathlib import Path
from typing import Any

from .attest import _redact

DEFAULT_MAX_WAIVER_DAYS = 90


@dataclass
class Waiver:
    suite: str
    sample_id: str
    owner: str
    reason: str
    expires: str

    @property
    def key(self) -> tuple[str, str]:
        return (self.suite, self.sample_id)

    def to_dict(self) -> dict[str, str]:
        return {
            "suite": _redact(self.suite),
            "sample_id": _redact(self.sample_id),
            "owner": _redact(self.owner),
            "reason": _redact(self.reason),
            "expires": _redact(self.expires),
        }


@dataclass
class WaiverEvaluation:
    active: list[Waiver]
    expired: list[Waiver]
    invalid: list[str]
    unused: list[Waiver]

    @property
    def active_keys(self) -> set[tuple[str, str]]:
        return {waiver.key for waiver in self.active}

    def to_dict(self) -> dict[str, Any]:
        return {
            "active": [item.to_dict() for item in self.active],
            "expired": [item.to_dict() for item in self.expired],
            "invalid": [_redact(item) for item in self.invalid],
            "unused": [item.to_dict() for item in self.unused],
        }


def load_waivers(path: str | Path | None) -> list[Waiver]:
    if not path:
        return []
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = payload.get("waivers", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise ValueError("waiver file must be a JSON list or an object with a waivers list")
    waivers = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise ValueError(f"waiver #{index} must be an object")
        waivers.append(
            Waiver(
                suite=str(row.get("suite", "")),
                sample_id=str(row.get("sample_id", "")),
                owner=str(row.get("owner", "")),
                reason=str(row.get("reason", "")),
                expires=str(row.get("expires", "")),
            )
        )
    return waivers


def evaluate_waivers(
    samples: list[dict[str, Any]],
    waiver_path: str | Path | None,
    *,
    today: _dt.date | None = None,
    max_waiver_days: int = DEFAULT_MAX_WAIVER_DAYS,
) -> WaiverEvaluation:
    waivers = load_waivers(waiver_path)
    if not waivers:
        return WaiverEvaluation(active=[], expired=[], invalid=[], unused=[])
    today_value = today or _dt.datetime.now(_dt.UTC).date()
    failing_keys = {
        (str(sample.get("suite", "")), str(sample.get("sample_id", "")))
        for sample in samples
        if str(sample.get("verdict", "")).lower() == "fail"
    }
    active: list[Waiver] = []
    expired: list[Waiver] = []
    invalid: list[str] = []
    for waiver in waivers:
        problems = _waiver_problems(waiver)
        if problems:
            invalid.append(f"{waiver.suite}/{waiver.sample_id}: {', '.join(problems)}")
            continue
        expiry = _parse_date(waiver.expires)
        if expiry is None:
            invalid.append(f"{waiver.suite}/{waiver.sample_id}: invalid expires date")
            continue
        latest_allowed = today_value + _dt.timedelta(days=max_waiver_days)
        if expiry > latest_allowed:
            invalid.append(f"{waiver.suite}/{waiver.sample_id}: expires beyond max_waiver_days {max_waiver_days}")
            continue
        if expiry < today_value:
            expired.append(waiver)
            continue
        active.append(waiver)
    unused = [waiver for waiver in active if waiver.key not in failing_keys]
    active_used = [waiver for waiver in active if waiver.key in failing_keys]
    return WaiverEvaluation(active=active_used, expired=expired, invalid=invalid, unused=unused)


def sample_waivers() -> str:
    example_expiry = (_dt.datetime.now(_dt.UTC).date() + _dt.timedelta(days=30)).isoformat()
    return json.dumps(
        {
            "waivers": [
                {
                    "suite": "injection",
                    "sample_id": "inj-001",
                    "owner": "security@example.com",
                    "reason": "Accepted until upstream agent policy change lands.",
                    "expires": example_expiry,
                }
            ]
        },
        ensure_ascii=False,
        indent=2,
    )


def _waiver_problems(waiver: Waiver) -> list[str]:
    problems = []
    if not waiver.suite:
        problems.append("missing suite")
    if not waiver.sample_id:
        problems.append("missing sample_id")
    if not waiver.owner:
        problems.append("missing owner")
    if not waiver.reason:
        problems.append("missing reason")
    if not waiver.expires:
        problems.append("missing expires")
    return problems


def _parse_date(value: str) -> _dt.date | None:
    try:
        return _dt.date.fromisoformat(value)
    except ValueError:
        return None
