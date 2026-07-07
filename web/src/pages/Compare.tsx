/**
 * Compare — side-by-side comparison of two scans with per-suite deltas.
 *
 * Two layers:
 * 1. Suite-level deltas (radar overlay, diverging bars, ranked comparison, diff matrix)
 * 2. Sample-level diffs — for samples where the verdict FLIPPED between scans,
 *    click to open DiffViewer and see exactly why one model resisted and the other didn't.
 */
import { useState, useEffect, useMemo } from 'react'
import { theme } from '../theme'
import type { HistoryItem, CompareResult, SuiteComparison, ScanReport } from '../types'
import { BarChart, type BarItem } from '../components/BarChart'
import { DiffMatrix } from '../components/DiffMatrix'
import { SuiteRadarCompare } from '../components/SuiteRadar'
import { DiffViewer, type DiffSide } from '../components/DiffViewer'
import { SampleCompare } from '../components/SampleCompare'
import { ScoreBadge } from '../components/ScoreBadge'
import { ScanCompareSummary } from '../components/ScanCompareSummary'
import { Panel, SeverityBadge, MonoTag } from '../components/ui'

/** A sample whose verdict differs between scan A and scan B. */
interface SampleDiff {
  sample_id: string
  suite: string
  severity: string
  question: string
  sideA: DiffSide
  sideB: DiffSide
}

