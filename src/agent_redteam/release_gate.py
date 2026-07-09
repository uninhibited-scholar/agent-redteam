"""Local release preflight checks for Agent Redteam.

The release gate composes existing commands instead of duplicating their
logic. It is intentionally conservative and dependency-light: it runs the
checks a maintainer should run before tagging, while leaving publishing and
package uploads outside the command.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time
from typing import Callable, Literal

from . import __version__


Status = Literal["pass", "fail", "skip"]
Runner = Callable[[list[str], Path, int], subprocess.CompletedProcess[str]]


@dataclass
class ReleaseCheckOptions:
    skip_tests: bool = False
    skip_frontend: bool = False
    skip_build: bool = False
    skip_evidence: bool = False
    skip_sbom: bool = False
    skip_artifacts: bool = False
    strict_warnings: bool = False
    timeout_seconds: int = 300


@dataclass
class ReleaseStep:
    name: str
    title: str
    status: Status
    detail: str
    command: list[str]
    duration_seconds: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ReleaseGateResult:
    root: str
    passed: bool
    steps: list[ReleaseStep]

    def to_dict(self) -> dict:
        return {
            "root": self.root,
            "passed": self.passed,
            "steps": [step.to_dict() for step in self.steps],
        }


def run_release_gate(
    root: str | Path,
    options: ReleaseCheckOptions | None = None,
    runner: Runner | None = None,
) -> ReleaseGateResult:
    opts = options or ReleaseCheckOptions()
    project_root = Path(root).resolve()
    run = runner or _run_command
    steps: list[ReleaseStep] = []

    steps.append(_doctor_step(project_root, opts, run))
    if opts.skip_tests:
        steps.append(_skip("tests", "Python tests", "Skipped by --skip-tests"))
    else:
        steps.append(_command_step("tests", "Python tests", [sys.executable, "-m", "pytest", "-q"], project_root, opts, run))

    if opts.skip_frontend:
        steps.append(_skip("frontend.typecheck", "Frontend typecheck", "Skipped by --skip-frontend"))
        steps.append(_skip("frontend.strict", "Frontend strict typecheck", "Skipped by --skip-frontend"))
        steps.append(_skip("frontend.build", "Frontend build", "Skipped by --skip-frontend"))
    else:
        steps.append(_command_step("frontend.typecheck", "Frontend typecheck", ["npm", "--prefix", "web", "run", "typecheck"], project_root, opts, run))
        steps.append(_command_step("frontend.strict", "Frontend strict typecheck", ["npm", "--prefix", "web", "run", "typecheck:strict"], project_root, opts, run))
        if opts.skip_build:
            steps.append(_skip("frontend.build", "Frontend build", "Skipped by --skip-build"))
        else:
            steps.append(_command_step("frontend.build", "Frontend build", ["npm", "--prefix", "web", "run", "build"], project_root, opts, run))

    if opts.skip_evidence:
        steps.append(_skip("evidence", "Validation evidence index", "Skipped by --skip-evidence"))
    else:
        steps.append(_evidence_step(project_root, opts, run))

    if opts.skip_sbom:
        steps.append(_skip("sbom", "Software bill of materials", "Skipped by --skip-sbom"))
    else:
        steps.append(_sbom_step(project_root, opts, run))

    if opts.skip_artifacts:
        steps.append(_skip("artifacts", "Package artifacts", "Skipped by --skip-artifacts"))
    else:
        steps.append(_artifact_step(project_root, opts, run))

    passed = all(step.status != "fail" for step in steps)
    return ReleaseGateResult(root=str(project_root), passed=passed, steps=steps)


def render_release_gate_json(result: ReleaseGateResult) -> str:
    return json.dumps(result.to_dict(), ensure_ascii=False, indent=2)


def render_release_gate_terminal(result: ReleaseGateResult) -> str:
    icon = {"pass": "OK", "fail": "FAIL", "skip": "SKIP"}
    lines = [
        "",
        "Agent Redteam Release Check",
        f"Root: {result.root}",
        f"Status: {'PASS' if result.passed else 'FAIL'}",
        "",
    ]
    for step in result.steps:
        lines.append(f"[{icon[step.status]:<4}] {step.title}")
        lines.append(f"       {step.detail}")
        if step.command:
            lines.append(f"       Command: {' '.join(step.command)}")
    lines.append("")
    return "\n".join(lines)


def render_release_gate_markdown(result: ReleaseGateResult) -> str:
    lines = [
        "# Agent Redteam Release Check",
        "",
        f"**Status:** {'PASS' if result.passed else 'FAIL'}",
        "",
        "| Status | Step | Detail | Command |",
        "|--------|------|--------|---------|",
    ]
    for step in result.steps:
        command = " ".join(step.command)
        lines.append(
            f"| {step.status.upper()} | {_cell(step.title)} | "
            f"{_cell(step.detail)} | `{_cell(command)}` |"
        )
    lines.append("")
    return "\n".join(lines)


def _doctor_step(root: Path, opts: ReleaseCheckOptions, runner: Runner) -> ReleaseStep:
    command = [sys.executable, "-m", "agent_redteam.cli", "doctor", "--root", str(root), "--format", "json"]
    proc, duration = _timed(command, root, opts, runner)
    if proc.returncode != 0:
        return _from_process("doctor", "Project doctor", command, proc, duration)
    try:
        payload = json.loads(proc.stdout)
        failed = int(payload.get("failed", 0))
        warned = int(payload.get("warned", 0))
        score = payload.get("score", 0)
    except (ValueError, TypeError) as exc:
        return ReleaseStep("doctor", "Project doctor", "fail", f"Could not parse doctor JSON: {exc}", command, duration)
    if failed:
        return ReleaseStep("doctor", "Project doctor", "fail", f"{failed} fail, {warned} warn, score {score}/100", command, duration)
    if opts.strict_warnings and warned:
        return ReleaseStep("doctor", "Project doctor", "fail", f"0 fail, {warned} warn under --strict-warnings", command, duration)
    return ReleaseStep("doctor", "Project doctor", "pass", f"0 fail, {warned} warn, score {score}/100", command, duration)


def _evidence_step(root: Path, opts: ReleaseCheckOptions, runner: Runner) -> ReleaseStep:
    command = [sys.executable, "-m", "agent_redteam.cli", "evidence", "--root", "validation", "--format", "json"]
    proc, duration = _timed(command, root, opts, runner)
    if proc.returncode != 0:
        return _from_process("evidence", "Validation evidence index", command, proc, duration)
    try:
        payload = json.loads(proc.stdout)
        summary = payload.get("summary", {})
        skipped = int(summary.get("skipped", 0))
        reports = int(summary.get("reports", 0))
        auxiliary = int(summary.get("auxiliary", 0))
        documents = int(summary.get("documents", 0))
    except (ValueError, TypeError) as exc:
        return ReleaseStep("evidence", "Validation evidence index", "fail", f"Could not parse evidence JSON: {exc}", command, duration)
    if skipped:
        return ReleaseStep("evidence", "Validation evidence index", "fail", f"{reports} reports, {auxiliary} auxiliary, {documents} docs, {skipped} skipped", command, duration)
    return ReleaseStep("evidence", "Validation evidence index", "pass", f"{reports} reports, {auxiliary} auxiliary, {documents} docs, 0 skipped", command, duration)


def _sbom_step(root: Path, opts: ReleaseCheckOptions, runner: Runner) -> ReleaseStep:
    command = [sys.executable, "-m", "agent_redteam.cli", "sbom", "--root", str(root), "--format", "json"]
    proc, duration = _timed(command, root, opts, runner)
    if proc.returncode != 0:
        return _from_process("sbom", "Software bill of materials", command, proc, duration)
    try:
        payload = json.loads(proc.stdout)
        summary = payload.get("summary", {})
        components = int(summary.get("components", 0))
        artifacts = int(summary.get("release_artifacts", 0))
        npm = int(summary.get("npm_dependencies", 0))
        python = int(summary.get("python_dependencies", 0))
    except (ValueError, TypeError) as exc:
        return ReleaseStep("sbom", "Software bill of materials", "fail", f"Could not parse SBOM JSON: {exc}", command, duration)
    if components <= 0:
        return ReleaseStep("sbom", "Software bill of materials", "fail", "SBOM contains no components", command, duration)
    return ReleaseStep(
        "sbom",
        "Software bill of materials",
        "pass",
        f"{components} components, {python} python, {npm} npm, {artifacts} release artifacts",
        command,
        duration,
    )


def _artifact_step(root: Path, opts: ReleaseCheckOptions, runner: Runner) -> ReleaseStep:
    dist = root / "dist"
    wheel = dist / f"agent_redteam-{__version__}-py3-none-any.whl"
    sdist = dist / f"agent_redteam-{__version__}.tar.gz"
    missing = [path.name for path in (wheel, sdist) if not path.exists()]
    if missing:
        return ReleaseStep(
            "artifacts",
            "Package artifacts",
            "fail",
            f"Missing: {', '.join(missing)}",
            [],
        )
    twine = shutil.which("twine")
    if not twine:
        return ReleaseStep(
            "artifacts",
            "Package artifacts",
            "skip",
            f"Wheel and sdist present for {__version__}; twine not installed, metadata check skipped",
            [],
        )
    command = [twine, "check", str(wheel), str(sdist)]
    proc, duration = _timed(command, root, opts, runner)
    if proc.returncode != 0:
        detail = _tail(proc.stderr) or _tail(proc.stdout) or f"twine check failed with exit code {proc.returncode}"
        return ReleaseStep("artifacts", "Package artifacts", "fail", detail, command, duration)
    return ReleaseStep(
        "artifacts",
        "Package artifacts",
        "pass",
        f"Wheel and sdist present for {__version__}; twine check passed",
        command,
        duration,
    )


def _command_step(
    name: str,
    title: str,
    command: list[str],
    root: Path,
    opts: ReleaseCheckOptions,
    runner: Runner,
) -> ReleaseStep:
    proc, duration = _timed(command, root, opts, runner)
    return _from_process(name, title, command, proc, duration)


def _from_process(
    name: str,
    title: str,
    command: list[str],
    proc: subprocess.CompletedProcess[str],
    duration: float,
) -> ReleaseStep:
    if proc.returncode == 0:
        return ReleaseStep(name, title, "pass", "Command completed successfully", command, duration)
    detail = _tail(proc.stderr) or _tail(proc.stdout) or f"exit code {proc.returncode}"
    return ReleaseStep(name, title, "fail", detail, command, duration)


def _skip(name: str, title: str, detail: str) -> ReleaseStep:
    return ReleaseStep(name, title, "skip", detail, [])


def _timed(
    command: list[str],
    root: Path,
    opts: ReleaseCheckOptions,
    runner: Runner,
) -> tuple[subprocess.CompletedProcess[str], float]:
    started = time.monotonic()
    proc = runner(command, root, opts.timeout_seconds)
    return proc, round(time.monotonic() - started, 2)


def _run_command(command: list[str], cwd: Path, timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )


def _tail(value: str, limit: int = 500) -> str:
    text = " ".join((value or "").split())
    if len(text) <= limit:
        return text
    return "..." + text[-limit:]


def _cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")
