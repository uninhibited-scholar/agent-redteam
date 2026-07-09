"""Build a reproducible release manifest for audit and handoff."""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
from pathlib import Path
import subprocess
from typing import Any, Callable

from . import __version__
from .attest import _redact
from .evidence import EvidenceOptions, build_evidence_index
from .project_audit import default_project_root
from .release_gate import ReleaseCheckOptions, run_release_gate


GitRunner = Callable[[list[str], Path], subprocess.CompletedProcess[str]]


def build_release_manifest(
    root: str | Path | None = None,
    *,
    evidence_root: str = "validation",
    include_documents: bool = True,
    include_release_check: bool = False,
    release_options: ReleaseCheckOptions | None = None,
    git_runner: GitRunner | None = None,
) -> dict[str, Any]:
    project_root = Path(root).resolve() if root else default_project_root()
    evidence_path = project_root / evidence_root
    manifest: dict[str, Any] = {
        "schema": "agent-redteam-release-manifest/v1",
        "generated_at": _dt.datetime.now(_dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "project": {
            "name": "agent-redteam",
            "version": __version__,
            "root": _redact(project_root.name),
        },
        "git": _git_info(project_root, git_runner or _run_git),
        "artifacts": _package_artifacts(project_root),
        "evidence": _evidence_summary(evidence_path, include_documents),
    }
    if include_release_check:
        gate = run_release_gate(project_root, release_options or ReleaseCheckOptions())
        manifest["release_check"] = {
            "passed": gate.passed,
            "steps": [
                {
                    "name": _redact(step.name),
                    "status": step.status,
                    "detail": _redact(step.detail),
                    "duration_seconds": step.duration_seconds,
                }
                for step in gate.steps
            ],
        }
    return manifest


def render_manifest_json(manifest: dict[str, Any]) -> str:
    return json.dumps(manifest, ensure_ascii=False, indent=2)


def render_manifest_markdown(manifest: dict[str, Any]) -> str:
    artifacts = manifest.get("artifacts", [])
    evidence = manifest.get("evidence", {})
    git = manifest.get("git", {})
    lines = [
        "# Agent Redteam Release Manifest",
        "",
        f"- **Version:** {manifest['project']['version']}",
        f"- **Generated at:** {manifest['generated_at']}",
        f"- **Git commit:** `{git.get('commit', 'unknown')}`",
        f"- **Git dirty:** {git.get('dirty', 'unknown')}",
        "",
        "## Package Artifacts",
        "",
        "| Path | Present | Bytes | SHA-256 |",
        "|------|---------|------:|---------|",
    ]
    for artifact in artifacts:
        lines.append(
            f"| `{_cell(artifact['path'])}` | {artifact['present']} | {artifact['bytes']} | "
            f"`{artifact['sha256'][:12]}` |"
        )

    lines.extend([
        "",
        "## Evidence Summary",
        "",
        f"- **Status:** {evidence.get('status', 'unknown')}",
        f"- **Reports:** {evidence.get('reports', 0)}",
        f"- **Auxiliary JSON artifacts:** {evidence.get('auxiliary', 0)}",
        f"- **Documents:** {evidence.get('documents', 0)}",
        f"- **Skipped JSON files:** {evidence.get('skipped', 0)}",
        f"- **Total samples:** {evidence.get('total_samples', 0)}",
        f"- **Total failed:** {evidence.get('total_failed', 0)}",
        f"- **Average score:** {evidence.get('average_score', 0)}/100",
    ])

    if manifest.get("release_check"):
        release = manifest["release_check"]
        lines.extend([
            "",
            "## Release Check",
            "",
            f"**Status:** {'PASS' if release.get('passed') else 'FAIL'}",
            "",
            "| Step | Status | Detail |",
            "|------|--------|--------|",
        ])
        for step in release.get("steps", []):
            lines.append(f"| {_cell(step['name'])} | {step['status']} | {_cell(step['detail'])} |")

    lines.extend([
        "",
        "## Reproducibility Notes",
        "",
        "- Package artifact SHA-256 values are computed from raw file bytes.",
        "- Evidence summary is derived from the validation evidence index.",
        "- Secrets in generated fields are redacted before rendering.",
        "",
    ])
    return "\n".join(lines)


def write_manifest(manifest: dict[str, Any], output: str | Path, fmt: str) -> None:
    content = render_manifest_json(manifest) if fmt == "json" else render_manifest_markdown(manifest)
    Path(output).write_text(content, encoding="utf-8")


def _package_artifacts(root: Path) -> list[dict[str, Any]]:
    dist = root / "dist"
    expected = [
        dist / f"agent_redteam-{__version__}-py3-none-any.whl",
        dist / f"agent_redteam-{__version__}.tar.gz",
    ]
    return [_artifact_entry(path, root) for path in expected]


def _artifact_entry(path: Path, root: Path) -> dict[str, Any]:
    present = path.exists()
    raw = path.read_bytes() if present else b""
    return {
        "path": _safe_rel(path, root),
        "present": present,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest() if present else "",
    }


def _evidence_summary(path: Path, include_documents: bool) -> dict[str, Any]:
    try:
        index = build_evidence_index(path, EvidenceOptions(include_documents=include_documents))
    except Exception as exc:
        return {
            "status": "unavailable",
            "root": _redact(path.name),
            "reason": _redact(str(exc)),
            "reports": 0,
            "auxiliary": 0,
            "documents": 0,
            "skipped": 0,
            "total_samples": 0,
            "total_failed": 0,
            "average_score": 0.0,
        }
    summary = index["summary"]
    return {
        "status": "ok" if summary.get("skipped", 0) == 0 else "has_skips",
        "root": _redact(path.name),
        "reports": summary.get("reports", 0),
        "auxiliary": summary.get("auxiliary", 0),
        "documents": summary.get("documents", 0),
        "skipped": summary.get("skipped", 0),
        "total_samples": summary.get("total_samples", 0),
        "total_failed": summary.get("total_failed", 0),
        "average_score": summary.get("average_score", 0.0),
    }


def _git_info(root: Path, runner: GitRunner) -> dict[str, Any]:
    commit = _git_value(["git", "rev-parse", "HEAD"], root, runner)
    branch = _git_value(["git", "rev-parse", "--abbrev-ref", "HEAD"], root, runner)
    status = _git_value(["git", "status", "--porcelain"], root, runner, allow_empty=True)
    if commit is None:
        return {
            "available": False,
            "commit": "",
            "branch": "",
            "dirty": False,
            "changed_files": 0,
        }
    changed = [line for line in (status or "").splitlines() if line.strip()]
    return {
        "available": True,
        "commit": _redact(commit),
        "branch": _redact(branch or ""),
        "dirty": bool(changed),
        "changed_files": len(changed),
    }


def _git_value(command: list[str], root: Path, runner: GitRunner, allow_empty: bool = False) -> str | None:
    try:
        proc = runner(command, root)
    except Exception:
        return "" if allow_empty else None
    if proc.returncode != 0:
        return "" if allow_empty else None
    return proc.stdout.strip()


def _run_git(command: list[str], root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(root),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=10,
        check=False,
    )


def _safe_rel(path: Path, root: Path) -> str:
    try:
        value = path.resolve().relative_to(root).as_posix()
    except ValueError:
        value = path.name
    return _redact(value)


def _cell(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")
