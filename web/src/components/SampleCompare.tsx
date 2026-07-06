/** SampleCompare — diff samples across two runs of the same model to surface verdict flips from sampling variance. */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel, SeverityBadge, MonoTag } from './ui'
import { EmptyState } from './EmptyState'
import type { SampleResult } from '../types'

interface SampleCompareProps {
  runA: SampleResult[]
  runB: SampleResult[]
  modelLabel: string
  onSelectSample?: (sampleId: string) => void
}

type FilterMode = 'all' | 'unstable' | 'failed'

interface MatchedRow {
  sampleId: string
  suite: string
  severity: string
  question: string
  a: SampleResult | null
  b: SampleResult | null
}

type RowState = 'stable-pass' | 'stable-fail' | 'degraded' | 'improved' | 'only-a' | 'only-b'

function rowState(row: MatchedRow): RowState {
  if (!row.a) return 'only-b'
  if (!row.b) return 'only-a'
  const aFail = row.a.verdict === 'fail'
  const bFail = row.b.verdict === 'fail'
  if (aFail && bFail) return 'stable-fail'
  if (!aFail && !bFail) return 'stable-pass'
  return aFail ? 'improved' : 'degraded'
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

function stateLabel(state: RowState): string {
  switch (state) {
    case 'stable-pass': return '稳定'
    case 'stable-fail': return '稳定（都失败）'
    case 'degraded': return '⚠ 不稳定（退化）'
    case 'improved': return '⚠ 不稳定（改善）'
    case 'only-a': return '仅在 A 中'
    case 'only-b': return '仅在 B 中'
  }
}

function stateColor(state: RowState): string {
  switch (state) {
    case 'stable-pass': return theme.textDim
    case 'stable-fail': return theme.danger
    case 'degraded': return theme.danger
    case 'improved': return theme.success
    case 'only-a':
    case 'only-b': return theme.textFaint
  }
}

export function SampleCompare({ runA, runB, modelLabel, onSelectSample }: SampleCompareProps) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [selected, setSelected] = useState<string | null>(null)

  const rows = useMemo<MatchedRow[]>(() => {
    const byId = new Map<string, MatchedRow>()
    for (const s of runA) {
      byId.set(s.sample_id, {
        sampleId: s.sample_id, suite: s.suite, severity: s.severity, question: s.question,
        a: s, b: null,
      })
    }
    for (const s of runB) {
      const existing = byId.get(s.sample_id)
      if (existing) {
        existing.b = s
      } else {
        byId.set(s.sample_id, {
          sampleId: s.sample_id, suite: s.suite, severity: s.severity, question: s.question,
          a: null, b: s,
        })
      }
    }
    return [...byId.values()]
  }, [runA, runB])

  const matchedCount = rows.filter(r => r.a && r.b).length
  const stableCount = rows.filter(r => {
    const st = rowState(r)
    return st === 'stable-pass' || st === 'stable-fail'
  }).length
  const flippedCount = rows.filter(r => {
    const st = rowState(r)
    return st === 'degraded' || st === 'improved'
  }).length
  const stableRate = matchedCount > 0 ? stableCount / matchedCount : 0

  const filtered = rows.filter(r => {
    const st = rowState(r)
    if (filter === 'unstable') return st === 'degraded' || st === 'improved'
    if (filter === 'failed') return r.a?.verdict === 'fail' || r.b?.verdict === 'fail'
    return true
  })

  function handleSelect(sampleId: string) {
    setSelected(sampleId)
    onSelectSample?.(sampleId)
  }

  if (runA.length === 0 && runB.length === 0) {
    return (
      <Panel title="样本对比" subtitle={modelLabel}>
        <EmptyState icon="🔁" title="无数据" description="两次运行都没有样本可比较" />
      </Panel>
    )
  }

  return (
    <Panel title="样本对比" subtitle={modelLabel}>
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: theme.textDim }}>
          稳定一致：<b style={{ color: theme.text }}>{stableCount}</b> 个（两次判定相同）
        </span>
        <span style={{ fontSize: 12, color: theme.textDim }}>
          判定翻转：<b style={{ color: flippedCount > 0 ? theme.danger : theme.text }}>{flippedCount}</b> 个（A pass/B fail 或反之）
        </span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: theme.textFaint, marginBottom: 4 }}>
          <span>稳定率</span>
          <span>{(stableRate * 100).toFixed(1)}%</span>
        </div>
        <div style={{ height: 6, background: theme.bg, borderRadius: theme.radiusSm, overflow: 'hidden', border: `1px solid ${theme.border}` }}>
          <div style={{
            width: `${stableRate * 100}%`, height: '100%',
            background: theme.success, transition: theme.transition,
          }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['all', 'unstable', 'failed'] as FilterMode[]).map(mode => {
          const label = mode === 'all' ? '全部' : mode === 'unstable' ? '仅不稳定' : '仅失败'
          const isActive = filter === mode
          return (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              style={{
                padding: '5px 12px', fontSize: 12, cursor: 'pointer',
                background: isActive ? theme.primary + '18' : theme.bg,
                border: `1px solid ${isActive ? theme.primary : theme.border}`,
                borderRadius: theme.radiusSm,
                color: isActive ? theme.primary : theme.textDim,
                transition: theme.transition,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 && (
          <EmptyState icon="🔍" title="无匹配样本" description="当前筛选条件下没有样本" />
        )}
        {filtered.map(row => {
          const state = rowState(row)
          const isSelected = selected === row.sampleId
          return (
            <div
              key={row.sampleId}
              onClick={() => handleSelect(row.sampleId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', cursor: 'pointer',
                background: isSelected ? theme.surfaceHover : theme.bg,
                border: `1px solid ${isSelected ? theme.primary : theme.border}`,
                borderRadius: theme.radiusSm,
                transition: theme.transition,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}>
                <span style={{ fontFamily: theme.monoFamily, fontSize: 11, color: theme.text }}>
                  {row.sampleId}
                </span>
                <SeverityBadge severity={row.severity} />
                <MonoTag tone="dim">{row.suite}</MonoTag>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
                <span style={{ fontSize: 11, fontFamily: theme.monoFamily, color: theme.textDim }}>
                  {row.a ? row.a.verdict : '—'}
                </span>
                <span style={{ fontSize: 11, color: theme.textFaint }}>→</span>
                <span style={{ fontSize: 11, fontFamily: theme.monoFamily, color: theme.textDim }}>
                  {row.b ? row.b.verdict : '—'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: stateColor(state) }}>
                  {stateLabel(state)}
                </span>
              </div>

              <div style={{ flex: 1, fontSize: 12, color: theme.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {truncate(row.question, 80)}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
