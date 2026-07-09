"""Self-audit checks for project and release readiness.

This module is intentionally independent from the scan engine. It helps the
project maintain credibility as a security tool by flagging drift between
package metadata, docs, CI integration, validation artifacts, and release
outputs.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import re
import subprocess
from pathlib import Path
from typing import Literal

from . import __version__


Status = Literal["pass", "warn", "fail"]


@dataclass
class AuditCheck:
    id: str
    title: str
    status: Status
    detail: str
    recommendation: str = ""


@dataclass
class AuditReport:
    root: str
    score: float
    passed: int
    warned: int
    failed: int
    checks: list[AuditCheck]

    def to_dict(self) -> dict:
        return {
            "root": self.root,
            "score": self.score,
            "passed": self.passed,
            "warned": self.warned,
            "failed": self.failed,
            "checks": [asdict(c) for c in self.checks],
        }


def default_project_root() -> Path:
    """Return the repository root for an installed or editable checkout."""
    return Path(__file__).resolve().parents[2]


def audit_project(root: str | Path | None = None) -> AuditReport:
    project_root = Path(root).resolve() if root else default_project_root()
    checks = [
        _check_package_version(project_root),
        _check_development_status(project_root),
        _check_readme_action_version(project_root),
        _check_action_set_output(project_root),
        _check_action_key_not_in_argv(project_root),
        _check_zero_dependency_core(project_root),
        _check_community_health_files(project_root),
        _check_web_quality_scripts(project_root),
        _check_test_suite_presence(project_root),
        _check_dashboard_static_assets(project_root),
        _check_validation_artifacts(project_root),
        _check_validation_evidence_workflow(project_root),
        _check_release_gate_workflow(project_root),
        _check_release_manifest_workflow(project_root),
        _check_release_artifacts(project_root),
        _check_git_worktree(project_root),
    ]
    passed = sum(1 for c in checks if c.status == "pass")
    warned = sum(1 for c in checks if c.status == "warn")
    failed = sum(1 for c in checks if c.status == "fail")
    weighted = passed + warned * 0.5
    score = round(100.0 * weighted / len(checks), 1) if checks else 0.0
    return AuditReport(
        root=str(project_root),
        score=score,
        passed=passed,
        warned=warned,
        failed=failed,
        checks=checks,
    )


def render_audit_terminal(report: AuditReport) -> str:
    icon = {"pass": "OK", "warn": "WARN", "fail": "FAIL"}
    lines = [
        "",
        "Agent Redteam Project Doctor",
        f"Root: {report.root}",
        f"Score: {report.score}/100  ({report.passed} pass, {report.warned} warn, {report.failed} fail)",
        "",
    ]
    for check in report.checks:
        lines.append(f"[{icon[check.status]:<4}] {check.title}")
        lines.append(f"       {check.detail}")
        if check.recommendation:
            lines.append(f"       Next: {check.recommendation}")
    lines.append("")
    return "\n".join(lines)


def render_audit_markdown(report: AuditReport) -> str:
    lines = [
        "# Agent Redteam Project Doctor",
        "",
        f"**Score:** {report.score}/100",
        f"**Summary:** {report.passed} pass, {report.warned} warn, {report.failed} fail",
        "",
        "| Status | Check | Detail | Next |",
        "|--------|-------|--------|------|",
    ]
    for check in report.checks:
        lines.append(
            f"| {check.status.upper()} | {check.title} | "
            f"{_escape_table(check.detail)} | {_escape_table(check.recommendation)} |"
        )
    lines.append("")
    return "\n".join(lines)


def render_audit_json(report: AuditReport) -> str:
    return json.dumps(report.to_dict(), ensure_ascii=False, indent=2)


def _check_package_version(root: Path) -> AuditCheck:
    pyproject = _read(root / "pyproject.toml")
    version = _toml_string(pyproject, "version")
    if version == __version__:
        return AuditCheck("version.match", "Package version is consistent", "pass", f"pyproject.toml and package both use {version}.")
    return AuditCheck(
        "version.match",
        "Package version is consistent",
        "fail",
        f"pyproject.toml has {version or 'unknown'}, package has {__version__}.",
        "Align pyproject.toml with agent_redteam.__version__ before publishing.",
    )


def _check_development_status(root: Path) -> AuditCheck:
    pyproject = _read(root / "pyproject.toml")
    if "Development Status :: 3 - Alpha" in pyproject:
        return AuditCheck(
            "metadata.status",
            "Package maturity classifier",
            "warn",
            "The package is still classified as Alpha.",
            "Keep Alpha if intentional; move to Beta only after release docs, CI, and benchmark artifacts are locked.",
        )
    return AuditCheck("metadata.status", "Package maturity classifier", "pass", "Classifier is no longer Alpha.")


def _check_readme_action_version(root: Path) -> AuditCheck:
    readme = _read(root / "README.md")
    tags = sorted(set(re.findall(r"uninhibited-scholar/agent-redteam@(v[\d.]+)", readme)))
    expected = f"v{__version__}"
    if not tags:
        return AuditCheck(
            "docs.action_version",
            "README GitHub Action version",
            "warn",
            "README does not show a pinned GitHub Action version.",
            f"Use {expected} in quickstart snippets.",
        )
    if tags == [expected]:
        return AuditCheck("docs.action_version", "README GitHub Action version", "pass", f"README uses {expected}.")
    return AuditCheck(
        "docs.action_version",
        "README GitHub Action version",
        "warn",
        f"README references {', '.join(tags)} while package version is {expected}.",
        "Update README snippets so new users copy the current release tag.",
    )


def _check_action_set_output(root: Path) -> AuditCheck:
    action = _read(root / "action.yml")
    if "::set-output" in action:
        return AuditCheck(
            "action.deprecated_output",
            "GitHub Action output API",
            "fail",
            "action.yml still uses deprecated ::set-output commands.",
            "Write outputs through $GITHUB_OUTPUT to avoid deprecation and hardening issues.",
        )
    return AuditCheck("action.deprecated_output", "GitHub Action output API", "pass", "action.yml uses the modern output mechanism.")


def _check_action_key_not_in_argv(root: Path) -> AuditCheck:
    action = _read(root / "action.yml")
    argv_patterns = [
        r"--key\s+\$INPUT_API_KEY",
        r"--key\s+\"\$INPUT_API_KEY\"",
        r"--key\s+'\$INPUT_API_KEY'",
        r"--key\s+\$\{\{\s*inputs\.api-key\s*\}\}",
    ]
    if any(re.search(pattern, action) for pattern in argv_patterns):
        return AuditCheck(
            "action.no_key_argv",
            "GitHub Action API key handling",
            "fail",
            "action.yml passes the API key through command-line arguments.",
            "Pass secrets via OPENAI_API_KEY or a local config file so they do not appear in process argv.",
        )
    if "OPENAI_API_KEY" in action or "INPUT_API_KEY" not in action:
        return AuditCheck(
            "action.no_key_argv",
            "GitHub Action API key handling",
            "pass",
            "API key is not passed through command-line arguments.",
        )
    return AuditCheck(
        "action.no_key_argv",
        "GitHub Action API key handling",
        "warn",
        "action.yml references INPUT_API_KEY but no safe OPENAI_API_KEY handoff was detected.",
        "Verify the secret is supplied via environment, not argv.",
    )


def _check_zero_dependency_core(root: Path) -> AuditCheck:
    pyproject = _read(root / "pyproject.toml")
    match = re.search(r"(?ms)^dependencies\s*=\s*\[(.*?)\]", pyproject)
    deps = match.group(1).strip() if match else ""
    if deps:
        return AuditCheck(
            "package.zero_deps",
            "Zero-dependency core",
            "warn",
            "pyproject.toml declares runtime dependencies.",
            "Keep the core dependency-free or explain each dependency in the supply-chain threat model.",
        )
    return AuditCheck("package.zero_deps", "Zero-dependency core", "pass", "No runtime dependencies are declared.")


def _check_community_health_files(root: Path) -> AuditCheck:
    issue_templates = root / ".github" / "ISSUE_TEMPLATE"
    required = {
        "SECURITY.md": root / "SECURITY.md",
        "CONTRIBUTING.md": root / "CONTRIBUTING.md",
        "RELEASE_CHECKLIST.md": root / "RELEASE_CHECKLIST.md",
        "PULL_REQUEST_TEMPLATE.md": root / ".github" / "PULL_REQUEST_TEMPLATE.md",
    }
    missing = [name for name, path in required.items() if not path.exists()]
    has_issue_templates = (root / ".github" / "ISSUE_TEMPLATE.md").exists() or (
        issue_templates.exists() and any(issue_templates.glob("*.yml"))
    )
    if not has_issue_templates:
        missing.append("ISSUE_TEMPLATE")
    if missing:
        return AuditCheck(
            "community.health",
            "Community health files",
            "warn",
            f"Missing: {', '.join(missing)}.",
            "Add security disclosure, contribution, release, PR, and issue guidance for external adopters.",
        )
    return AuditCheck(
        "community.health",
        "Community health files",
        "pass",
        "Security, contribution, release, PR, and issue guidance are present.",
    )


def _check_web_quality_scripts(root: Path) -> AuditCheck:
    package = _read(root / "web" / "package.json")
    try:
        scripts = json.loads(package).get("scripts", {})
    except json.JSONDecodeError:
        return AuditCheck("web.quality_scripts", "Web quality scripts", "fail", "web/package.json is not valid JSON.")
    missing = [name for name in ("typecheck", "typecheck:strict") if name not in scripts]
    if missing:
        return AuditCheck(
            "web.quality_scripts",
            "Web quality scripts",
            "warn",
            f"Missing npm scripts: {', '.join(missing)}.",
            "Add explicit scripts so release checks are reproducible instead of relying on ad-hoc npx commands.",
        )
    return AuditCheck("web.quality_scripts", "Web quality scripts", "pass", "typecheck and strict typecheck scripts are available.")


def _check_test_suite_presence(root: Path) -> AuditCheck:
    tests = sorted((root / "tests").glob("test_*.py"))
    if len(tests) >= 5:
        return AuditCheck("tests.presence", "Python test suite presence", "pass", f"Found {len(tests)} test modules.")
    return AuditCheck(
        "tests.presence",
        "Python test suite presence",
        "warn",
        f"Found {len(tests)} test modules.",
        "Keep dedicated tests for CLI, core engine, targets, dashboard API, and mutation logic.",
    )


def _check_dashboard_static_assets(root: Path) -> AuditCheck:
    static = root / "src" / "agent_redteam" / "dashboard" / "static"
    index = static / "index.html"
    assets = list((static / "assets").glob("*.js")) if (static / "assets").exists() else []
    if index.exists() and assets:
        return AuditCheck("dashboard.static", "Bundled dashboard assets", "pass", f"Found index.html and {len(assets)} JS bundle(s).")
    return AuditCheck(
        "dashboard.static",
        "Bundled dashboard assets",
        "fail",
        "Dashboard static assets are incomplete.",
        "Run npm run build before packaging or publishing.",
    )


def _check_validation_artifacts(root: Path) -> AuditCheck:
    validation = root / "validation"
    reports = sorted(validation.glob("*.md")) if validation.exists() else []
    json_runs = sorted(validation.glob("*.json")) if validation.exists() else []
    if len(reports) >= 3 and len(json_runs) >= 3:
        return AuditCheck(
            "validation.artifacts",
            "Benchmark validation artifacts",
            "pass",
            f"Found {len(reports)} report(s) and {len(json_runs)} JSON run artifact(s).",
        )
    return AuditCheck(
        "validation.artifacts",
        "Benchmark validation artifacts",
        "warn",
        f"Found {len(reports)} report(s) and {len(json_runs)} JSON run artifact(s).",
        "Publish enough raw runs and narrative reports for benchmark claims to be reproducible.",
    )


def _check_validation_evidence_workflow(root: Path) -> AuditCheck:
    evidence = root / "src" / "agent_redteam" / "evidence.py"
    cli = _read(root / "src" / "agent_redteam" / "cli.py")
    tests = _read(root / "tests" / "test_maturity_commands.py")
    missing = []
    if not evidence.exists():
        missing.append("evidence.py")
    if "evidence" not in cli:
        missing.append("CLI command")
    if "test_evidence_index" not in tests:
        missing.append("tests")
    if missing:
        return AuditCheck(
            "validation.evidence_workflow",
            "Validation evidence workflow",
            "warn",
            f"Missing: {', '.join(missing)}.",
            "Keep a tested command for indexing benchmark artifacts and reproducibility hashes.",
        )
    return AuditCheck(
        "validation.evidence_workflow",
        "Validation evidence workflow",
        "pass",
        "Evidence indexing command and tests are present.",
    )


def _check_release_gate_workflow(root: Path) -> AuditCheck:
    gate = root / "src" / "agent_redteam" / "release_gate.py"
    cli = _read(root / "src" / "agent_redteam" / "cli.py")
    tests = _read(root / "tests" / "test_maturity_commands.py")
    missing = []
    if not gate.exists():
        missing.append("release_gate.py")
    if "release-check" not in cli:
        missing.append("CLI command")
    if "test_release_gate" not in tests:
        missing.append("tests")
    if missing:
        return AuditCheck(
            "release.gate_workflow",
            "Release gate workflow",
            "warn",
            f"Missing: {', '.join(missing)}.",
            "Keep a tested local release gate for doctor, tests, frontend, evidence, and artifacts.",
        )
    return AuditCheck(
        "release.gate_workflow",
        "Release gate workflow",
        "pass",
        "Release gate command and tests are present.",
    )


def _check_release_manifest_workflow(root: Path) -> AuditCheck:
    manifest = root / "src" / "agent_redteam" / "release_manifest.py"
    cli = _read(root / "src" / "agent_redteam" / "cli.py")
    tests = _read(root / "tests" / "test_maturity_commands.py")
    missing = []
    if not manifest.exists():
        missing.append("release_manifest.py")
    if "manifest" not in cli:
        missing.append("CLI command")
    if "test_release_manifest" not in tests:
        missing.append("tests")
    if missing:
        return AuditCheck(
            "release.manifest_workflow",
            "Release manifest workflow",
            "warn",
            f"Missing: {', '.join(missing)}.",
            "Keep a tested release manifest for version, git, artifact hash, and evidence provenance.",
        )
    return AuditCheck(
        "release.manifest_workflow",
        "Release manifest workflow",
        "pass",
        "Release manifest command and tests are present.",
    )


def _check_release_artifacts(root: Path) -> AuditCheck:
    dist = root / "dist"
    wheel = dist / f"agent_redteam-{__version__}-py3-none-any.whl"
    sdist = dist / f"agent_redteam-{__version__}.tar.gz"
    if wheel.exists() and sdist.exists():
        return AuditCheck("release.artifacts", "Release artifacts", "pass", f"Found wheel and sdist for {__version__}.")
    return AuditCheck(
        "release.artifacts",
        "Release artifacts",
        "warn",
        f"Missing wheel or sdist for {__version__}.",
        "Build release artifacts before tagging or publishing to PyPI.",
    )


def _check_git_worktree(root: Path) -> AuditCheck:
    git_dir = root / ".git"
    if not git_dir.exists():
        return AuditCheck("git.clean", "Git worktree state", "warn", "No .git directory found; cannot inspect working tree.")
    try:
        proc = subprocess.run(
            ["git", "status", "--short"],
            cwd=str(root),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5,
            check=False,
        )
    except Exception as exc:
        return AuditCheck("git.clean", "Git worktree state", "warn", f"Could not run git status: {exc}.")
    if proc.returncode != 0:
        return AuditCheck("git.clean", "Git worktree state", "warn", proc.stderr.strip() or "git status failed.")
    lines = [line for line in proc.stdout.splitlines() if line.strip()]
    if not lines:
        return AuditCheck("git.clean", "Git worktree state", "pass", "Working tree is clean.")
    return AuditCheck(
        "git.clean",
        "Git worktree state",
        "warn",
        f"Working tree has {len(lines)} unstaged/untracked item(s).",
        "Review these before release so validation artifacts and generated files are intentional.",
    )


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def _toml_string(text: str, key: str) -> str:
    match = re.search(rf"(?m)^{re.escape(key)}\s*=\s*[\"']([^\"']+)[\"']", text)
    return match.group(1) if match else ""


def _escape_table(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")
