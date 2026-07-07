import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel, SeverityBadge, MonoTag } from './ui'
import type { SampleResult } from '../types'

interface RegressionWatchProps {
  /** 基线（旧）扫描的样本 */
  baseline: SampleResult[]
  /** 当前（新）扫描的样本 */
  current: SampleResult[]
  /** 基线扫描的标签（如"v1.2"或日期），显示在头部 */
  baselineLabel: string
  /** 当前扫描的标签 */
  currentLabel: string
  /** 点击某样本的回调 */
  onSelectSample?: (sampleId: string) => void
}

export interface DiffResult {
  regressions: SampleResult[]   // pass→fail
  improvements: SampleResult[]  // fail→pass
  stablePass: SampleResult[]    // pass→pass
  stableFail: SampleResult[]    // fail→fail
  onlyInBaseline: string[]      // 仅基线有的 sample_id
  onlyInCurrent: string[]       // 仅当前有的 sample_id
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const MAX_ROWS = 30

/** Compare two scans of the same model sample-by-sample to surface regressions. */
export function diffScans(baseline: SampleResult[], current: SampleResult[]): DiffResult {
  const baseById = new Map<string, SampleResult>()
  for (const s of baseline) baseById.set(s.sample_id, s)
  const currById = new Map<string, SampleResult>()
  for (const s of current) currById.set(s.sample_id, s)

  const result: DiffResult = {
    regressions: [], improvements: [], stablePass: [], stableFail: [],
    onlyInBaseline: [], onlyInCurrent: [],
  }

  for (const [id, base] of baseById) {
    const curr = currById.get(id)
    if (!curr) { result.onlyInBaseline.push(id); continue }
    const b = base.verdict, c = curr.verdict
    // Only pass/fail transitions count; error/skip are ignored.
    if (b !== 'pass' && b !== 'fail') continue
    if (c !== 'pass' && c !== 'fail') continue
    if (b === 'pass' && c === 'fail') result.regressions.push(curr)
    else if (b === 'fail' && c === 'pass') result.improvements.push(curr)
    else if (b === 'pass' && c === 'pass') result.stablePass.push(curr)
    else result.stableFail.push(curr)
  }
  for (const id of currById.keys()) {
    if (!baseById.has(id)) result.onlyInCurrent.push(id)
  }
  return result
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

function severityRank(sev: string): number {
  return SEVERITY_RANK[sev] ?? 4
}

/** Empty/notice placeholder inside the panel. */
function Notice({ text, tone = 'dim' }: { text: string; tone?: 'dim' | 'success' }) {
  const color = tone === 'success' ? theme.success : theme.textDim
  return (
    <div style={{
      padding: '28px 0', textAlign: 'center', fontSize: 13,
      color, fontFamily: theme.fontFamily,
      background: tone === 'success' ? theme.success + '08' : 'transparent',
      borderRadius: theme.radiusSm,
    }}>
      {text}
    </div>
  )
}

function VerdictShift() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: theme.success, textDecoration: 'line-through', fontFamily: theme.monoFamily }}>
        PASS
      </span>
      <span style={{ fontSize: 12, color: theme.textFaint }}>→</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: theme.danger, fontFamily: theme.monoFamily }}>
        FAIL
      </span>
    </div>
  )
}

function SummaryStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 32, fontWeight: 700, color, fontFamily: theme.monoFamily, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: theme.textFaint, letterSpacing: 0.8, marginTop: 6 }}>
        {label}
      </div>
    </div>
  )
}

