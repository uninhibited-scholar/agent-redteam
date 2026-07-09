"""Standalone HTML report generation for saved scan JSON files."""
from __future__ import annotations

import html
from pathlib import Path
from typing import Any

from .attest import AttestationOptions, attest_report, render_attestation_markdown


def build_report(path: str | Path, *, max_failures: int = 25, snippet_chars: int = 420) -> dict[str, Any]:
    return attest_report(
        path,
        AttestationOptions(
            max_failures=max_failures,
            include_pass_samples=False,
            snippet_chars=snippet_chars,
        ),
    )


def render_report_html(report: dict[str, Any]) -> str:
    target = report["target"]
    score = report["score"]
    source = report["source"]
    risk = report["risk_summary"]
    failures = report["top_failures"]
    score_class = _score_class(score["overall"])
    suite_rows = "\n".join(_suite_row(s) for s in report["suite_breakdown"])
    failure_blocks = "\n".join(_failure_block(f) for f in failures) or "<p class='muted'>No failed samples included.</p>"
    severity_items = _kv_cards(risk.get("by_severity", {}))
    suite_items = _kv_cards(risk.get("by_suite", {}))
    owasp_items = _kv_cards(risk.get("by_owasp", {}))

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Redteam Report - {_e(target.get("model") or "unknown")}</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #0b1020;
      --panel: #121a2f;
      --panel-2: #17223b;
      --text: #e7edf8;
      --muted: #9aa8bd;
      --line: #293653;
      --green: #35c285;
      --yellow: #e4b44c;
      --red: #ef6a6a;
      --blue: #74a7ff;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    main {{ max-width: 1120px; margin: 0 auto; padding: 32px 24px 56px; }}
    header {{ display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 28px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; letter-spacing: 0; }}
    h2 {{ margin: 28px 0 12px; font-size: 18px; letter-spacing: 0; }}
    h3 {{ margin: 0 0 10px; font-size: 15px; letter-spacing: 0; }}
    .muted {{ color: var(--muted); }}
    .score {{
      min-width: 190px;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      text-align: center;
    }}
    .score strong {{ display: block; font-size: 38px; line-height: 1; }}
    .score.good strong {{ color: var(--green); }}
    .score.warn strong {{ color: var(--yellow); }}
    .score.bad strong {{ color: var(--red); }}
    .grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }}
    .card {{ border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: var(--panel); }}
    .card b {{ display: block; font-size: 20px; margin-top: 4px; }}
    table {{ width: 100%; border-collapse: collapse; border: 1px solid var(--line); background: var(--panel); border-radius: 8px; overflow: hidden; }}
    th, td {{ padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }}
    th {{ color: var(--muted); font-size: 12px; text-transform: uppercase; background: var(--panel-2); }}
    tr:last-child td {{ border-bottom: 0; }}
    .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
    .pill {{ display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--panel-2); color: var(--muted); }}
    .risk-grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }}
    .kv {{ display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); }}
    .kv:last-child {{ border-bottom: 0; }}
    .failure {{ margin-bottom: 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); overflow: hidden; }}
    .failure-head {{ display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px; background: var(--panel-2); }}
    .failure-body {{ padding: 14px; }}
    pre {{ white-space: pre-wrap; overflow-wrap: anywhere; margin: 8px 0 14px; padding: 12px; border-radius: 6px; background: #080d19; color: #dfe8f8; }}
    code {{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }}
    footer {{ margin-top: 34px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--line); padding-top: 16px; }}
    @media (max-width: 760px) {{
      header {{ display: block; }}
      .score {{ margin-top: 18px; }}
      .grid, .risk-grid {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Agent Redteam Report</h1>
      <div class="muted">Model: {_e(target.get("model") or "unknown")} · Run: <code>{_e(report["run_id"])}</code></div>
      <div class="muted">Started: {_e(target.get("started_at") or "unknown")} · Finished: {_e(target.get("finished_at") or "unknown")}</div>
    </div>
    <div class="score {score_class}">
      <span class="muted">Overall Score</span>
      <strong>{_e(score["overall"])}</strong>
      <span class="muted">/ 100</span>
    </div>
  </header>

  <section class="grid">
    <div class="card"><span class="muted">Total Samples</span><b>{_e(score["total_samples"])}</b></div>
    <div class="card"><span class="muted">Passed</span><b>{_e(score["passed"])}</b></div>
    <div class="card"><span class="muted">Failed</span><b>{_e(score["failed"])}</b></div>
    <div class="card"><span class="muted">Errors</span><b>{_e(score["errors"])}</b></div>
  </section>

  <h2>Suite Breakdown</h2>
  <table>
    <thead><tr><th>Suite</th><th class="num">Score</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Errors</th><th class="num">Total</th></tr></thead>
    <tbody>{suite_rows}</tbody>
  </table>

  <h2>Risk Summary</h2>
  <section class="risk-grid">
    <div class="card"><h3>By Severity</h3>{severity_items}</div>
    <div class="card"><h3>By Suite</h3>{suite_items}</div>
    <div class="card"><h3>By OWASP</h3>{owasp_items}</div>
  </section>

  <h2>Failure Evidence</h2>
  {failure_blocks}

  <h2>Reproducibility</h2>
  <table>
    <tbody>
      <tr><th>Raw SHA-256</th><td><code>{_e(source["raw_sha256"])}</code></td></tr>
      <tr><th>Canonical SHA-256</th><td><code>{_e(source["canonical_sha256"])}</code></td></tr>
      <tr><th>JSON Extracted From Mixed Output</th><td>{_e(source["json_was_extracted"])}</td></tr>
      <tr><th>Generator</th><td>agent-redteam {_e(report["generator"]["version"])}</td></tr>
    </tbody>
  </table>

  <footer>
    Generated by Agent Redteam. Response snippets are redacted and truncated for publication.
  </footer>
</main>
</body>
</html>
"""


def render_report_markdown(report: dict[str, Any]) -> str:
    return render_attestation_markdown(report)


def _suite_row(suite: dict[str, Any]) -> str:
    return (
        "<tr>"
        f"<td>{_e(suite['name'])}</td>"
        f"<td class='num'>{_e(suite['score'])}</td>"
        f"<td class='num'>{_e(suite['passed'])}</td>"
        f"<td class='num'>{_e(suite['failed'])}</td>"
        f"<td class='num'>{_e(suite['errors'])}</td>"
        f"<td class='num'>{_e(suite['total'])}</td>"
        "</tr>"
    )


def _failure_block(item: dict[str, Any]) -> str:
    tags = ", ".join(item["tags"]) if item["tags"] else "none"
    return f"""
    <article class="failure">
      <div class="failure-head">
        <div><b>{_e(item['sample_id'])}</b> <span class="muted">— {_e(item['suite'])}</span></div>
        <div><span class="pill">{_e(item['severity'])}</span> <span class="pill">{_e(item['owasp'])}</span></div>
      </div>
      <div class="failure-body">
        <div class="muted">Category: {_e(item['category'])} · Tags: {_e(tags)}</div>
        <h3>Question</h3>
        <pre><code>{_e(item['question_snippet'])}</code></pre>
        <h3>Expected</h3>
        <pre><code>{_e(item['expected_snippet'])}</code></pre>
        <h3>Response</h3>
        <pre><code>{_e(item['response_snippet'])}</code></pre>
      </div>
    </article>
    """


def _kv_cards(values: dict[str, int]) -> str:
    if not values:
        return "<p class='muted'>No data</p>"
    return "\n".join(
        f"<div class='kv'><span>{_e(key)}</span><b>{_e(value)}</b></div>"
        for key, value in values.items()
    )


def _score_class(score: Any) -> str:
    try:
        value = float(score)
    except (TypeError, ValueError):
        return "bad"
    if value >= 80:
        return "good"
    if value >= 50:
        return "warn"
    return "bad"


def _e(value: Any) -> str:
    return html.escape(str(value), quote=True)