export function Compare() {
  const [scans, setScans] = useState<HistoryItem[]>([])
  const [runA, setRunA] = useState('')
  const [runB, setRunB] = useState('')
  const [result, setResult] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Full reports (with samples) for sample-level diffing
  const [reportA, setReportA] = useState<ScanReport | null>(null)
  const [reportB, setReportB] = useState<ScanReport | null>(null)
  // Selected sample diff to show in DiffViewer
  const [selectedDiff, setSelectedDiff] = useState<SampleDiff | null>(null)

  useEffect(() => {
    fetch('/api/history?limit=50')
      .then(r => r.json())
      .then(d => setScans(d.scans || []))
      .catch(() => {})
  }, [])

  const runCompare = async () => {
    if (!runA || !runB) { setError('Pick two scans to compare'); return }
    if (runA === runB) { setError('Pick two different scans'); return }
    setError(null); setLoading(true); setResult(null)
    setReportA(null); setReportB(null); setSelectedDiff(null)
    try {
      const resp = await fetch(`/api/compare?run_a=${encodeURIComponent(runA)}&run_b=${encodeURIComponent(runB)}`)
      const data = await resp.json()
      if (!resp.ok) { setError(data.error || 'Compare failed'); setLoading(false); return }
      setResult(data)
      // Fetch full reports in parallel for sample-level diffing
      const [ra, rb] = await Promise.all([
        fetch(`/api/report/${encodeURIComponent(runA)}`).then(r => r.json()) as Promise<ScanReport>,
        fetch(`/api/report/${encodeURIComponent(runB)}`).then(r => r.json()) as Promise<ScanReport>,
      ])
      setReportA(ra); setReportB(rb)
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  // Samples where the verdict flipped between A and B — these are the interesting diffs.
  const flippedSamples = useMemo<SampleDiff[]>(() => {
    if (!reportA?.samples || !reportB?.samples) return []
    const byIdB = new Map(reportB.samples.map(s => [s.sample_id, s]))
    const diffs: SampleDiff[] = []
    for (const sa of reportA.samples) {
      const sb = byIdB.get(sa.sample_id)
      if (!sb) continue
      if (sa.verdict !== sb.verdict) {
        diffs.push({
          sample_id: sa.sample_id,
          suite: sa.suite,
          severity: sa.severity,
          question: sa.question,
          sideA: { model: reportA.target_model, verdict: sa.verdict as DiffSide['verdict'], response: sa.response },
          sideB: { model: reportB.target_model, verdict: sb.verdict as DiffSide['verdict'], response: sb.response },
        })
      }
    }
    // Most severe regressions first: A pass → B fail ranks above A fail → B pass
    return diffs.sort((x, y) => {
      const score = (d: SampleDiff) => (d.sideA.verdict === 'pass' && d.sideB.verdict === 'fail' ? 0 : 1)
      return score(x) - score(y)
    })
  }, [reportA, reportB])

  return (
    <div style={{ maxWidth: 880 }}>
      {/* Selectors */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-end',
        marginBottom: 24, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={labelStyle}>Scan A (baseline)</label>
          <select value={runA} onChange={e => setRunA(e.target.value)} style={selectStyle}>
            <option value="">— select —</option>
            {scans.map(s => (
              <option key={s.run_id} value={s.run_id}>
                {s.target_model} · {s.overall_score.toFixed(1)} · {s.run_id}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={labelStyle}>Scan B (newer)</label>
          <select value={runB} onChange={e => setRunB(e.target.value)} style={selectStyle}>
            <option value="">— select —</option>
            {scans.map(s => (
              <option key={s.run_id} value={s.run_id}>
                {s.target_model} · {s.overall_score.toFixed(1)} · {s.run_id}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={runCompare}
          disabled={loading}
          style={{
            padding: '10px 24px',
            background: theme.primary, color: theme.bg,
            border: 'none', borderRadius: theme.radius,
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Comparing...' : '⇄ Compare'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', marginBottom: 20,
          background: theme.danger + '15', border: `1px solid ${theme.danger}40`,
          borderRadius: theme.radius, fontSize: 13, color: theme.danger,
        }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Overall score card */}
          <div style={{
            display: 'flex', gap: 16, marginBottom: 24,
            flexWrap: 'wrap',
          }}>
            <ScoreCard label="A" model={result.model_a} score={result.score_a} />
            <DeltaCard delta={result.score_delta} />
            <ScoreCard label="B" model={result.model_b} score={result.score_b} />
          </div>

          {/* Executive decision card — one-glance "which to pick" */}
          {reportA?.suites && reportB?.suites && (
            <div style={{ marginBottom: 24 }}>
              <ScanCompareSummary
                scanA={{
                  label: '基线 A', model: result.model_a,
                  overallScore: result.score_a,
                  suites: reportA.suites, totalSamples: reportA.total_samples,
                }}
                scanB={{
                  label: '对比 B', model: result.model_b,
                  overallScore: result.score_b,
                  suites: reportB.suites, totalSamples: reportB.total_samples,
                }}
              />
            </div>
          )}

          {/* Overlaid radar comparison */}
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
            <Panel title="套件雷达叠加" subtitle="两个扫描的安全覆盖面对比（虚线=基线 A，实线=当前 B）" padding={24}>
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                <SuiteRadarCompare
                  suitesA={result.suites.map(s => ({ name: s.suite, score: s.score_a }))}
                  suitesB={result.suites.map(s => ({ name: s.suite, score: s.score_b }))}
                  labelA={result.model_a}
                  labelB={result.model_b}
                  size={300}
                />
              </div>
            </Panel>
          </div>

          {/* Per-suite deltas */}
          <div style={{
            background: theme.surface,
            borderRadius: theme.radius,
            border: `1px solid ${theme.border}`,
            padding: 24,
          }}>
            <h2 style={{
              fontSize: 14, fontWeight: 600, color: theme.primary,
              marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1,
            }}>
              Suite Deltas
            </h2>
            {result.suites.map(s => (
              <DeltaBar key={s.suite} suite={s} />
            ))}
          </div>

          {/* Ranked comparison bars (B vs A reference) */}
          <RankedComparison suites={result.suites} />

          {/* Diff matrix — precise per-suite delta table */}
          <div style={{ marginTop: 20 }}>
            <Panel title="差值矩阵" subtitle="每个套件的精确分数变化（绿=改善，红=退化）" padding={24}>
              <div style={{ marginTop: 12 }}>
                <DiffMatrix
                  headerA={result.model_a}
                  headerB={result.model_b}
                  rows={result.suites.map(s => ({ label: s.suite, a: s.score_a, b: s.score_b }))}
                />
              </div>
            </Panel>
          </div>

          {/* Sample-level verdict flips — the "why" behind the deltas */}
          {flippedSamples.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <Panel
                title="判定翻转样本"
                subtitle={`${flippedSamples.length} 个样本在两次扫描间判定不同 — 点击查看响应差异`}
                padding={24}
              >
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {flippedSamples.slice(0, 20).map(d => {
                    const regressed = d.sideA.verdict === 'pass' && d.sideB.verdict === 'fail'
                    return (
                      <button
                        key={d.sample_id}
                        onClick={() => setSelectedDiff(d)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', textAlign: 'left',
                          background: theme.bg,
                          border: `1px solid ${regressed ? theme.danger + '40' : theme.success + '40'}`,
                          borderRadius: theme.radiusSm, cursor: 'pointer',
                          transition: theme.transition, fontFamily: theme.fontFamily,
                        }}
                      >
                        <SeverityBadge severity={d.severity} />
                        <MonoTag tone="dim">{d.sample_id}</MonoTag>
                        <span style={{
                          fontSize: 12, color: theme.textDim, flex: 1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {d.question}
                        </span>
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, fontWeight: 700 }}>
                          <VerdictTag verdict={d.sideA.verdict} />
                          <span style={{ color: theme.textFaint }}>→</span>
                          <VerdictTag verdict={d.sideB.verdict} />
                        </span>
                        {regressed && (
                          <span style={{ fontSize: 10, color: theme.danger, fontWeight: 700 }}>退化</span>
                        )}
                      </button>
                    )
                  })}
                  {flippedSamples.length > 20 && (
                    <span style={{ fontSize: 11, color: theme.textFaint, textAlign: 'center', padding: 8 }}>
                      + {flippedSamples.length - 20} 更多翻转样本
                    </span>
                  )}
                </div>
              </Panel>
            </div>
          )}

          {/* DiffViewer modal for the selected flipped sample */}
          {selectedDiff && (
            <div
              onClick={() => setSelectedDiff(null)}
              style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(4,7,14,0.7)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                padding: 40, overflowY: 'auto',
                animation: 'fadeIn 150ms ease',
              }}
            >
              <div onClick={e => e.stopPropagation()} style={{ maxWidth: 1100, width: '100%' }}>
                <DiffViewer
                  sampleId={selectedDiff.sample_id}
                  question={selectedDiff.question}
                  sideA={selectedDiff.sideA}
                  sideB={selectedDiff.sideB}
                  onClose={() => setSelectedDiff(null)}
                />
              </div>
            </div>
          )}

          {/* Same-model variance view — when comparing two runs of the same model,
              show the SampleCompare stability analysis (sampling-variance flips). */}
          {result.model_a === result.model_b && reportA?.samples && reportB?.samples && (
            <div style={{ marginTop: 20 }}>
              <SampleCompare
                runA={reportA.samples}
                runB={reportB.samples}
                modelLabel={`${result.model_a} · 两次运行稳定性分析`}
                onSelectSample={() => {}}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ScoreCard({ label, model, score }: { label: string; model: string; score: number }) {
  return (
    <div style={{
      flex: 1, minWidth: 180,
      background: theme.surface, border: `1px solid ${theme.border}`,
      borderRadius: theme.radius, padding: 20,
    }}>
      <div style={{
        fontSize: 11, color: theme.textFaint,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
      }}>
        Scan {label}
      </div>
      <div style={{
        fontFamily: theme.monoFamily, fontSize: 14, color: theme.textDim,
        marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {model}
      </div>
      <ScoreBadge score={score} size="lg" showVerdict />
    </div>
  )
}

function DeltaCard({ delta }: { delta: number }) {
  const positive = delta > 0
  const neutral = delta === 0
  const color = neutral ? theme.textDim : positive ? theme.success : theme.danger
  return (
    <div style={{
      flex: 1, minWidth: 140,
      background: color + '12', border: `1px solid ${color}40`,
      borderRadius: theme.radius, padding: 20,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    }}>
      <div style={{
        fontSize: 11, color: theme.textFaint,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
      }}>
        Delta
      </div>
      <div style={{
        fontFamily: theme.monoFamily, fontSize: 36, fontWeight: 700, color,
      }}>
        {neutral ? '→' : positive ? '↑' : '↓'} {delta > 0 ? '+' : ''}{delta.toFixed(1)}
      </div>
      <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4 }}>
        {neutral ? 'no change' : positive ? 'improved' : 'regressed'}
      </div>
    </div>
  )
}

function DeltaBar({ suite }: { suite: SuiteComparison }) {
  const d = suite.delta
  const color = d === 0 ? theme.textDim : d > 0 ? theme.success : theme.danger
  // bar width relative to max 100; centre at 0, positive right, negative left
  const widthPct = Math.min(100, Math.abs(d))
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
          {suite.suite.replace(/_/g, ' ')}
        </span>
        <span style={{ fontFamily: theme.monoFamily, fontSize: 13, fontWeight: 700, color }}>
          {suite.score_a.toFixed(1)} → {suite.score_b.toFixed(1)}{'  '}
          ({d > 0 ? '+' : ''}{d.toFixed(1)})
        </span>
      </div>
      {/* diverging bar */}
      <div style={{
        position: 'relative', height: 8,
        background: theme.bg, borderRadius: 4,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
      }}>
        {/* centre line */}
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1,
          background: theme.borderActive,
        }} />
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          ...(d >= 0
            ? { left: '50%', width: `${widthPct / 2}%` }
            : { right: '50%', width: `${widthPct / 2}%` }),
          background: color, borderRadius: 4,
          transition: 'width 600ms ease',
        }} />
      </div>
    </div>
  )
}

/** Side-by-side ranked bars showing scan B score with scan A as faded reference. */
function RankedComparison({ suites }: { suites: SuiteComparison[] }) {
  const items: BarItem[] = useMemo(() =>
    suites
      .map(s => ({
        label: s.suite.replace(/_/g, ' '),
        value: s.score_b,
        reference: s.score_a,
        color: s.score_b >= 80 ? theme.success : s.score_b >= 50 ? theme.warning : theme.danger,
        detail: `${s.suite}: A=${s.score_a.toFixed(1)} → B=${s.score_b.toFixed(1)} (Δ${s.delta > 0 ? '+' : ''}${s.delta.toFixed(1)})`,
      }))
      .sort((a, b) => b.value - a.value)
  , [suites])

  const improved = suites.filter(s => s.delta > 0).length
  const regressed = suites.filter(s => s.delta < 0).length
  const unchanged = suites.filter(s => s.delta === 0).length

  return (
    <div style={{ marginTop: 20 }}>
      <Panel
        title="排名对比"
        subtitle="Scan B 分数（实色）vs Scan A 基线（淡色），按 B 降序"
        action={
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            <span style={{ color: theme.success }}>↑ {improved} 改善</span>
            <span style={{ color: theme.danger }}>↓ {regressed} 退化</span>
            <span style={{ color: theme.textFaint }}>→ {unchanged} 持平</span>
          </div>
        }
        padding={24}
      >
        <div style={{ marginTop: 12 }}>
          <BarChart items={items} suffix="" maxValue={100} />
        </div>
      </Panel>
    </div>
  )
}

/** Compact verdict tag used in the flipped-sample list. */
function VerdictTag({ verdict }: { verdict: DiffSide['verdict'] }) {
  const color = verdict === 'pass' ? theme.success : verdict === 'fail' ? theme.danger : theme.warning
  return (
    <span style={{
      padding: '2px 6px', borderRadius: theme.radiusSm,
      color, background: color + '18', textTransform: 'uppercase',
      fontFamily: theme.monoFamily,
    }}>
      {verdict}
    </span>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: theme.textDim,
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
}
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: theme.bg, border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm, color: theme.text,
  fontSize: 12, fontFamily: theme.monoFamily,
  cursor: 'pointer',
}
