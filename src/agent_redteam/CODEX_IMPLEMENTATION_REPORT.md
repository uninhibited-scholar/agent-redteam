# Codex Implementation Report

Date: 2026-07-09

## Goal

Add independent, low-alignment-cost capabilities that make Agent Redteam more mature, easier to adopt, and more credible as a real-world security platform. These additions do not continue the previous agent's unfinished dashboard/product line; they are standalone CLI workflows around onboarding, release credibility, benchmark evidence, and CI policy gating.

## Added Capabilities

### 1. `agent-redteam doctor`

Purpose: project/release readiness self-audit.

Files:
- `project_audit.py`
- `cli.py`

Checks:
- package version consistency
- package maturity classifier
- README GitHub Action version drift
- deprecated GitHub Action output API usage
- zero-dependency runtime claim
- frontend quality scripts
- Python test module presence
- bundled dashboard assets
- validation benchmark artifacts
- release artifacts
- git working tree state

Example:

```bash
agent-redteam doctor
agent-redteam doctor --format json
agent-redteam doctor --fail-on-warn
```

Observed result before fixing `action.yml`:

```text
Score: 72.7/100  (6 pass, 4 warn, 1 fail)
```

The fail was real: `action.yml` used deprecated `::set-output`.

Follow-up fix applied:

```text
Score: 81.8/100  (7 pass, 4 warn, 0 fail)
```

`action.yml` now writes composite action outputs through `$GITHUB_OUTPUT`.

### 2. `agent-redteam attest`

Purpose: turn an existing scan JSON into a reproducible, redacted benchmark evidence card.

Files:
- `attest.py`
- `cli.py`

Features:
- accepts scan JSON even when CLI log lines appear before the JSON object
- emits Markdown or JSON
- calculates raw SHA-256 and canonical public SHA-256
- summarizes score, suites, severity, OWASP distribution, and top failures
- redacts common secrets, bearer tokens, private keys, and email addresses
- truncates evidence snippets for safer publication

Example:

```bash
agent-redteam attest validation/full-300-final.json
agent-redteam attest validation/full-300-final.json --format json --max-failures 20
```

Validated against `validation/full-300-final.json`, producing a GLM-5.2 attestation with:

```text
Overall Score: 84.6/100
Samples: 300 total, 247 passed, 53 failed, 0 errors
Raw SHA-256: 4f6bb0bfd02e188508b3a82811bbc345cb10af71a00d4456697290c434aeac33
```

### 3. `agent-redteam init`

Purpose: make first-run onboarding practical and safe.

Files:
- `onboarding.py`
- `cli.py`
- `core/config.py`

Features:
- creates a local scan config, defaulting to `~/.agent-redteam/config`
- supports OpenAI, Claude, Z.ai, DeepSeek, Qwen, Azure, Ollama, and local targets
- provides safe `--dry-run`
- never prints a provided API key; terminal/JSON previews redact it
- prints next commands for list, smoke scan, dashboard, and doctor
- writes config with `0600` permissions when possible
- teaches `scan` to respect `target` from config

Examples:

```bash
agent-redteam init --target zai --dry-run
agent-redteam init --target ollama --dry-run --format json
agent-redteam init --target deepseek --api-key "$DEEPSEEK_API_KEY"
```

Verified behavior:
- dry-run does not write files
- API key preview shows `[REDACTED]`
- temp config write succeeded at `/tmp/agent-redteam-init-test-config`

### 4. `agent-redteam ci`

Purpose: evaluate an existing scan report against a simple CI policy.

Files:
- `ci_policy.py`
- `cli.py`

Features:
- consumes an existing scan JSON report
- supports a zero-dependency `key: value` policy file
- emits terminal, JSON, or Markdown
- can write Markdown summary for GitHub Actions step summary
- exits non-zero when policy fails
- includes a built-in sample policy printer

Example:

```bash
agent-redteam ci --print-sample-policy
agent-redteam ci report.json --policy .agent-redteam-policy.yml
agent-redteam ci report.json --format markdown --summary-file "$GITHUB_STEP_SUMMARY"
```

