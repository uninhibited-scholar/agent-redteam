/**
 * Metrics — deep analytics across the current report.
 *
 * Pulls /api/report + /api/samples (first page for facets) and renders:
 *   - Verdict donut (pass/fail/error) with drill
 *   - Severity distribution donut
 *   - Suite ranking bar chart (by score, descending)
 *   - Difficulty breakdown (how well the model defends at each difficulty tier)
 *   - OWASP coverage matrix (LLM01–LLM10 × verdict)
 *   - Tag frequency analysis
 *
 * This is the "analyst view" — every chart is interactive and drills to Findings.
 */
import { useMemo } from 'react'
import { theme } from '../theme'
import type { ScanReport } from '../types'
import { Panel, MonoTag } from '../components/ui'
import { AttackPatterns } from '../components/AttackPatterns'
import { DonutChart, DonutLegend, type DonutSegment } from '../components/DonutChart'
import { BarChart, ColumnChart, type BarItem } from '../components/BarChart'
import { useNotification } from '../components/NotificationToast'

interface Props {
  report: ScanReport
  onDrill: (suite?: string, severity?: string, verdict?: string) => void
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const
const DIFFICULTY_ORDER = ['basic', 'easy', 'intermediate', 'medium', 'advanced', 'hard'] as const

export function Metrics({ report, onDrill }: Props) {
  const { notify } = useNotification()
  const samples = report.samples || []

  // --- Derive analytics from samples ---
  const verdictSegments: DonutSegment[] = useMemo(() => {
    const counts = { pass: 0, fail: 0, error: 0, skip: 0 }
    for (const s of samples) {
      if (s.verdict in counts) counts[s.verdict as keyof typeof counts]++
    }
    return [
      { label: '通过', value: counts.pass, color: theme.success, detail: `模型成功防御 ${counts.pass} 次` },
      { label: '失败', value: counts.fail, color: theme.danger, detail: `攻击成功 ${counts.fail} 次` },
      { label: '错误', value: counts.error, color: theme.warning, detail: `API 错误 ${counts.error} 次（不计分）` },
    ].filter(s => s.value > 0)
  }, [samples])

  const severitySegments: DonutSegment[] = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of samples) {
      if (s.verdict === 'fail') {
        counts[s.severity] = (counts[s.severity] || 0) + 1
      }
    }
    return SEVERITY_ORDER
      .filter(sev => counts[sev])
      .map(sev => ({
        label: sev, value: counts[sev],
        color: theme.severity[sev as keyof typeof theme.severity],
        detail: `${counts[sev]} 个 ${sev} 级攻击得手`,
      }))
  }, [samples])

  const suiteRanking: BarItem[] = useMemo(() => {
    const map = new Map<string, { pass: number; fail: number }>()
    for (const s of samples) {
      const e = map.get(s.suite) || { pass: 0, fail: 0 }
      if (s.verdict === 'pass') e.pass++
      else if (s.verdict === 'fail') e.fail++
      map.set(s.suite, e)
    }
    return Array.from(map.entries()).map(([name, { pass, fail }]) => {
      const judged = pass + fail
      const score = judged ? (100 * pass / judged) : 0
      return {
        label: name.replace(/_/g, ' '),
        value: score,
        color: score >= 80 ? theme.success : score >= 50 ? theme.warning : theme.danger,
        detail: `${name}: 通过 ${pass} / 失败 ${fail}（${score.toFixed(1)}%）`,
        onClick: () => { onDrill(name); notify(`筛选套件：${name.replace(/_/g, ' ')}`, 'info') },
      }
    }).sort((a, b) => a.value - b.value)
  }, [samples, onDrill, notify])

  const difficultyBreakdown = useMemo(() => {
    const tiers: Record<string, { pass: number; fail: number }> = {}
    for (const s of samples) {
      const key = (s.difficulty || 'unknown').toLowerCase()
      if (!tiers[key]) tiers[key] = { pass: 0, fail: 0 }
      if (s.verdict === 'pass') tiers[key].pass++
      else if (s.verdict === 'fail') tiers[key].fail++
    }
    return DIFFICULTY_ORDER
      .filter(d => tiers[d])
      .map(d => {
        const { pass, fail } = tiers[d]
        const judged = pass + fail
        return {
          label: d, value: judged ? (100 * pass / judged) : 0,
          color: theme.primary,
          detail: `${d}: 通过 ${pass} / 失败 ${fail}`,
          onClick: undefined,
        }
      })
  }, [samples])

  // OWASP coverage: which LL0x codes appear and their pass rate
  const owaspCoverage = useMemo(() => {
    const map = new Map<string, { pass: number; fail: number; suites: Set<string> }>()
    for (const s of samples) {
      if (!s.owasp) continue
      const e = map.get(s.owasp) || { pass: 0, fail: 0, suites: new Set<string>() }
      if (s.verdict === 'pass') e.pass++
      else if (s.verdict === 'fail') e.fail++
      e.suites.add(s.suite)
      map.set(s.owasp, e)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, { pass, fail, suites }]) => ({
        code, pass, fail, suites: Array.from(suites),
        score: (pass + fail) ? (100 * pass / (pass + fail)) : 0,
      }))
  }, [samples])

  // Top attack tags
  const tagFrequency = useMemo(() => {
    const counts: Record<string, { total: number; fail: number }> = {}
    for (const s of samples) {
      for (const t of s.tags || []) {
        if (!counts[t]) counts[t] = { total: 0, fail: 0 }
        counts[t].total++
        if (s.verdict === 'fail') counts[t].fail++
      }
    }
    return Object.entries(counts)
      .map(([tag, { total, fail }]) => ({ tag, total, fail, failRate: total ? fail / total : 0 }))
      .sort((a, b) => b.fail - a.fail)
      .slice(0, 10)
  }, [samples])

  const drillVerdict = (v: string) => { onDrill(undefined, undefined, v); notify(`筛选：${v}`, 'info') }
  const drillSeverity = (sev: string) => { onDrill(undefined, sev); notify(`筛选：${sev}`, 'info') }

  if (samples.length === 0) {
    return (
      <Panel title="Metrics" subtitle="需要已加载的报告数据">
        <div style={{ color: theme.textFaint, fontSize: 13, padding: 40, textAlign: 'center' }}>
          当前没有报告数据。请先完成一次扫描。
        </div>
      </Panel>
    )
  }

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>
      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Kpi label="总分" value={report.overall_score ?? 0} suffix="" color={kpiColor(report.overall_score ?? 0)} />
        <Kpi label="攻击成功率" value={samples.length ? (100 * samples.filter(s => s.verdict === 'fail').length / samples.length) : 0} suffix="%" color={theme.danger} />
        <Kpi label="防御率" value={samples.length ? (100 * samples.filter(s => s.verdict === 'pass').length / samples.length) : 0} suffix="%" color={theme.success} />
        <Kpi label="套件数" value={report.suites.length} suffix="" color={theme.primary} />
        <Kpi label="最薄弱套件" value={suiteRanking[0]?.label.split(' ')[0] || '—'} suffix="" color={theme.warning} small />
      </div>

      {/* Row 1: verdict donut + severity donut */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 }}>
        <Panel title="判定分布" subtitle="通过 / 失败 / 错误">
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <DonutChart
              segments={verdictSegments}
              size={160}
              centerValue={samples.length}
              centerLabel="样本"
              onSegmentClick={seg => drillVerdict(seg.label === '通过' ? 'pass' : seg.label === '失败' ? 'fail' : 'error')}
            />
            <div style={{ flex: 1 }}>
              <DonutLegend segments={verdictSegments} onSelect={seg => drillVerdict(seg.label === '通过' ? 'pass' : seg.label === '失败' ? 'fail' : 'error')} />
            </div>
          </div>
        </Panel>

        <Panel title="严重性分布" subtitle="失败样本按严重性">
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {severitySegments.length > 0 ? (
              <>
                <DonutChart
                  segments={severitySegments}
                  size={160}
                  centerValue={severitySegments.reduce((s, x) => s + x.value, 0)}
                  centerLabel="失败"
                  onSegmentClick={seg => drillSeverity(seg.label)}
                />
                <div style={{ flex: 1 }}>
                  <DonutLegend segments={severitySegments} onSelect={seg => drillSeverity(seg.label)} />
                </div>
              </>
            ) : (
              <div style={{ color: theme.textFaint, fontSize: 12, padding: 20 }}>无失败样本 🎉</div>
            )}
          </div>
        </Panel>
      </div>

      {/* Row 2: suite ranking + difficulty */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 20 }}>
        <Panel title="套件排名" subtitle="点击下钻到 Findings">
          <BarChart items={suiteRanking} suffix="%" maxValue={100} />
        </Panel>

        <Panel title="难度分层防御率" subtitle="按攻击难度统计">
          {difficultyBreakdown.length > 0 ? (
            <ColumnChart items={difficultyBreakdown} suffix="%" height={180} />
          ) : (
            <div style={{ color: theme.textFaint, fontSize: 12, padding: 20 }}>无难度数据</div>
          )}
        </Panel>
      </div>

      {/* Row 3: OWASP coverage */}
      <Panel title="OWASP LLM Top 10 覆盖" subtitle="每个 OWASP 类别的防御表现">
        {owaspCoverage.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {owaspCoverage.map(o => (
              <div
                key={o.code}
                style={{
                  padding: 12, borderRadius: theme.radius,
                  background: theme.bg, border: `1px solid ${theme.border}`,
                  cursor: 'pointer', transition: theme.transition,
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = theme.borderActive}
                onMouseLeave={e => e.currentTarget.style.borderColor = theme.border}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <MonoTag>{o.code}</MonoTag>
                  <span style={{
                    fontSize: 16, fontWeight: 700, fontFamily: theme.monoFamily,
                    color: o.score >= 80 ? theme.success : o.score >= 50 ? theme.warning : theme.danger,
                  }}>
                    {o.score.toFixed(0)}
                  </span>
                </div>
                {/* Mini bar */}
                <div style={{ height: 4, background: theme.surface, borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{
                    height: '100%', width: `${o.score}%`,
                    background: o.score >= 80 ? theme.success : o.score >= 50 ? theme.warning : theme.danger,
                  }} />
                </div>
                <div style={{ fontSize: 10, color: theme.textFaint, lineHeight: 1.5 }}>
                  {o.suites.map(s => s.replace(/_/g, ' ')).join(', ')}
                </div>
                <div style={{ fontSize: 10, marginTop: 4 }}>
                  <span style={{ color: theme.success }}>{o.pass}</span>
                  <span style={{ color: theme.textFaint }}> / </span>
                  <span style={{ color: theme.danger }}>{o.fail}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: theme.textFaint, fontSize: 12, padding: 20 }}>样本未标记 OWASP 编号</div>
        )}
      </Panel>

      {/* Attack patterns — weakness profile by category */}
      <div style={{ marginBottom: 20 }}>
        <Panel title="攻击模式分析" subtitle="模型最脆弱的攻击类别（按失败数 + 失败率排序）">
          <div style={{ marginTop: 12 }}>
            <AttackPatterns samples={samples} onCategoryClick={() => notify('请在 Findings 页按类别筛选', 'info')} />
          </div>
        </Panel>
      </div>

      {/* Row 4: tag frequency */}
      {tagFrequency.length > 0 && (
        <Panel title="高频攻击标签" subtitle="最常得手的攻击类型（按失败数排序）">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tagFrequency.map(t => (
              <div key={t.tag} style={{
                display: 'grid', gridTemplateColumns: '1fr 60px 80px 60px',
                alignItems: 'center', gap: 10, padding: '6px 0',
                borderBottom: `1px solid ${theme.border}`,
              }}>
                <span style={{ fontSize: 12, color: theme.text }}>{t.tag}</span>
                <span style={{ fontSize: 11, color: theme.textFaint, textAlign: 'right' }}>{t.total} 总</span>
                <div style={{ position: 'relative', height: 6, background: theme.bg, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${t.failRate * 100}%`,
                    background: t.failRate > 0.5 ? theme.danger : t.failRate > 0.25 ? theme.warning : theme.success,
                  }} />
                </div>
                <span style={{
                  fontSize: 11, fontFamily: theme.monoFamily, textAlign: 'right',
                  color: t.failRate > 0.5 ? theme.danger : theme.textDim,
                }}>
                  {(t.failRate * 100).toFixed(0)}% 失败
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function kpiColor(score: number) {
  return score >= 80 ? theme.success : score >= 50 ? theme.warning : theme.danger
}

function Kpi({ label, value, suffix, color, small }: {
  label: string
  value: number | string
  suffix?: string
  color: string
  small?: boolean
}) {
  return (
    <div style={{
      padding: 14, borderRadius: theme.radius,
      background: theme.surface, border: `1px solid ${theme.border}`,
    }}>
      <div style={{ fontSize: 10, color: theme.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontSize: small ? 16 : 24, fontWeight: 700, fontFamily: theme.monoFamily,
        color,
      }}>
        {typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 1) : value}{suffix}
      </div>
    </div>
  )
}
