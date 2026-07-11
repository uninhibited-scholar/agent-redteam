"""Offline scan scope and output-budget planning."""
from __future__ import annotations

from dataclasses import dataclass
import json
import math


@dataclass(frozen=True)
class PlannedSuite:
    name: str
    owasp: str
    available_samples: int
    planned_samples: int
    planned_calls: int
    execution_mode: str

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "owasp": self.owasp,
            "available_samples": self.available_samples,
            "planned_samples": self.planned_samples,
            "planned_calls": self.planned_calls,
            "execution_mode": self.execution_mode,
        }


@dataclass(frozen=True)
class ScanPlan:
    target: str
    model: str
    workers: int
    max_attempts_per_call: int
    limit_per_suite: int
    max_output_tokens_per_call: int
    suites: tuple[PlannedSuite, ...]
    benchmark_profile: dict | None = None

    @property
    def total_calls(self) -> int:
        return sum(suite.planned_calls for suite in self.suites)

    @property
    def output_token_ceiling(self) -> int:
        return self.total_calls * self.max_output_tokens_per_call

    @property
    def max_calls_with_retries(self) -> int:
        return self.total_calls * self.max_attempts_per_call

    @property
    def max_output_token_ceiling_with_retries(self) -> int:
        return self.max_calls_with_retries * self.max_output_tokens_per_call

    @property
    def estimated_parallel_batches(self) -> int:
        return sum(
            suite.planned_calls if suite.execution_mode == "sequential" else math.ceil(suite.planned_calls / self.workers)
            for suite in self.suites
        )

    def to_dict(self) -> dict:
        data = {
            "schema": "agent-redteam-scan-plan/v1",
            "network_calls_performed": 0,
            "target": self.target,
            "model": self.model,
            "workers": self.workers,
            "max_attempts_per_call": self.max_attempts_per_call,
            "limit_per_suite": self.limit_per_suite,
            "max_output_tokens_per_call": self.max_output_tokens_per_call,
            "total_suites": len(self.suites),
            "total_calls": self.total_calls,
            "output_token_ceiling": self.output_token_ceiling,
            "max_calls_with_retries": self.max_calls_with_retries,
            "max_output_token_ceiling_with_retries": self.max_output_token_ceiling_with_retries,
            "estimated_parallel_batches": self.estimated_parallel_batches,
            "retry_calls_included": False,
            "suites": [suite.to_dict() for suite in self.suites],
        }
        if self.benchmark_profile is not None:
            data["benchmark_profile"] = self.benchmark_profile
        return data


def parse_suite_selection(value: str) -> list[str] | None:
    names = [name.strip() for name in value.split(",") if name.strip()]
    if not names or names == ["all"]:
        return None
    if "all" in names:
        raise ValueError("'all' cannot be combined with explicit suite names")
    if len(names) != len(set(names)):
        raise ValueError("duplicate suite names are not allowed")
    return names


def build_scan_plan(
    *,
    target: str,
    model: str,
    suite_names: list[str] | None,
    limit: int,
    max_tokens: int,
    workers: int,
    max_attempts: int = 3,
    sample_ids_by_suite: dict[str, list[str]] | None = None,
    benchmark_profile: dict | None = None,
) -> ScanPlan:
    if workers < 1:
        raise ValueError("workers must be at least 1")
    if max_tokens < 1:
        raise ValueError("max_tokens must be at least 1")
    if limit < 0:
        raise ValueError("limit must be 0 or greater")
    if not 1 <= max_attempts <= 10:
        raise ValueError("max_attempts must be between 1 and 10")

    from .suites import ALL_SUITES

    registry = {suite.name: suite for suite in (suite_class() for suite_class in ALL_SUITES)}
    selected = sorted(registry) if suite_names is None else suite_names
    unknown = [name for name in selected if name not in registry]
    if unknown:
        raise ValueError(f"unknown suite(s): {', '.join(unknown)}")

    suites = []
    for name in selected:
        suite = registry[name]
        samples = suite.load_samples()
        available = len(samples)
        planned = min(available, limit) if limit else available
        selected_samples = samples[:planned]
        if sample_ids_by_suite is not None and name in sample_ids_by_suite:
            wanted = set(sample_ids_by_suite[name])
            selected_samples = [sample for sample in samples if str(sample.get("id", "")) in wanted]
            planned = len(selected_samples)
        is_multi_turn = bool(getattr(suite, "is_multiturn", False))
        planned_calls = (
            sum(len(sample.get("turns", [])) for sample in selected_samples)
            if is_multi_turn else planned
        )
        suites.append(PlannedSuite(
            name=name,
            owasp=str(suite.owasp),
            available_samples=available,
            planned_samples=planned,
            planned_calls=planned_calls,
            execution_mode="sequential" if is_multi_turn else "parallel",
        ))
    return ScanPlan(
        target=target,
        model=model,
        workers=workers,
        max_attempts_per_call=max_attempts,
        limit_per_suite=limit,
        max_output_tokens_per_call=max_tokens,
        suites=tuple(suites),
        benchmark_profile=benchmark_profile,
    )


def render_scan_plan_json(plan: ScanPlan) -> str:
    return json.dumps(plan.to_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def render_scan_plan_terminal(plan: ScanPlan) -> str:
    lines = [
        f"Scan plan: {plan.model} ({plan.target})",
        f"Suites: {len(plan.suites)} | Calls before retries: {plan.total_calls} | Workers: {plan.workers}",
        f"Max attempts/call: {plan.max_attempts_per_call}",
        f"Worst-case calls with retries: {plan.max_calls_with_retries}",
        f"Max output tokens/call: {plan.max_output_tokens_per_call}",
        f"Output token ceiling: {plan.output_token_ceiling}",
        f"Worst-case output token ceiling: {plan.max_output_token_ceiling_with_retries}",
        f"Estimated parallel batches: {plan.estimated_parallel_batches}",
        "Network calls performed: 0",
        "",
    ]
    lines.extend(
        f"  {suite.name:<20} {suite.owasp:<7} {suite.planned_samples:>4}/{suite.available_samples} samples"
        f"  {suite.planned_calls:>4} calls  {suite.execution_mode}"
        for suite in plan.suites
    )
    return "\n".join(lines) + "\n"


def render_scan_plan_markdown(plan: ScanPlan) -> str:
    lines = [
        "# Agent Redteam Scan Plan",
        "",
        f"- Target: `{plan.target}` / `{plan.model}`",
        f"- Suites: {len(plan.suites)}",
        f"- Calls: {plan.total_calls}",
        f"- Max attempts per call: {plan.max_attempts_per_call}",
        f"- Worst-case calls with retries: {plan.max_calls_with_retries}",
        "- Retry calls included: no",
        f"- Output token ceiling: {plan.output_token_ceiling}",
        f"- Worst-case output token ceiling: {plan.max_output_token_ceiling_with_retries}",
        "- Network calls performed: 0",
        "",
        "| Suite | OWASP | Planned samples | Planned calls | Mode | Available |",
        "|---|---:|---:|---:|---|---:|",
    ]
    lines.extend(
        f"| {suite.name} | {suite.owasp} | {suite.planned_samples} | {suite.planned_calls} | "
        f"{suite.execution_mode} | {suite.available_samples} |"
        for suite in plan.suites
    )
    return "\n".join(lines) + "\n"