Default policy evaluation against `validation/full-300-final.json` correctly failed:

```text
Status: FAIL
Score: 84.6/100
Critical failures: 8
High failures: 24
```

A temporary permissive policy correctly passed and generated a Markdown summary file.

### 5. GitHub Action output hardening

Purpose: remove deprecated GitHub Actions output API usage caught by `doctor`.

Files:
- `action.yml`

Change:
- replaced `::set-output` with appends to `$GITHUB_OUTPUT`
- preserved existing output names: `score`, `total-samples`, `total-failed`, `sarif-file`

Validation:
- `agent-redteam doctor` now reports the GitHub Action output API check as pass.

### 5b. GitHub Action API key argv hardening

Purpose: remove a pre-existing secret exposure risk where the composite action passed `${{ inputs.api-key }}` to `agent-redteam scan` via `--key`.

Files:
- `action.yml`
- `project_audit.py`
- `tests/test_maturity_commands.py`

Changes:
- `action.yml` now exports `OPENAI_API_KEY="$INPUT_API_KEY"` instead of appending `--key $INPUT_API_KEY` to argv
- scan arguments are built as a bash array and invoked with `"${ARGS[@]}"`, reducing word-splitting risk
- `doctor` now fails if an action passes `INPUT_API_KEY` through `--key`
- tests verify both the unsafe legacy pattern and the current safe action file

Validation:
- `agent-redteam doctor` reports `GitHub Action API key handling` as pass
- `rg -- "--key.*INPUT_API_KEY|INPUT_API_KEY.*--key|::set-output" action.yml` finds no matches

### 6. `agent-redteam report`

Purpose: generate a standalone, shareable HTML or Markdown report from an existing scan JSON file.

Files:
- `html_report.py`
- `cli.py`

Features:
- consumes the same scan JSON format as `attest`
- tolerates CLI log text before the JSON object
- emits single-file HTML with inline CSS and no external assets
- includes executive metrics, suite breakdown, risk summary, failure evidence, and reproducibility hashes
- reuses attestation redaction/truncation for safer publication
- supports Markdown output for text workflows

Examples:

```bash
agent-redteam report validation/full-300-final.json --output report.html
agent-redteam report validation/full-300-final.json --format markdown --max-failures 10
```

Validated against `validation/full-300-final.json`:

```text
Wrote html report: /tmp/agent-redteam-report.html
HTML size: 14602 bytes
```

The generated HTML contains:
- `Agent Redteam Report`
- model name `GLM-5.2`
- `Failure Evidence`
- raw SHA-256 reproducibility hash

### 6b. `agent-redteam review`

Purpose: export failed/error/all samples into a human review queue so teams can confirm true positives, mark false positives, and keep notes without re-running a scan.

Files:
- `review.py`
- `cli.py`
- `tests/test_maturity_commands.py`

Features:
- consumes existing scan JSON
- exports JSONL or Markdown
- default export is failed samples only
- each record starts with `review_status: needs_review`
- fields are ready for `true_positive`, `false_positive`, or `needs_review`
- reuses attestation redaction/truncation for safer review artifacts

Examples:

```bash
agent-redteam review validation/full-300-final.json --format jsonl --max-records 20
agent-redteam review validation/full-300-final.json --format markdown --output review.md
```

Validated against `validation/full-300-final.json`:

```text
Wrote markdown review queue: /tmp/agent-redteam-review.md (1 records)
```

### 7. Dedicated tests for maturity commands

Purpose: address review feedback that the new standalone modules had no direct unit tests.

Files:
- `tests/test_maturity_commands.py`
- `attest.py`
- `ci_policy.py`

