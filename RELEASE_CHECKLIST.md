# Release Checklist

Use this checklist before tagging a release, publishing to PyPI, or updating the GitHub Action tag.

## 1. Scope

- [ ] Confirm the release goal and user-facing changes.
- [ ] Review new scan engine, check, suite, target, CLI, dashboard, and docs changes.
- [ ] Confirm no unrelated generated files or local validation drafts are being shipped accidentally.

## 2. Safety

- [ ] Run `agent-redteam doctor`.
- [ ] Confirm `doctor` has `0 fail`.
- [ ] Review any `doctor` warnings and document why they are acceptable.
- [ ] Check that generated reports do not contain raw API keys, bearer tokens, emails, or private prompts.
- [ ] If `action.yml` changed, confirm secrets are passed through environment variables rather than command-line arguments.

## 3. Validation

```bash
agent-redteam release-check
pytest -q
npm --prefix web run typecheck
npm --prefix web run typecheck:strict
npm --prefix web run build
python -m agent_redteam.cli doctor
```

- [ ] Python tests pass.
- [ ] Dashboard typecheck passes.
- [ ] Dashboard build updates bundled static assets when needed.
- [ ] CLI smoke commands still work: `list`, `doctor`, `init --dry-run`, `attest`, `ci`, `regress`, `sbom`, `report`, `review`, `evidence`, `release-check`, and `manifest`.

## 4. Benchmark Evidence

- [ ] Keep raw scan JSON for headline benchmark claims.
- [ ] Generate an attestation card with `agent-redteam attest`.
- [ ] Generate a shareable HTML report with `agent-redteam report`.
- [ ] Export failed samples for human review with `agent-redteam review`.
- [ ] Lint CI policy and waiver files with `agent-redteam policy-lint`.
- [ ] Compare against the previous accepted baseline with `agent-redteam regress`.
- [ ] Treat score drops as noisy within policy, but keep new/escalated high and critical failures at zero tolerance unless there is an explicit risk acceptance note.
- [ ] If known failures are accepted, record them in an expiring waiver file instead of weakening global CI thresholds; keep expiry within `max_waiver_days`.
- [ ] Generate a validation artifact index with `agent-redteam evidence --root validation`.
- [ ] Generate or attach a local SBOM with `agent-redteam sbom --format json`.
- [ ] Generate or attach a release manifest with `agent-redteam manifest --format json`.
- [ ] Record model, target, sample limit, date, and command line in the validation note.

## 5. Packaging

```bash
python -m build
python -m twine check dist/*
```

- [ ] Wheel and sdist are present for the package version.
- [ ] `agent-redteam release-check` reports `twine check passed`, or `python -m twine check dist/*` was run manually.
- [ ] `pyproject.toml`, `agent_redteam.__version__`, README Action snippets, and release tag agree.
- [ ] GitHub Action examples use the current tag.

## 6. Publish

- [ ] Create the release commit.
- [ ] Tag the release.
- [ ] Push the branch and tag.
- [ ] Publish to PyPI only after the tag and artifacts match.
- [ ] Update release notes with security-relevant changes and benchmark caveats.
