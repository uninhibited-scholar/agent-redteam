/**
 * ScanDiffExporter — compares two scans and exports the delta (regressions /
 * improvements / flips) as a shareable Markdown report or JSON. For teams:
 * "model upgraded v1.2 → v1.3, what changed in its safety posture" — one click.
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel, SeverityBadge, MonoTag } from './ui'
import type { SampleResult } from '../types'

interface ScanDiffExporterProps {
  baselineLabel: string
  currentLabel: string
  baseline: SampleResult[]
  current: SampleResult[]
}

// ===== Diff computation (local, decoupled from RegressionWatch) =====

interface SampleDiff {
  sample_id: string
  suite: string
  severity: string
  owasp: string
  question: string
  from: SampleResult['verdict']
  to: SampleResult['verdict']
}

interface SuiteDelta {
  suite: string
  baselineScore: number
  currentScore: number
  delta: number
}

interface DiffResult {
  regressions: SampleDiff[]
  improvements: SampleDiff[]
  stable: number
  matched: number
  suites: SuiteDelta[]
  baselineScore: number
  currentScore: number
}

function suiteScores(samples: SampleResult[]): Map<string, { total: number; passed: number }> {
  const m = new Map<string, { total: number; passed: number }>()
  for (const s of samples) {
    const e = m.get(s.suite) || { total: 0, passed: 0 }
    e.total++
    if (s.verdict === 'pass') e.passed++
    m.set(s.suite, e)
  }
  return m
}

function overallScore(samples: SampleResult[]): number {
  if (samples.length === 0) return 0
  const passed = samples.filter(s => s.verdict === 'pass').length
  return Math.round((passed / samples.length) * 100)
}

function computeDiff(baseline: SampleResult[], current: SampleResult[]): DiffResult {
  const curById = new Map(current.map(s => [s.sample_id, s]))
  const regressions: SampleDiff[] = []
  const improvements: SampleDiff[] = []
  let stable = 0
  let matched = 0

  for (const b of baseline) {
    const c = curById.get(b.sample_id)
    if (!c) continue
    matched++
    if (b.verdict === c.verdict) {
      stable++
      continue
    }
    const entry: SampleDiff = {
      sample_id: c.sample_id, suite: c.suite, severity: c.severity,
      owasp: c.owasp, question: c.question, from: b.verdict, to: c.verdict,
    }
    if (b.verdict === 'pass' && c.verdict === 'fail') regressions.push(entry)
    else if (b.verdict === 'fail' && c.verdict === 'pass') improvements.push(entry)
  }

  const baseScores = suiteScores(baseline)
  const curScores = suiteScores(current)
  const suiteNames = [...new Set([...baseScores.keys(), ...curScores.keys()])].sort()
  const suites: SuiteDelta[] = suiteNames.map(name => {
    const b = baseScores.get(name)
    const c = curScores.get(name)
    const bScore = b ? Math.round((b.passed / b.total) * 100) : 0
    const cScore = c ? Math.round((c.passed / c.total) * 100) : 0
    return { suite: name, baselineScore: bScore, currentScore: cScore, delta: cScore - bScore }
  })

  return {
    regressions, improvements, stable, matched, suites,
    baselineScore: overallScore(baseline), currentScore: overallScore(current),
  }
}

// ===== Export generators (pure) =====

export function diffToMarkdown(
  baselineLabel: string, currentLabel: string,
  baseline: SampleResult[], current: SampleResult[],
): string {
  const d = computeDiff(baseline, current)
  const lines: string[] = []
  lines.push(`# 扫描差异报告：${baselineLabel} → ${currentLabel}`)
  lines.push('')
  lines.push('> 由 agent-redteam 自动生成')
  lines.push('')
  lines.push('## 摘要')
  if (d.matched === 0) {
    lines.push('- 两次扫描无共同样本')
  } else if (d.regressions.length === 0 && d.improvements.length === 0) {
    lines.push('- 两次扫描表现一致（无变化）')
  }
  lines.push(`- 回归（pass→fail）：${d.regressions.length} 个`)
  lines.push(`- 改善（fail→pass）：${d.improvements.length} 个`)
  lines.push(`- 稳定一致：${d.stable} 个`)
  lines.push(`- 总分变化：${d.baselineScore} → ${d.currentScore}（${fmtDelta(d.currentScore - d.baselineScore)}）`)
  lines.push('')

  lines.push('## 套件级变化')
  lines.push(`| 套件 | ${baselineLabel} | ${currentLabel} | 变化 |`)
  lines.push('|------|-----------------|---------------|------|')
  for (const s of d.suites) {
    const mark = s.delta > 0 ? '↑' : s.delta < 0 ? '⚠' : '='
    lines.push(`| ${s.suite} | ${s.baselineScore} | ${s.currentScore} | ${fmtDelta(s.delta)} ${mark} |`)
  }
  lines.push('')

  lines.push('## 回归样本（需关注）')
  if (d.regressions.length === 0) {
    lines.push('无')
  } else {
    lines.push('| ID | 套件 | 严重度 | 问题 |')
    lines.push('|----|------|--------|------|')
    for (const r of d.regressions) {
      lines.push(`| ${r.sample_id} | ${r.suite} | ${r.severity} | ${escapeCell(r.question)} |`)
    }
  }
  lines.push('')

  lines.push('## 改善样本')
  if (d.improvements.length === 0) {
    lines.push('无')
  } else {
    lines.push('| ID | 套件 | 严重度 | 问题 |')
    lines.push('|----|------|--------|------|')
    for (const im of d.improvements) {
      lines.push(`| ${im.sample_id} | ${im.suite} | ${im.severity} | ${escapeCell(im.question)} |`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

export function diffToJson(
  baselineLabel: string, currentLabel: string,
  baseline: SampleResult[], current: SampleResult[],
): string {
  const d = computeDiff(baseline, current)
  return JSON.stringify({
    baselineLabel,
    currentLabel,
    summary: {
      regressions: d.regressions.length,
      improvements: d.improvements.length,
      stable: d.stable,
      matched: d.matched,
      baselineScore: d.baselineScore,
      currentScore: d.currentScore,
      scoreDelta: d.currentScore - d.baselineScore,
    },
    suites: d.suites,
    regressions: d.regressions,
    improvements: d.improvements,
  }, null, 2)
}

function fmtDelta(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120)
}

// ===== Component =====

export function ScanDiffExporter({ baselineLabel, currentLabel, baseline, current }: ScanDiffExporterProps) {
  const [feedback, setFeedback] = useState<'md' | 'json' | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const diff = useMemo(() => computeDiff(baseline, current), [baseline, current])
  const previewText = useMemo(
    () => diffToMarkdown(baselineLabel, currentLabel, baseline, current).split('\n').slice(0, 30).join('\n'),
    [baselineLabel, currentLabel, baseline, current],
  )
  const scoreDelta = diff.currentScore - diff.baselineScore

  const empty = baseline.length === 0 || current.length === 0
  const noMatch = !empty && diff.matched === 0

  function flash(which: 'md' | 'json') {
    setFeedback(which)
    setTimeout(() => setFeedback(null), 2000)
  }

  function download(kind: 'md' | 'json') {
    const content = kind === 'md'
      ? diffToMarkdown(baselineLabel, currentLabel, baseline, current)
      : diffToJson(baselineLabel, currentLabel, baseline, current)
    const type = kind === 'md' ? 'text/markdown' : 'application/json'
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scan-diff-${baselineLabel}-to-${currentLabel}.${kind}`
    a.click()
    URL.revokeObjectURL(url)
    flash(kind)
  }

  const subtitle = `${baselineLabel} → ${currentLabel}`

  if (empty) {
    return (
      <Panel title="扫描差异导出" subtitle={subtitle}>
        <div style={emptyStyle}>需要两次扫描</div>
      </Panel>
    )
  }
  if (noMatch) {
    return (
      <Panel title="扫描差异导出" subtitle={subtitle}>
        <div style={emptyStyle}>两次扫描无共同样本</div>
      </Panel>
    )
  }

  const noChange = diff.regressions.length === 0 && diff.improvements.length === 0

  return (
    <Panel title="扫描差异导出" subtitle={subtitle}>
      {/* Region 1: summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <SummaryCard label="回归 (pass→fail)" value={diff.regressions.length} tone={theme.danger} />
        <SummaryCard label="改善 (fail→pass)" value={diff.improvements.length} tone={theme.success} />
        <SummaryCard label="稳定一致" value={diff.stable} tone={theme.textDim} />
        <SummaryCard
          label="总分变化"
          value={fmtDelta(scoreDelta)}
          tone={scoreDelta > 0 ? theme.success : scoreDelta < 0 ? theme.danger : theme.textDim}
        />
      </div>

      {noChange && (
        <div style={{ fontSize: 12, color: theme.textFaint, marginBottom: 12 }}>两次扫描表现一致</div>
      )}

      {/* Region 2: suite-level change table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
        {diff.suites.map(s => {
          const border = s.delta > 0 ? theme.success : s.delta < 0 ? theme.danger : theme.border
          const deltaColor = s.delta > 0 ? theme.success : s.delta < 0 ? theme.danger : theme.textFaint
          return (
            <div key={s.suite} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', background: theme.bg,
              borderRadius: theme.radiusSm, borderLeft: `3px solid ${border}`,
            }}>
              <span style={{ fontSize: 12, color: theme.text, flex: 1 }}>{s.suite.replace(/_/g, ' ')}</span>
              <span style={{ fontFamily: theme.monoFamily, fontSize: 12, color: theme.textDim }}>
                {s.baselineScore} → {s.currentScore}
              </span>
              <span style={{ fontFamily: theme.monoFamily, fontSize: 12, fontWeight: 700, color: deltaColor, width: 44, textAlign: 'right' }}>
                {s.delta > 0 ? '↑' : s.delta < 0 ? '↓' : '='} {fmtDelta(s.delta)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Region 3: export buttons */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <ExportButton
          label={feedback === 'md' ? '已下载 ✓' : '导出 Markdown'}
          done={feedback === 'md'}
          onClick={() => download('md')}
        />
        <ExportButton
          label={feedback === 'json' ? '已下载 ✓' : '导出 JSON'}
          done={feedback === 'json'}
          onClick={() => download('json')}
        />
      </div>

      {/* Region 4: collapsible preview */}
      <button
        onClick={() => setShowPreview(v => !v)}
        style={{
          background: 'none', border: 'none', color: theme.primary,
          fontSize: 12, cursor: 'pointer', padding: '4px 0', fontFamily: theme.fontFamily,
        }}
      >
        {showPreview ? '▾ 隐藏预览' : '▸ 预览 Markdown（前 30 行）'}
      </button>
      {showPreview && (
        <pre style={{
          marginTop: 8, padding: 14, background: theme.bg,
          border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
          color: theme.textDim, fontFamily: theme.monoFamily, fontSize: 11,
          lineHeight: 1.6, overflowX: 'auto', maxHeight: 320, whiteSpace: 'pre',
        }}>
          {previewText}
        </pre>
      )}

      {/* Regression detail badges (context for the reader) */}
      {diff.regressions.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 6 }}>回归样本严重度：</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {diff.regressions.slice(0, 12).map(r => (
              <span key={r.sample_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <MonoTag tone="dim">{r.sample_id}</MonoTag>
                <SeverityBadge severity={r.severity} />
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

// ===== Local presentational bits =====

const emptyStyle: React.CSSProperties = {
  padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12,
}

function SummaryCard({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div style={{
      padding: '12px 14px', background: tone + '12',
      border: `1px solid ${tone}30`, borderRadius: theme.radius,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: tone, fontFamily: theme.monoFamily }}>{value}</div>
      <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function ExportButton({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '12px 16px',
        background: done ? theme.success + '18' : theme.primary + '15',
        border: `1px solid ${done ? theme.success : theme.primary}`,
        borderRadius: theme.radius,
        color: done ? theme.success : theme.primary,
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
        transition: theme.transition, fontFamily: theme.fontFamily,
      }}
    >
      {label}
    </button>
  )
}