function RegressionRow({ sample, baseline, expanded, onToggle, onSelect }: {
  sample: SampleResult
  baseline?: SampleResult
  expanded: boolean
  onToggle: () => void
  onSelect?: () => void
}) {
  const [hover, setHover] = useState(false)
  const severe = sample.severity === 'critical' || sample.severity === 'high'
  const bg = hover ? theme.surfaceHover : severe ? theme.danger + '0C' : 'transparent'

  return (
    <div style={{ borderRadius: theme.radiusSm, background: bg, transition: theme.transition }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onSelect}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: onSelect ? 'pointer' : 'default' }}
      >
        <button
          onClick={e => { e.stopPropagation(); onToggle() }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textFaint,
            fontSize: 11, width: 16, transition: theme.transition,
            transform: expanded ? 'rotate(90deg)' : 'none',
          }}
          title={expanded ? '收起' : '展开响应'}
        >
          ▶
        </button>
        <SeverityBadge severity={sample.severity} />
        <span style={{ fontSize: 11, color: theme.textDim, fontFamily: theme.monoFamily, whiteSpace: 'nowrap' }}>
          {sample.sample_id}
        </span>
        <MonoTag tone="dim">{sample.suite}</MonoTag>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: theme.textFaint, fontFamily: theme.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {truncate(sample.question, 80)}
        </span>
        <VerdictShift />
      </div>
      {expanded && (
        <div style={{ padding: '4px 12px 12px 42px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: theme.success, marginBottom: 3, letterSpacing: 0.5 }}>基线响应（PASS）</div>
            <div style={{ fontSize: 11.5, color: theme.textDim, fontFamily: theme.monoFamily, lineHeight: 1.5, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm, padding: 8 }}>
              {baseline ? truncate(baseline.response || '（空）', 200) : '（基线无此样本）'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: theme.danger, marginBottom: 3, letterSpacing: 0.5 }}>当前响应（FAIL）</div>
            <div style={{ fontSize: 11.5, color: theme.textDim, fontFamily: theme.monoFamily, lineHeight: 1.5, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm, padding: 8 }}>
              {truncate(sample.response || '（空）', 200)}
            </div>
          </div>
          {sample.owasp && (
            <div style={{ display: 'flex', gap: 6 }}>
              <MonoTag>{sample.owasp}</MonoTag>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function RegressionWatch({ baseline, current, baselineLabel, currentLabel, onSelectSample }: RegressionWatchProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const diff = useMemo(() => diffScans(baseline, current), [baseline, current])
  const baseById = useMemo(() => {
    const m = new Map<string, SampleResult>()
    for (const s of baseline) m.set(s.sample_id, s)
    return m
  }, [baseline])

  const sortedRegressions = useMemo(
    () => [...diff.regressions].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    [diff.regressions],
  )

  // Per-suite regression counts, descending.
  const suiteRegressions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of diff.regressions) counts.set(s.suite, (counts.get(s.suite) || 0) + 1)
    return [...counts.entries()].map(([suite, count]) => ({ suite, count })).sort((a, b) => b.count - a.count)
  }, [diff.regressions])

  const regCount = diff.regressions.length
  const impCount = diff.improvements.length
  const stableCount = diff.stablePass.length + diff.stableFail.length
  const matched = regCount + impCount + stableCount

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const subtitle = `${baselineLabel} → ${currentLabel}`

  // Boundary: not enough data to compare.
  if (baseline.length === 0 || current.length === 0) {
    return <Panel title="安全回归监控" subtitle={subtitle}><Notice text="需要两次扫描才能对比回归" /></Panel>
  }
  if (matched === 0) {
    return <Panel title="安全回归监控" subtitle={subtitle}><Notice text="两次扫描无共同样本，无法对比" /></Panel>
  }

  const noChange = regCount === 0 && impCount === 0
  const clean = regCount === 0

  return (
    <Panel title="安全回归监控" subtitle={subtitle}>
      {/* Summary bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '16px 12px', marginBottom: 20,
        borderRadius: theme.radiusSm,
        background: clean ? theme.success + '08' : theme.danger + '08',
        borderLeft: `3px solid ${clean ? theme.success : theme.danger}`,
      }}>
        <SummaryStat value={regCount} label="REGRESSIONS" color={theme.danger} />
        <SummaryStat value={impCount} label="IMPROVEMENTS" color={theme.success} />
        <SummaryStat value={stableCount} label="STABLE" color={theme.textDim} />
        {clean && (
          <div style={{ paddingLeft: 12, fontSize: 13, fontWeight: 600, color: theme.success, whiteSpace: 'nowrap' }}>
            ✓ 无回归
          </div>
        )}
      </div>

      {/* Body: regression list */}
      {noChange ? (
        <Notice text="两次扫描表现一致，无变化" tone="success" />
      ) : regCount === 0 ? (
        <Notice text="仅有改善，无回归引入" tone="success" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
          {sortedRegressions.slice(0, MAX_ROWS).map(sample => (
            <RegressionRow
              key={sample.sample_id}
              sample={sample}
              baseline={baseById.get(sample.sample_id)}
              expanded={expanded.has(sample.sample_id)}
              onToggle={() => toggle(sample.sample_id)}
              onSelect={onSelectSample ? () => onSelectSample(sample.sample_id) : undefined}
            />
          ))}
          {regCount > MAX_ROWS && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: theme.textFaint, fontFamily: theme.monoFamily }}>
              + {regCount - MAX_ROWS} 更多
            </div>
          )}
        </div>
      )}

      {/* Footer: per-suite regression heat */}
      {suiteRegressions.length > 0 && (
        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: theme.textDim, letterSpacing: 0.5, marginBottom: 10 }}>
            套件回归分布
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {suiteRegressions.map(({ suite, count }) => (
              <div key={suite} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 120, fontSize: 12, color: theme.textDim, fontFamily: theme.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {suite.replace(/_/g, ' ')}
                </span>
                <span style={{ width: 24, fontSize: 12, color: theme.danger, fontFamily: theme.monoFamily, textAlign: 'right' }}>
                  {count}
                </span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: theme.surfaceHover, overflow: 'hidden' }}>
                  <div style={{ width: `${(count / regCount) * 100}%`, height: '100%', background: theme.danger }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}
