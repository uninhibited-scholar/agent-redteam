/**
 * SuiteDetail — deep dive into a single attack suite.
 *
 * Reached from Overview (radar vertex click) or Metrics (suite bar click).
 * Shows: suite score donut, category breakdown, severity heatmap row,
 * sample list filtered to this suite (via /api/samples?suite=X), and
 * representative failed attacks.
 */
import { useState, useEffect, useMemo } from 'react'
import { theme } from '../theme'
import type { SampleResult, SamplesResponse, ScanReport, SuiteResult } from '../types'
import { Panel, SeverityBadge, MonoTag } from '../components/ui'
import { DonutChart, type DonutSegment } from '../components/DonutChart'
import { ColumnChart, type BarItem } from '../components/BarChart'
import { BarChart } from '../components/BarChart'
import { AttackPatterns } from '../components/AttackPatterns'

interface Props {
  suiteName: string
  report: ScanReport
  onBack: () => void
  onOpenSample: (sample: SampleResult) => void
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const

export function SuiteDetail({ suiteName, report, onBack, onOpenSample }: Props) {
  const [data, setData] = useState<SamplesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'fail' | 'pass'>('all')

  const suiteMeta: SuiteResult | undefined = report.suites.find(s => s.name === suiteName)
  const suiteSamples = useMemo(
    () => (report.samples || []).filter(s => s.suite === suiteName),
    [report, suiteName]
  )

  useEffect(() => {
    setLoading(true)
    fetch(`/api/samples?suite=${encodeURIComponent(suiteName)}&page_size=200`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: SamplesResponse) => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [suiteName])

  // Category breakdown within this suite
  const categories = useMemo(() => {
    const map = new Map<string, { pass: number; fail: number }>()
    for (const s of suiteSamples) {
      const e = map.get(s.category) || { pass: 0, fail: 0 }
      if (s.verdict === 'pass') e.pass++
      else if (s.verdict === 'fail') e.fail++
      map.set(s.category, e)
    }
    return Array.from(map.entries()).map(([cat, { pass, fail }]) => ({
      label: cat.replace(/_/g, ' '),
      value: (pass + fail) ? 100 * pass / (pass + fail) : 0,
      color: theme.primary,
      detail: `${cat}: 通过 ${pass} / 失败 ${fail}`,
    })).sort((a, b) => a.value - b.value)
  }, [suiteSamples])

  // Severity donut for failures in this suite
  const failSeverity: DonutSegment[] = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of suiteSamples) {
      if (s.verdict === 'fail') counts[s.severity] = (counts[s.severity] || 0) + 1
    }
    return SEVERITY_ORDER.filter(s => counts[s]).map(s => ({
      label: s, value: counts[s],
      color: theme.severity[s as keyof typeof theme.severity],
    }))
  }, [suiteSamples])

  const verdictSegs: DonutSegment[] = [
    { label: '通过', value: suiteSamples.filter(s => s.verdict === 'pass').length, color: theme.success },
    { label: '失败', value: suiteSamples.filter(s => s.verdict === 'fail').length, color: theme.danger },
    { label: '错误', value: suiteSamples.filter(s => s.verdict === 'error').length, color: theme.warning },
  ].filter(s => s.value > 0)

  // Representative failed attacks (highest severity first, up to 5)
  const topFails = useMemo(() => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 }
    return suiteSamples
      .filter(s => s.verdict === 'fail')
      .sort((a, b) => (rank[a.severity as keyof typeof rank] ?? 9) - (rank[b.severity as keyof typeof rank] ?? 9))
      .slice(0, 5)
  }, [suiteSamples])

  const owasp = suiteSamples[0]?.owasp || ''
  const score = suiteMeta?.score ?? 0

  const displayedSamples = (data?.items || suiteSamples).filter(s => {
    if (filter === 'fail') return s.verdict === 'fail'
    if (filter === 'pass') return s.verdict === 'pass'
    return true
  })

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>
      {/* Breadcrumb header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
          color: theme.textDim, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
        }}>
          ← 返回
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.text, textTransform: 'capitalize' }}>
          {suiteName.replace(/_/g, ' ')}
        </h2>
        {owasp && <MonoTag>{owasp}</MonoTag>}
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 24, fontWeight: 700, fontFamily: theme.monoFamily,
          color: score >= 80 ? theme.success : score >= 50 ? theme.warning : theme.danger,
        }}>
          {score.toFixed(1)}
        </span>
      </div>

      {/* Top row: donut + category + severity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 20 }}>
        <Panel title="判定概览" subtitle={`${suiteSamples.length} 个样本`}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}>
            <DonutChart
              segments={verdictSegs}
              size={150}
              centerValue={score.toFixed(0)}
              centerLabel="score"
            />
          </div>
        </Panel>

        <Panel title="失败严重性" subtitle="得手攻击的严重性分布">
          {failSeverity.length > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}>
              <DonutChart
                segments={failSeverity}
                size={150}
                centerValue={failSeverity.reduce((s, x) => s + x.value, 0)}
                centerLabel="失败"
              />
            </div>
          ) : (
            <div style={{ color: theme.textFaint, fontSize: 12, padding: 40, textAlign: 'center' }}>无失败样本</div>
          )}
        </Panel>

        <Panel title="类别防御率" subtitle="按攻击子类别">
          {categories.length > 0 ? (
            <ColumnChart items={categories as BarItem[]} suffix="%" height={150} />
          ) : (
            <div style={{ color: theme.textFaint, fontSize: 12, padding: 40, textAlign: 'center' }}>无类别数据</div>
          )}
        </Panel>
      </div>

      {/* Top failed attacks */}
      {topFails.length > 0 && (
        <div style={{ marginBottom: 20 }}>
        <Panel title="代表性失败攻击" subtitle="最高严重性的得手攻击">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topFails.map(s => (
              <div
                key={s.sample_id}
                onClick={() => onOpenSample(s)}
                style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12,
                  alignItems: 'center', padding: 12, borderRadius: theme.radiusSm,
                  background: theme.bg, border: `1px solid ${theme.border}`,
                  cursor: 'pointer', transition: theme.transition,
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = theme.danger + '60'}
                onMouseLeave={e => e.currentTarget.style.borderColor = theme.border}
              >
                <SeverityBadge severity={s.severity} />
                <div>
                  <div style={{ fontSize: 12, color: theme.text, fontFamily: theme.monoFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
                    {s.question}
                  </div>
                  <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 2 }}>{s.category.replace(/_/g, ' ')}</div>
                </div>
                <span style={{ fontSize: 11, color: theme.textFaint, fontFamily: theme.monoFamily }}>{s.sample_id}</span>
              </div>
            ))}
          </div>
        </Panel>
        </div>
      )}

      {/* Difficulty breakdown bar chart */}
      <div style={{ marginBottom: 20 }}>
        <Panel title="难度防御对比" subtitle="各难度级别的防御得分">
          <div style={{ marginTop: 12 }}>
            <DifficultyBars samples={suiteSamples} />
          </div>
        </Panel>
      </div>

      {/* Attack pattern analysis within this suite */}
      <div style={{ marginBottom: 20 }}>
        <Panel title="类别弱点画像" subtitle="该套件内各攻击类别的失败分布">
          <div style={{ marginTop: 12 }}>
            <AttackPatterns samples={suiteSamples} />
          </div>
        </Panel>
      </div>

      {/* All samples table */}
      <Panel
        title="全部样本"
        subtitle={`${displayedSamples.length} / ${suiteSamples.length}`}
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'fail', 'pass'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '4px 10px', fontSize: 11, textTransform: 'uppercase',
                background: filter === f ? theme.primary + '18' : 'transparent',
                border: `1px solid ${filter === f ? theme.primary : theme.border}`,
                borderRadius: theme.radiusSm,
                color: filter === f ? theme.primary : theme.textDim,
                cursor: 'pointer',
              }}>
                {f === 'fail' ? '失败' : f === 'pass' ? '通过' : '全部'}
              </button>
            ))}
          </div>
        }
      >
        {loading ? (
          <div style={{ color: theme.textFaint, fontSize: 12, padding: 20 }}>加载中…</div>
        ) : error ? (
          <div style={{ color: theme.danger, fontSize: 12, padding: 20 }}>{error}</div>
        ) : displayedSamples.length === 0 ? (
          <div style={{ color: theme.textFaint, fontSize: 12, padding: 20 }}>无匹配样本</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {displayedSamples.map((s, i) => (
              <div
                key={s.sample_id}
                onClick={() => onOpenSample(s)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto auto 1fr auto auto',
                  gap: 12, alignItems: 'center',
                  padding: '10px 8px',
                  borderBottom: i < displayedSamples.length - 1 ? `1px solid ${theme.border}` : 'none',
                  cursor: 'pointer', transition: theme.transition,
                }}
                onMouseEnter={e => e.currentTarget.style.background = theme.surfaceHover}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  color: s.verdict === 'fail' ? theme.danger : s.verdict === 'pass' ? theme.success : theme.warning,
                  minWidth: 40,
                }}>{s.verdict}</span>
                <SeverityBadge severity={s.severity} />
                <span style={{
                  fontSize: 12, color: theme.text, fontFamily: theme.monoFamily,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{s.question}</span>
                <span style={{ fontSize: 10, color: theme.textFaint }}>{s.category.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 10, color: theme.textFaint, fontFamily: theme.monoFamily }}>{s.sample_id}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

/** Horizontal bars showing defense score per difficulty tier. */
function DifficultyBars({ samples }: { samples: SampleResult[] }) {
  const items: BarItem[] = useMemo(() => {
    const tiers = new Map<string, { pass: number; fail: number }>()
    for (const s of samples) {
      const key = (s.difficulty || 'unknown').toLowerCase()
      const e = tiers.get(key) || { pass: 0, fail: 0 }
      if (s.verdict === 'pass') e.pass++
      else if (s.verdict === 'fail') e.fail++
      tiers.set(key, e)
    }
    return Array.from(tiers.entries()).map(([diff, { pass, fail }]) => {
      const judged = pass + fail
      const score = judged ? 100 * pass / judged : 0
      return {
        label: diff, value: score,
        color: score >= 80 ? theme.success : score >= 50 ? theme.warning : theme.danger,
        detail: `${diff}: 通过 ${pass} / 失败 ${fail}（${score.toFixed(0)}%）`,
      }
    }).sort((a, b) => b.value - a.value)
  }, [samples])

  if (items.length === 0) {
    return <div style={{ color: theme.textFaint, fontSize: 12, padding: 12 }}>无难度数据</div>
  }
  return <BarChart items={items} suffix="%" maxValue={100} />
}