Coverage added:
- log-prefix JSON extraction
- secret redaction for `sk-*`, bearer tokens, emails, and `api_key=...`
- HTML escaping for `<script>` and `<img onerror=...>` payloads
- metadata redaction for `sample_id`, `category`, and `tags`
- risk summary count-key redaction for `suite`, `severity`, and `owasp`
- `init` JSON redaction and dry-run no-write behavior
- CI policy fail/pass paths
- CLI `ci` exit code behavior
- CLI `report` file output path
- `review` JSONL/Markdown export and default `needs_review` status
- `doctor` detection for unsafe Action API key argv usage
- `doctor` community health pass/warn behavior

Follow-up cleanup:
- replaced deprecated `datetime.utcnow()` with timezone-aware `datetime.now(datetime.UTC)`
- documented the intentional split between lenient built-in CI defaults and stricter sample policy baseline
- redacted publication-facing metadata fields in `attest`/`report` evidence rows
- redacted risk summary count keys so no publication-facing aggregate labels bypass redaction

### 8. Release readiness cleanup

Purpose: close the remaining low-effort `doctor` warnings that directly affect user onboarding and release reproducibility.

Files:
- `README.md`
- `docs/article-zhihu-juejin.md`
- `web/package.json`
- `tests/test_maturity_commands.py`

Changes:
- updated GitHub Action snippets from `v0.2.0` to the current `v0.3.0`
- added explicit `npm run typecheck` and `npm run typecheck:strict` scripts for dashboard validation
- added a doctor regression test covering current Action docs and web quality scripts

Expected `doctor` impact:
- `docs.action_version` moves from warn to pass
- `web.quality_scripts` moves from warn to pass
- remaining warnings are intentionally policy/history related: Alpha classifier and pre-existing untracked validation artifacts

Observed result:

```text
Score: 91.7/100  (10 pass, 2 warn, 0 fail)
```

### 9. Community and release governance

Purpose: make the project easier to trust, contribute to, and release as an open security tool.

Files:
- `SECURITY.md`
- `RELEASE_CHECKLIST.md`
- `CONTRIBUTING.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/*.yml`
- `project_audit.py`
- `tests/test_maturity_commands.py`

Changes:
- added a private security reporting policy with explicit scope for secret leaks, report rendering bugs, Action secret handling, and dashboard exposure
- added a release checklist covering scope, safety, validation, benchmark evidence, packaging, and publishing
- added structured GitHub issue templates for bugs, sample/check improvements, and feature requests
- updated the PR template with security-impact and modern validation checks
- updated contributor docs to use the new web typecheck scripts and release checklist
- added `doctor` coverage for community health files

Observed result:

```text
Score: 92.3/100  (11 pass, 2 warn, 0 fail)
```

### 10. Validation evidence index

Purpose: make benchmark and validation artifacts easier to review, hash, and cite without re-running scans.

Files:
- `evidence.py`
- `cli.py`
- `project_audit.py`
- `tests/test_maturity_commands.py`

Command:

```bash
agent-redteam evidence --root validation
agent-redteam evidence --root validation --format json
agent-redteam evidence --root validation --output validation/EVIDENCE_INDEX.md
```

Features:
- scans a validation artifact directory for scan JSON reports
- tolerates log prefixes by reusing the attestation JSON extraction path
- emits raw SHA-256 and canonical SHA-256 for each report
- summarizes model, score, sample counts, failed counts, weakest suite, and extracted-log status
- indexes Markdown narrative reports with title, byte size, and SHA-256
- indexes known auxiliary JSON artifacts such as multi-turn batches and mutation results
- skips unknown or empty non-scan JSON files with an explicit reason instead of failing the whole command
- redacts common secret patterns in paths, model names, titles, and rendered output
- adds a `doctor` check for the validation evidence workflow

Observed against the current `validation/` directory:

```text
9 scan reports
2 auxiliary JSON artifacts
5 narrative documents
0 skipped JSON files
1800 total samples
380 total failed
79.2/100 average score
```

### 11. Local release gate

Purpose: turn the release checklist into a reusable local preflight command that maintainers can run before tagging or publishing.

Files:
- `release_gate.py`
- `cli.py`
- `project_audit.py`
- `.github/workflows/ci.yml`
- `RELEASE_CHECKLIST.md`
- `tests/test_maturity_commands.py`

