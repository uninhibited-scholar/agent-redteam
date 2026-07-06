import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel, SeverityBadge, MonoTag } from './ui'
import type { SampleResult } from '../types'

interface FailurePatternProps {
  /** 该扫描中所有失败的样本（verdict === 'fail'） */
  failures: SampleResult[]
  /** 点击某个模式/样本的回调 */
  onSelectPattern?: (tag: string) => void
  /** 点击单个样本的回调 */
  onSelectSample?: (sampleId: string) => void
}

interface TagCluster {
  tag: string
  count: number
  suites: string[]
  severities: Record<string, number>
  samples: SampleResult[]
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const
const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

/** Groups failures by tag, expanding samples with multiple tags into each. Untagged samples go into a virtual 'untagged' bucket. */
export function clusterByTag(failures: SampleResult[]): TagCluster[] {
  const byTag = new Map<string, TagCluster>()

  for (const sample of failures) {
    const tags = sample.tags && sample.tags.length > 0 ? sample.tags : ['untagged']
    for (const tag of tags) {
      let cluster = byTag.get(tag)
      if (!cluster) {
        cluster = { tag, count: 0, suites: [], severities: {}, samples: [] }
        byTag.set(tag, cluster)
      }
      cluster.count += 1
      if (!cluster.suites.includes(sample.suite)) cluster.suites.push(sample.suite)
      cluster.severities[sample.severity] = (cluster.severities[sample.severity] || 0) + 1
      cluster.samples.push(sample)
    }
  }

  return Array.from(byTag.values()).sort((a, b) => b.count - a.count)
}

function readableTag(tag: string): string {
  const spaced = tag.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function canonicalDifficulty(d: string): 'easy' | 'medium' | 'hard' | 'other' {
  if (d === 'easy' || d === 'basic') return 'easy'
  if (d === 'medium' || d === 'intermediate') return 'medium'
  if (d === 'hard') return 'hard'
  return 'other'
}

function rateColor(rate: number): string {
  if (rate < 0.3) return theme.success
  if (rate < 0.6) return theme.warning
  return theme.danger
}

function SeverityStackBar({ severities, total }: { severities: Record<string, number>; total: number }) {
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: theme.surfaceActive }}>
      {SEVERITY_ORDER.map(sev => {
        const n = severities[sev] || 0
        if (n === 0) return null
        return (
          <div
            key={sev}
            title={`${sev}: ${n}`}
            style={{ width: `${(n / total) * 100}%`, background: theme.severity[sev] }}
          />
        )
      })}
    </div>
  )
}

export function FailurePattern({ failures, onSelectPattern, onSelectSample }: FailurePatternProps) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [hoverSample, setHoverSample] = useState<string | null>(null)

  const clusters = useMemo(() => clusterByTag(failures), [failures])
  const onlyUntagged = clusters.length > 0 && clusters.every(c => c.tag === 'untagged')

  const difficultyRows = useMemo(() => {
    const buckets: Record<string, number> = { easy: 0, medium: 0, hard: 0, other: 0 }
    for (const f of failures) buckets[canonicalDifficulty(f.difficulty)] += 1
    const total = failures.length || 1
    const rows = (['easy', 'medium', 'hard', 'other'] as const)
      .filter(key => key !== 'other' || buckets.other > 0)
      .map(key => ({ key, count: buckets[key], rate: buckets[key] / total }))
    const maxOtherRate = (key: string) =>
      Math.min(...rows.filter(r => r.key !== key).map(r => r.rate), 1)
    return rows.map(r => ({ ...r, warn: r.count > 0 && r.rate - maxOtherRate(r.key) > 0.2 }))
  }, [failures])

  const topFailures = useMemo(() => {
    return [...failures]
      .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4))
      .slice(0, 5)
  }, [failures])

  if (failures.length === 0) {
    return (
      <Panel title="失败模式分析" subtitle="0 个失败样本">
        <div style={{ padding: '32px 0', textAlign: 'center', color: theme.textDim, fontFamily: theme.fontFamily }}>
          无失败样本，模型在本轮扫描中全部通过
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="失败模式分析" subtitle={`共 ${failures.length} 个失败样本`}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 10 }}>模式聚类</div>
        {onlyUntagged ? (
          <div style={{ color: theme.textFaint, fontSize: 12, fontFamily: theme.fontFamily }}>
            样本未标记 tag，无法聚类
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {clusters.map(cluster => {
              const active = selectedTag === cluster.tag
              return (
                <div
                  key={cluster.tag}
                  onClick={() => { setSelectedTag(cluster.tag); onSelectPattern?.(cluster.tag) }}
                  style={{
                    border: `1px solid ${active ? theme.primary : theme.border}`,
                    background: active ? theme.surfaceActive : theme.surface,
                    borderRadius: theme.radiusSm,
                    padding: 12,
                    cursor: 'pointer',
                    transition: theme.transition,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = theme.surfaceHover }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = theme.surface }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: theme.text, fontFamily: theme.fontFamily }}>
                      {readableTag(cluster.tag)}
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: theme.primary, fontFamily: theme.monoFamily }}>
                      {cluster.count}
                    </span>
                  </div>
                  <SeverityStackBar severities={cluster.severities} total={cluster.count} />
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                    {cluster.suites.map(suite => <MonoTag key={suite} tone="dim">{suite}</MonoTag>)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 10 }}>难度脆弱性</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {difficultyRows.map(row => (
            <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 60, fontSize: 12, color: theme.textDim, fontFamily: theme.fontFamily, textTransform: 'capitalize' }}>
                {row.key}
              </span>
              <span style={{ width: 24, fontSize: 12, color: theme.text, fontFamily: theme.monoFamily, textAlign: 'right' }}>
                {row.count}
              </span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: theme.surfaceActive, overflow: 'hidden' }}>
                <div style={{ width: `${row.rate * 100}%`, height: '100%', background: rateColor(row.rate) }} />
              </div>
              <span style={{ width: 44, fontSize: 11, color: theme.textFaint, fontFamily: theme.monoFamily, textAlign: 'right' }}>
                {(row.rate * 100).toFixed(0)}%
              </span>
              {row.warn && <span title="失败率显著偏高">⚠</span>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 10 }}>代表性失败</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {topFailures.map(sample => (
            <div
              key={sample.sample_id}
              onClick={() => onSelectSample?.(sample.sample_id)}
              onMouseEnter={() => setHoverSample(sample.sample_id)}
              onMouseLeave={() => setHoverSample(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 8px',
                borderRadius: theme.radiusSm,
                cursor: 'pointer',
                background: hoverSample === sample.sample_id ? theme.surfaceHover : 'transparent',
                transition: theme.transition,
              }}
            >
              <SeverityBadge severity={sample.severity} />
              <span style={{ fontSize: 11, color: theme.textDim, fontFamily: theme.monoFamily, whiteSpace: 'nowrap' }}>
                {sample.sample_id}
              </span>
              <MonoTag tone="dim">{sample.suite}</MonoTag>
              <span style={{ fontSize: 12, color: theme.textFaint, fontFamily: theme.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sample.question.length > 80 ? sample.question.slice(0, 80) + '…' : sample.question}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}
