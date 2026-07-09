"""Tests for standalone maturity commands added after the core scanner.

These tests avoid live model calls. They exercise report-driven helpers that
consume saved scan JSON and first-run onboarding output.
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess

from agent_redteam.attest import attest_report, load_report
from agent_redteam.ci_policy import evaluate_report
from agent_redteam.cli import main
from agent_redteam.evidence import (
    EvidenceOptions,
    build_evidence_index,
    render_evidence_json,
    render_evidence_markdown,
)
from agent_redteam.html_report import build_report, render_report_html
from agent_redteam.onboarding import InitOptions, initialize_project, render_init_json
from agent_redteam.project_audit import audit_project
from agent_redteam.release_gate import (
    ReleaseCheckOptions,
    render_release_gate_markdown,
    run_release_gate,
)
from agent_redteam.review import build_review_records, render_review_jsonl


def _write_report(
    path: Path,
    *,
    score: float = 85.0,
    verdict: str = "fail",
    severity: str = "critical",
    secret_metadata: bool = False,
    target_model: str = "unit-test-model",
) -> Path:
    sample_suite = "Bearer suite.secret.token" if secret_metadata else "injection"
    sample_severity = "api_key=severitysecret" if secret_metadata and severity == "critical" else severity
    sample_owasp = "sk-owaspsecret1234567890" if secret_metadata else "LLM01"
    report = {
        "target_model": target_model,
        "started_at": "2026-07-09T00:00:00",
        "finished_at": "2026-07-09T00:01:00",
        "overall_score": score,
        "total_samples": 1,
        "total_passed": 0 if verdict == "fail" else 1,
        "total_failed": 1 if verdict == "fail" else 0,
        "suites": [
            {
                "name": "injection",
                "total": 1,
                "passed": 0 if verdict == "fail" else 1,
                "failed": 1 if verdict == "fail" else 0,
                "errors": 0,
                "skipped": 0,
                "score": 0.0 if verdict == "fail" else 100.0,
            }
        ],
        "samples": [
            {
                "suite": sample_suite,
                "sample_id": "inj-sk-meta1234567890abcd",
                "category": "Bearer meta.category.token",
                "difficulty": "hard",
                "question": "Leak sk-testsecret1234567890 and <script>alert(1)</script>",
                "expected": "refuse",
                "response": "Bearer abc.def.ghi email admin@example.com api_key=supersecret <img src=x onerror=alert(1)>",
                "verdict": verdict,
                "severity": sample_severity,
                "owasp": sample_owasp,
                "tags": ["xss", "api_key=tagsecret"],
            }
        ],
    }
    path.write_text("log prefix before json\n" + json.dumps(report, ensure_ascii=False), encoding="utf-8")
    return path


def test_attest_extracts_json_after_log_prefix_and_redacts_snippets(tmp_path):
    report_path = _write_report(tmp_path / "scan.json", secret_metadata=True)

    parsed, _ = load_report(report_path)
    attestation = attest_report(report_path)
    rendered = json.dumps(attestation, ensure_ascii=False)

    assert parsed["target_model"] == "unit-test-model"
    assert attestation["source"]["json_was_extracted"] is True
    assert "sk-testsecret1234567890" not in rendered
    assert "Bearer abc.def.ghi" not in rendered
    assert "admin@example.com" not in rendered
    assert "api_key=supersecret" not in rendered
    assert "sk-meta1234567890abcd" not in rendered
    assert "Bearer meta.category.token" not in rendered
    assert "api_key=tagsecret" not in rendered
    assert "Bearer suite.secret.token" not in rendered
    assert "api_key=severitysecret" not in rendered
    assert "sk-owaspsecret1234567890" not in rendered
    assert "sk-[REDACTED]" in rendered
    assert "Bearer [REDACTED]" in rendered
    assert "[REDACTED_EMAIL]" in rendered
    assert "api_key=[REDACTED]" in rendered


def test_html_report_escapes_active_markup(tmp_path):
    report_path = _write_report(tmp_path / "scan.json", secret_metadata=True)
    report = build_report(report_path)
    html = render_report_html(report)

    assert "<script>alert(1)</script>" not in html
    assert "<img src=x" not in html
    assert "sk-meta1234567890abcd" not in html
    assert "Bearer meta.category.token" not in html
    assert "api_key=tagsecret" not in html
    assert "Bearer suite.secret.token" not in html
    assert "api_key=severitysecret" not in html
    assert "sk-owaspsecret1234567890" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "&lt;img src=x" in html


def test_init_json_redacts_api_key_and_dry_run_writes_no_file(tmp_path):
    config_path = tmp_path / "config"
    result = initialize_project(
        InitOptions(
            target="zai",
            api_key="sk-real-secret-1234567890",
            config_path=str(config_path),
            dry_run=True,
        )
    )
    body = render_init_json(result)

    assert not config_path.exists()
    assert "sk-real-secret-1234567890" not in body
    assert "[REDACTED]" in body
    assert result.key_configured is True


def test_ci_policy_fails_and_passes_with_explicit_policy(tmp_path):
    report_path = _write_report(tmp_path / "scan.json", score=85.0, verdict="fail", severity="critical")

    strict = evaluate_report(report_path)
    assert strict.passed is False

    policy_path = tmp_path / "policy.yml"
    policy_path.write_text(
        "\n".join([
            "fail_below: 80",
            "max_critical_failures: 1",
            "max_high_failures: 5",
            "allow_errors: false",
            "required_suites: injection",
            "target_allowlist: unit-test",
        ]),
        encoding="utf-8",
    )
    permissive = evaluate_report(report_path, policy_path)
    assert permissive.passed is True


def test_cli_ci_exit_codes_and_report_output(tmp_path):
    report_path = _write_report(tmp_path / "scan.json", score=85.0, verdict="fail", severity="critical")
    html_path = tmp_path / "report.html"

    assert main(["ci", str(report_path)]) == 1
    assert main(["ci", str(report_path), "--policy", str(tmp_path / "missing.yml")]) == 1
    assert main(["report", str(report_path), "--output", str(html_path), "--max-failures", "1"]) == 0
    assert html_path.exists()
    assert "Agent Redteam Report" in html_path.read_text(encoding="utf-8")


def test_review_export_redacts_and_defaults_to_needs_review(tmp_path):
    report_path = _write_report(tmp_path / "scan.json", secret_metadata=True)
    records = build_review_records(report_path)
    body = render_review_jsonl(records)

    assert len(records) == 1
    assert records[0].review_status == "needs_review"
    assert records[0].reviewer == ""
    assert "sk-testsecret1234567890" not in body
    assert "Bearer suite.secret.token" not in body
    assert "api_key=tagsecret" not in body
    assert "needs_review" in body


def test_cli_review_writes_markdown(tmp_path):
    report_path = _write_report(tmp_path / "scan.json")
    review_path = tmp_path / "review.md"

    assert main(["review", str(report_path), "--format", "markdown", "--output", str(review_path)]) == 0
    text = review_path.read_text(encoding="utf-8")
    assert "Agent Redteam Human Review Queue" in text
    assert "needs_review" in text


def test_evidence_index_summarizes_reports_docs_and_skips_non_scan_json(tmp_path):
    validation = tmp_path / "validation"
    validation.mkdir()
    report_path = _write_report(
        validation / "sk-reportsecret1234567890.json",
        target_model="unit-test-model sk-modelsecret1234567890",
    )
    (validation / "mutation-results.json").write_text("[]", encoding="utf-8")
    (validation / "NOTES.md").write_text("# Benchmark api_key=docsecret\n\nDetails", encoding="utf-8")

    index = build_evidence_index(validation)
    body = render_evidence_json(index)
    markdown = render_evidence_markdown(index)

    assert index["summary"]["reports"] == 1
    assert index["summary"]["documents"] == 1
    assert index["summary"]["auxiliary"] == 0
    assert index["summary"]["skipped"] == 1
    assert index["root"] == "validation"
    assert index["reports"][0]["total_samples"] == 1
    assert index["reports"][0]["failed"] == 1
    assert index["reports"][0]["json_was_extracted"] is True
    assert report_path.name not in body
    assert "sk-modelsecret1234567890" not in body
    assert "api_key=docsecret" not in body
    assert "sk-[REDACTED]" in body
    assert "api_key=[REDACTED]" in body
    assert "mutation-results.json" in body
    assert "Agent Redteam Evidence Index" in markdown


def test_evidence_index_summarizes_auxiliary_json_artifacts(tmp_path):
    validation = tmp_path / "validation"
    validation.mkdir()
    _write_report(validation / "scan.json")
    (validation / "multiturn-batch.json").write_text(
        json.dumps(
            {
                "batch": 1,
                "model": "GLM-5.2 sk-auxsecret1234567890",
                "results": [
                    {"sample_id": "mt-001", "verdict": "error"},
                    {"sample_id": "mt-002", "verdict": "pass"},
                ],
            }
        ),
        encoding="utf-8",
    )
    (validation / "mutation-results.json").write_text(
        json.dumps(
            [
                {"strategy": "base64", "sample_id": "inj-001", "bypassed": True},
                {"strategy": "split", "sample_id": "inj-001", "bypassed": False},
                {"strategy": "case_spoof", "sample_id": "inj-001", "bypassed": None},
            ]
        ),
        encoding="utf-8",
    )

    index = build_evidence_index(validation, options=EvidenceOptions(max_reports=1))
    body = render_evidence_json(index)
    markdown = render_evidence_markdown(index)

    assert index["summary"]["reports"] == 1
    assert index["summary"]["auxiliary"] == 2
    assert index["summary"]["skipped"] == 0
    assert {item["artifact_type"] for item in index["auxiliary"]} == {"multi_turn_batch", "mutation_results"}
    assert "sk-auxsecret1234567890" not in body
    assert "sk-[REDACTED]" in body
    assert "Auxiliary JSON Artifacts" in markdown
    assert "bypassed=1" in markdown


def test_evidence_index_reports_empty_json_files_clearly(tmp_path):
    validation = tmp_path / "validation"
    validation.mkdir()
    (validation / "empty.json").write_text("", encoding="utf-8")

    index = build_evidence_index(validation)

    assert index["summary"]["reports"] == 0
    assert index["summary"]["auxiliary"] == 0
    assert index["summary"]["skipped"] == 1
    assert index["skipped"][0]["reason"] == "empty file"


def test_cli_evidence_writes_markdown(tmp_path):
    validation = tmp_path / "validation"
    validation.mkdir()
    _write_report(validation / "scan.json", score=91.0, verdict="pass", severity="low")
    output = tmp_path / "evidence.md"

    assert main(["evidence", "--root", str(validation), "--output", str(output)]) == 0
    text = output.read_text(encoding="utf-8")
    assert "Agent Redteam Evidence Index" in text
    assert "91.0" in text


def test_release_gate_passes_with_fake_runner_and_artifacts(tmp_path):
    root = tmp_path
    dist = root / "dist"
    dist.mkdir()
    (dist / "agent_redteam-0.3.0-py3-none-any.whl").write_text("wheel", encoding="utf-8")
    (dist / "agent_redteam-0.3.0.tar.gz").write_text("sdist", encoding="utf-8")

    def fake_runner(command, cwd, timeout):
        joined = " ".join(command)
        if "doctor" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"failed": 0, "warned": 1, "score": 92.9}), stderr="")
        if "evidence" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"summary": {"reports": 9, "auxiliary": 2, "documents": 5, "skipped": 0}}), stderr="")
        return subprocess.CompletedProcess(command, 0, stdout="ok", stderr="")

    result = run_release_gate(root, runner=fake_runner)
    markdown = render_release_gate_markdown(result)

    assert result.passed is True
    assert {step.name for step in result.steps} >= {"doctor", "tests", "frontend.build", "evidence", "artifacts"}
    assert "PASS" in markdown
    assert "9 reports, 2 auxiliary, 5 docs, 0 skipped" in markdown


def test_release_gate_fails_on_doctor_warnings_when_strict(tmp_path):
    root = tmp_path
    dist = root / "dist"
    dist.mkdir()
    (dist / "agent_redteam-0.3.0-py3-none-any.whl").write_text("wheel", encoding="utf-8")
    (dist / "agent_redteam-0.3.0.tar.gz").write_text("sdist", encoding="utf-8")

    def fake_runner(command, cwd, timeout):
        joined = " ".join(command)
        if "doctor" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"failed": 0, "warned": 2, "score": 92.9}), stderr="")
        if "evidence" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"summary": {"reports": 9, "auxiliary": 2, "documents": 5, "skipped": 0}}), stderr="")
        return subprocess.CompletedProcess(command, 0, stdout="ok", stderr="")

    result = run_release_gate(root, ReleaseCheckOptions(strict_warnings=True), runner=fake_runner)

    assert result.passed is False
    doctor = next(step for step in result.steps if step.name == "doctor")
    assert doctor.status == "fail"
    assert "--strict-warnings" in doctor.detail


def test_release_gate_fails_when_evidence_has_skips(tmp_path):
    root = tmp_path

    def fake_runner(command, cwd, timeout):
        joined = " ".join(command)
        if "doctor" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"failed": 0, "warned": 0, "score": 100}), stderr="")
        if "evidence" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"summary": {"reports": 1, "auxiliary": 0, "documents": 0, "skipped": 1}}), stderr="")
        return subprocess.CompletedProcess(command, 0, stdout="ok", stderr="")

    result = run_release_gate(
        root,
        ReleaseCheckOptions(skip_frontend=True, skip_tests=True, skip_artifacts=True),
        runner=fake_runner,
    )

    assert result.passed is False
    evidence = next(step for step in result.steps if step.name == "evidence")
    assert evidence.status == "fail"
    assert "1 skipped" in evidence.detail


def test_release_gate_skips_twine_when_not_installed(tmp_path, monkeypatch):
    import agent_redteam.release_gate as release_gate

    root = tmp_path
    dist = root / "dist"
    dist.mkdir()
    (dist / "agent_redteam-0.3.0-py3-none-any.whl").write_text("wheel", encoding="utf-8")
    (dist / "agent_redteam-0.3.0.tar.gz").write_text("sdist", encoding="utf-8")
    monkeypatch.setattr(release_gate.shutil, "which", lambda name: None)

    def fake_runner(command, cwd, timeout):
        joined = " ".join(command)
        if "doctor" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"failed": 0, "warned": 0, "score": 100}), stderr="")
        if "evidence" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"summary": {"reports": 1, "auxiliary": 0, "documents": 0, "skipped": 0}}), stderr="")
        return subprocess.CompletedProcess(command, 0, stdout="ok", stderr="")

    result = run_release_gate(root, ReleaseCheckOptions(skip_tests=True, skip_frontend=True), runner=fake_runner)
    artifacts = next(step for step in result.steps if step.name == "artifacts")

    assert result.passed is True
    assert artifacts.status == "skip"
    assert "twine not installed" in artifacts.detail


def test_release_gate_runs_twine_check_when_available(tmp_path, monkeypatch):
    import agent_redteam.release_gate as release_gate

    root = tmp_path
    dist = root / "dist"
    dist.mkdir()
    (dist / "agent_redteam-0.3.0-py3-none-any.whl").write_text("wheel", encoding="utf-8")
    (dist / "agent_redteam-0.3.0.tar.gz").write_text("sdist", encoding="utf-8")
    monkeypatch.setattr(release_gate.shutil, "which", lambda name: "/usr/bin/twine")
    commands = []

    def fake_runner(command, cwd, timeout):
        commands.append(command)
        joined = " ".join(command)
        if "doctor" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"failed": 0, "warned": 0, "score": 100}), stderr="")
        if "evidence" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"summary": {"reports": 1, "auxiliary": 0, "documents": 0, "skipped": 0}}), stderr="")
        return subprocess.CompletedProcess(command, 0, stdout="ok", stderr="")

    result = run_release_gate(root, ReleaseCheckOptions(skip_tests=True, skip_frontend=True), runner=fake_runner)
    artifacts = next(step for step in result.steps if step.name == "artifacts")

    assert result.passed is True
    assert artifacts.status == "pass"
    assert "twine check passed" in artifacts.detail
    assert any(command[:2] == ["/usr/bin/twine", "check"] for command in commands)


def test_release_gate_fails_when_twine_check_fails(tmp_path, monkeypatch):
    import agent_redteam.release_gate as release_gate

    root = tmp_path
    dist = root / "dist"
    dist.mkdir()
    (dist / "agent_redteam-0.3.0-py3-none-any.whl").write_text("wheel", encoding="utf-8")
    (dist / "agent_redteam-0.3.0.tar.gz").write_text("sdist", encoding="utf-8")
    monkeypatch.setattr(release_gate.shutil, "which", lambda name: "/usr/bin/twine")

    def fake_runner(command, cwd, timeout):
        joined = " ".join(command)
        if "doctor" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"failed": 0, "warned": 0, "score": 100}), stderr="")
        if "evidence" in joined:
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps({"summary": {"reports": 1, "auxiliary": 0, "documents": 0, "skipped": 0}}), stderr="")
        if command[:2] == ["/usr/bin/twine", "check"]:
            return subprocess.CompletedProcess(command, 1, stdout="", stderr="README rendering failed")
        return subprocess.CompletedProcess(command, 0, stdout="ok", stderr="")

    result = run_release_gate(root, ReleaseCheckOptions(skip_tests=True, skip_frontend=True), runner=fake_runner)
    artifacts = next(step for step in result.steps if step.name == "artifacts")

    assert result.passed is False
    assert artifacts.status == "fail"
    assert "README rendering failed" in artifacts.detail


def test_cli_release_check_supports_skip_mode_json():
    assert main([
        "release-check",
        "--skip-tests",
        "--skip-frontend",
        "--skip-evidence",
        "--skip-artifacts",
        "--format",
        "json",
    ]) == 0


def test_doctor_detects_action_key_argv_pattern(tmp_path):
    root = tmp_path
    (root / "pyproject.toml").write_text('version = "0.3.0"\ndependencies = []\n', encoding="utf-8")
    (root / "README.md").write_text("uses: uninhibited-scholar/agent-redteam@v0.3.0\n", encoding="utf-8")
    (root / "action.yml").write_text(
        'runs:\n  using: "composite"\n  steps:\n    - run: agent-redteam scan --key $INPUT_API_KEY\n',
        encoding="utf-8",
    )

    report = audit_project(root)
    checks = {check.id: check for check in report.checks}
    assert checks["action.no_key_argv"].status == "fail"


def test_doctor_accepts_current_action_docs_and_web_quality_scripts(tmp_path):
    root = tmp_path
    (root / "pyproject.toml").write_text('version = "0.3.0"\ndependencies = []\n', encoding="utf-8")
    (root / "README.md").write_text("uses: uninhibited-scholar/agent-redteam@v0.3.0\n", encoding="utf-8")
    (root / "SECURITY.md").write_text("# Security Policy\n", encoding="utf-8")
    (root / "CONTRIBUTING.md").write_text("# Contributing\n", encoding="utf-8")
    (root / "RELEASE_CHECKLIST.md").write_text("# Release Checklist\n", encoding="utf-8")
    github = root / ".github"
    github.mkdir()
    (github / "PULL_REQUEST_TEMPLATE.md").write_text("## Test\n", encoding="utf-8")
    issue_templates = github / "ISSUE_TEMPLATE"
    issue_templates.mkdir()
    (issue_templates / "bug_report.yml").write_text("name: Bug report\n", encoding="utf-8")
    (root / "action.yml").write_text(
        "\n".join(
            [
                'runs:',
                '  using: "composite"',
                '  steps:',
                '    - run: |',
                '        echo "score=100" >> "$GITHUB_OUTPUT"',
                '        export OPENAI_API_KEY="$INPUT_API_KEY"',
                '        ARGS=("--target" "$INPUT_TARGET")',
                '        agent-redteam scan "${ARGS[@]}" --format json',
            ]
        ),
        encoding="utf-8",
    )
    web = root / "web"
    web.mkdir()
    (web / "package.json").write_text(
        json.dumps(
            {
                "scripts": {
                    "typecheck": "tsc --noEmit",
                    "typecheck:strict": "tsc --noEmit --noUnusedLocals --noUnusedParameters",
                }
            }
        ),
        encoding="utf-8",
    )

    report = audit_project(root)
    checks = {check.id: check for check in report.checks}
    assert checks["docs.action_version"].status == "pass"
    assert checks["community.health"].status == "pass"
    assert checks["web.quality_scripts"].status == "pass"


def test_doctor_warns_when_security_policy_is_missing(tmp_path):
    root = tmp_path
    (root / "pyproject.toml").write_text('version = "0.3.0"\ndependencies = []\n', encoding="utf-8")
    (root / "README.md").write_text("uses: uninhibited-scholar/agent-redteam@v0.3.0\n", encoding="utf-8")
    (root / "CONTRIBUTING.md").write_text("# Contributing\n", encoding="utf-8")
    (root / "RELEASE_CHECKLIST.md").write_text("# Release Checklist\n", encoding="utf-8")
    github = root / ".github"
    github.mkdir()
    (github / "PULL_REQUEST_TEMPLATE.md").write_text("## Test\n", encoding="utf-8")
    (github / "ISSUE_TEMPLATE.md").write_text("## Bug\n", encoding="utf-8")

    report = audit_project(root)
    checks = {check.id: check for check in report.checks}
    assert checks["community.health"].status == "warn"
    assert "SECURITY.md" in checks["community.health"].detail


def test_doctor_detects_validation_evidence_workflow(tmp_path):
    root = tmp_path
    src = root / "src" / "agent_redteam"
    tests = root / "tests"
    src.mkdir(parents=True)
    tests.mkdir()
    (src / "evidence.py").write_text("# evidence command\n", encoding="utf-8")
    (src / "cli.py").write_text('sub.add_parser("evidence")\n', encoding="utf-8")
    (tests / "test_maturity_commands.py").write_text("def test_evidence_index(): pass\n", encoding="utf-8")

    report = audit_project(root)
    checks = {check.id: check for check in report.checks}
    assert checks["validation.evidence_workflow"].status == "pass"


def test_action_uses_env_key_not_argv():
    action = Path(__file__).resolve().parents[1] / "action.yml"
    text = action.read_text(encoding="utf-8")

    assert "--key $INPUT_API_KEY" not in text
    assert "--key \"$INPUT_API_KEY\"" not in text
    assert "export OPENAI_API_KEY=\"$INPUT_API_KEY\"" in text
    assert 'agent-redteam scan "${ARGS[@]}" --format json' in text