Command:

```bash
agent-redteam release-check
agent-redteam release-check --format json
agent-redteam release-check --strict-warnings
agent-redteam release-check --skip-tests --skip-frontend --skip-evidence --skip-sbom --skip-artifacts
```

Features:
- runs `doctor` and fails on doctor failures
- optionally treats doctor warnings as failures with `--strict-warnings`
- runs `pytest -q`
- runs frontend `typecheck`, `typecheck:strict`, and `build`
- runs `evidence --root validation --format json` and fails if artifacts are skipped
- runs `sbom --format json` and fails if no components are present
- checks that wheel and sdist for the package version are present
- runs `twine check` on wheel and sdist when `twine` is installed
- skips only the metadata check when `twine` is unavailable, while still requiring artifacts to exist
- emits terminal, JSON, or Markdown
- supports skip flags for targeted local checks and CI composition
- adds a `doctor` check for the release gate workflow
- updates CI frontend steps to use the committed npm scripts instead of ad-hoc `npx`

Observed local result:

```text
Status: PASS
doctor: pass, 0 fail / 2 warn, score 94.4/100
tests: pass
frontend.typecheck: pass
frontend.strict: pass
frontend.build: pass
evidence: pass, 9 reports / 2 auxiliary / 5 docs / 0 skipped
sbom: pass, 122 components / 4 python / 118 npm / 0 python runtime / 3 npm runtime / 2 release artifacts
artifacts: pass, wheel and sdist present for 0.3.0, twine check passed
```

### 12. Release manifest

Purpose: create a compact, reproducible release provenance file that external reviewers can inspect without rerunning every command.

Files:
- `release_manifest.py`
- `cli.py`
- `project_audit.py`
- `docs/cli.md`
- `RELEASE_CHECKLIST.md`
- `tests/test_maturity_commands.py`

Command:

```bash
agent-redteam manifest --format json
agent-redteam manifest --format markdown --output RELEASE_MANIFEST.md
agent-redteam manifest --include-release-check --format json
```

Features:
- records schema, generation time, project name, and package version
- records git commit, branch, dirty status, and changed file count
- records wheel and sdist existence, byte size, and SHA-256
- summarizes validation evidence reports, auxiliary JSON artifacts, documents, skipped files, sample counts, failed counts, and average score
- optionally embeds release-check step results
- redacts common secret patterns in generated fields
- adds a `doctor` check for the release manifest workflow

Observed local manifest summary:

```text
version: 0.3.0
git commit: d376f70a26ea4fa26f1c53a43f894772f71ffe27
artifacts: wheel 356045 bytes, sdist 973804 bytes
evidence: 9 reports / 2 auxiliary / 5 docs / 0 skipped
samples: 1800 total / 380 failed / 79.2 average score
```

### 13. Regression gate

Purpose: catch security regressions between a previously accepted baseline scan and a current scan, even when the overall score improves.

Files:
- `regression.py`
- `cli.py`
- `project_audit.py`
- `docs/cli.md`
- `RELEASE_CHECKLIST.md`
- `tests/test_maturity_commands.py`

Command:

```bash
agent-redteam regress baseline.json current.json
agent-redteam regress baseline.json current.json --format json
agent-redteam regress baseline.json current.json --format markdown --output regression.md
```

Features:
- compares baseline vs current scan JSON using stable `(suite, sample_id)` keys
- reports score delta, failed-count delta, new failures, severity escalations, fixed failures, new critical failures, and new high failures
- defaults to allowing at most a 2.0 point score drop, 0 new critical failures, and 0 new high failures
- treats same-sample severity escalation such as `high -> critical` as a gate failure
- only counts a baseline failure as fixed when the current verdict is `pass`, not merely `error`
- fails when total sample counts or suite sets differ, because the reports are not comparable
- supports optional `--max-new-failures`
- renders terminal, JSON, and Markdown
- returns exit 1 when the regression gate fails, so it can be used in CI
- redacts common secret patterns in sample metadata before rendering
- adds a `doctor` check for the regression gate workflow

