# Security Policy

Agent Redteam is a security testing tool, so vulnerability reports should be handled with a little extra care. Please do not open public issues for secrets, bypasses in deployed systems, or exploitable bugs in the tool itself.

## Supported Versions

The `main` branch and the latest PyPI release are supported for security fixes. Older versions may receive a fix when the issue is severe and the patch is low risk.

## Reporting a Vulnerability

Report security issues privately by opening a GitHub Security Advisory when available, or by contacting the maintainer through the repository owner's GitHub profile.

Please include:

- affected version or commit
- exact command, config, or API path involved
- whether the issue exposes secrets, changes scan verdicts, or enables unsafe output
- minimal reproduction steps
- expected impact and any proposed fix

Do not include real API keys, customer data, private prompts, or production model responses. Redact secrets before sharing artifacts.

## Scope

In scope:

- API key or token exposure in CLI, logs, reports, dashboard, GitHub Actions, or generated artifacts
- incorrect pass/fail verdicts caused by deterministic bugs in checks
- report rendering issues that could execute active content
- supply-chain risks in package metadata, release artifacts, or CI workflows
- dashboard endpoints that expose local files or scan history unintentionally

Out of scope:

- model behavior differences that are already represented as benchmark findings
- denial-of-service reports that require excessive third-party API spend
- vulnerabilities in third-party model providers
- social engineering or attacks against maintainers

## Disclosure Expectations

The goal is coordinated disclosure. The maintainer will try to acknowledge credible reports quickly, keep discussion private until a fix is ready, and credit reporters when desired.

For published benchmark evidence, use:

```bash
agent-redteam attest report.json
agent-redteam report report.json --output report.html
agent-redteam review report.json --output review.md
```

These commands redact common secrets, but reporters are still responsible for checking artifacts before sharing them.