Observed local behavior on validation reports:

```text
baseline: validation/full-300-v2.json
current: validation/full-300-final.json
score: 83.5 -> 84.6 (+1.10)
failed: 56 -> 53 (-3)
new failures: 7
escalated failures: 0
fixed failures: 10
new critical: 2
new high: 3
default gate: FAIL
```

This is intentional: the total score improved, but critical/high sample regressions appeared.

Post-review fixes:
- closed the severity-upgrade gap where an already-failing sample could move from high to critical without tripping the gate
- fixed fail-to-error transitions so they no longer appear as fixed failures
- added a comparability finding for mismatched sample counts or suite sets
- documented why aggregate score has a tolerance while high/critical risk movement is zero-tolerance by default

### 14. Local SBOM

Purpose: give security reviewers and release consumers a local software bill of materials without sending project code to an external service.

Files:
- `sbom.py`
- `cli.py`
- `project_audit.py`
- `release_gate.py`
- `docs/cli.md`
- `RELEASE_CHECKLIST.md`
- `tests/test_maturity_commands.py`

Command:

```bash
agent-redteam sbom --format json
agent-redteam sbom --format markdown --output SBOM.md
agent-redteam sbom --runtime-only --format json
```

Features:
- emits a CycloneDX-style JSON document plus Markdown rendering
- reads Python package metadata and dependency groups from `pyproject.toml`
- reads frontend dependency versions, licenses, and integrity hashes from `web/package-lock.json`
- records release artifact byte sizes and SHA-256 values from `dist/`
- supports `--runtime-only` to exclude dev/optional dependencies
- adds a `doctor` check for the SBOM workflow
- adds an SBOM step to `release-check`

Observed local SBOM summary:

```text
components: 122
python dependencies: 4
npm dependencies: 118
python runtime dependencies: 0
npm runtime dependencies: 3
dev dependencies: 117
release artifacts: 2
```

### 15. Risk acceptance waivers

Purpose: let teams temporarily accept specific known failures without weakening the global CI policy.

Files:
- `waivers.py`
- `ci_policy.py`
- `cli.py`
- `project_audit.py`
- `docs/cli.md`
- `RELEASE_CHECKLIST.md`
- `tests/test_maturity_commands.py`

Command:

```bash
agent-redteam ci scan.json --waivers .agent-redteam-waivers.json
agent-redteam ci --print-sample-waivers
```

Features:
- waiver records are keyed by `(suite, sample_id)`
- each waiver must include `owner`, `reason`, and ISO `expires`
- waivers are capped by `max_waiver_days` (default 90) to prevent permanent risk suppression
- active waivers are subtracted from high/critical failure counts
- expired or invalid waivers fail the CI gate
- unused active waivers render as warnings so teams can prune stale risk acceptances
- waiver output reuses redaction for emails, secrets, sample IDs, and reasons
- adds a `doctor` check for the waiver workflow

Observed local behavior:

```text
baseline CI on validation/full-300-final.json:
critical failures: 8
high failures: 24
waived failures: 0
exit: 1

with temporary waiver for excessive_agency/ea-017:
critical failures: 7
high failures: 24
waived failures: 1
exit: 1 because remaining high/critical still exceed policy

with 2099-12-31 waiver for excessive_agency/ea-017:
critical failures: 8
waived failures: 0
waivers.valid: fail, expires beyond max_waiver_days 90
exit: 1
```

### 16. Policy lint

Purpose: fail fast on broken CI policy or waiver files before requiring a scan report.

Files:
- `policy_lint.py`
- `cli.py`
- `project_audit.py`
- `docs/cli.md`
- `RELEASE_CHECKLIST.md`
- `tests/test_maturity_commands.py`

Command:

```bash
agent-redteam policy-lint --policy .agent-redteam-policy.yml --waivers .agent-redteam-waivers.json
```

Checks:
- policy loadability
- unknown policy keys
- numeric policy thresholds
- `allow_errors` type
- waiver loadability
- missing waiver fields
- expired waiver records
- waiver expiry beyond `max_waiver_days`
- duplicate waiver keys

The command is report-free and does not import the scan engine.

## Config Changes

`core/config.py` now treats these keys as recognized scan config:

```text
api_key, base_url, model, target, suites, workers, max_tokens, fail_below
```

Dashboard-safe config status also includes `default_target`, without exposing API keys.

## Validation

Commands run:

```bash
python -m compileall attest.py ci_policy.py onboarding.py project_audit.py cli.py core/config.py
python -m agent_redteam.cli --help
python -m agent_redteam.cli init --target zai --api-key sk-test-secret-1234567890 --dry-run
python -m agent_redteam.cli attest validation/full-300-final.json --max-failures 3
python -m agent_redteam.cli ci validation/full-300-final.json
python -m agent_redteam.cli ci validation/full-300-final.json --policy /tmp/agent-redteam-pass-policy.yml --summary-file /tmp/agent-redteam-ci-summary.md
python -m agent_redteam.cli ci --print-sample-waivers
python -m agent_redteam.cli ci validation/full-300-final.json --waivers /tmp/agent-redteam-waivers.json --format json
python -m agent_redteam.cli policy-lint --format json
python -m agent_redteam.cli policy-lint --waivers /tmp/agent-redteam-waivers.json --format json
python -m agent_redteam.cli doctor
python -m agent_redteam.cli report validation/full-300-final.json --output /tmp/agent-redteam-report.html --max-failures 5
python -m agent_redteam.cli report validation/full-300-final.json --format markdown --max-failures 2
python -m agent_redteam.cli review validation/full-300-final.json --format jsonl --max-records 2
python -m agent_redteam.cli review validation/full-300-final.json --format markdown --max-records 1 --output /tmp/agent-redteam-review.md
python -m agent_redteam.cli evidence --root validation --output /tmp/agent-redteam-evidence.md
python -m agent_redteam.cli regress validation/full-300-v2.json validation/full-300-final.json --format json
python -m agent_redteam.cli sbom --format json
python -m agent_redteam.cli sbom --runtime-only --format markdown --output /tmp/agent-redteam-sbom.md
python -m agent_redteam.cli release-check --format json
python -m agent_redteam.cli manifest --format json
python -m agent_redteam.cli manifest --include-release-check --skip-tests --skip-frontend --skip-evidence --skip-sbom --skip-artifacts --format markdown
pytest tests/test_maturity_commands.py -q
pytest
npm --prefix web run typecheck
npm --prefix web run typecheck:strict
npm --prefix web run build
```

Final test result:

```text
196 passed in 10.96s
```

## Current Git State Notes

Codex-created or modified files:
- `action.yml`
- `cli.py`
- `core/config.py`
- `attest.py`
- `ci_policy.py`
- `html_report.py`
- `onboarding.py`
- `project_audit.py`
- `policy_lint.py`
- `review.py`
- `evidence.py`
- `release_gate.py`
- `release_manifest.py`
- `regression.py`
- `sbom.py`
- `waivers.py`
- `CODEX_IMPLEMENTATION_REPORT.md`
- `tests/test_maturity_commands.py`

Pre-existing untracked validation files are still present and were not modified by this work:
- `validation/MULTITURN-REPORT.md`
- `validation/multiturn-glm-5.2-batch1.json`
- `validation/multiturn-llama3.2-1b.json`
- `validation/multiturn-qwen2.5-0.5b.json`

## Suggested Claude Review Focus

1. Verify that the new commands are independent and do not change scan engine behavior.
2. Check that `init` never leaks a provided API key in terminal, JSON, or Markdown output.
3. Review `attest` redaction patterns and canonical hash design.
4. Review `ci` policy defaults and whether default required suites should remain empty or enforce a baseline.
5. Consider adding repository-level tests for the new modules once test files are writable in the working session.
