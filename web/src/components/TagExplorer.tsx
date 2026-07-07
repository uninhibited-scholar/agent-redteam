/** TagExplorer — interactive tag cloud + filter, exploring samples by attack technique instead of suite. */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel, SeverityBadge, MonoTag } from './ui'
import type { SampleResult } from '../types'

interface TagExplorerProps {
  samples: SampleResult[]
  selectedTags: Set<string>
  onToggleTag: (tag: string) => void
  combinator: 'AND' | 'OR'
  onCombinatorChange: (mode: 'AND' | 'OR') => void
  onSelectSample?: (sampleId: string) => void
}

export function filterByTags(
  samples: SampleResult[],
  tags: Set<string>,
  combinator: 'AND' | 'OR',
): SampleResult[] {
  if (tags.size === 0) return samples
  const wanted = [...tags]
  return samples.filter(s => {
    const own = new Set(s.tags)
    return combinator === 'AND'
      ? wanted.every(t => own.has(t))
      : wanted.some(t => own.has(t))
  })
}

export function countTags(samples: SampleResult[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const s of samples) {
    for (const t of s.tags) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return new Map([...counts.entries()].sort((a, b) => b[1] - a[1]))
}

function humanize(tag: string): string {
  return tag
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** Map a tag's frequency to a font size in [10, 14] px, deterministically. */
function fontSizeFor(count: number, min: number, max: number): number {
  if (max <= min) return 12
  const t = (count - min) / (max - min)
  return Math.round(10 + t * 4)
}

export function TagExplorer({
  samples,
  selectedTags,
  onToggleTag,
  combinator,
  onCombinatorChange,
  onSelectSample,
}: TagExplorerProps) {
  const [hoveredTag, setHoveredTag] = useState<string | null>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  if (samples.length === 0) {
    return (
      <Panel title="标签探索器" subtitle="从攻击手法维度筛选样本">
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: theme.textFaint }}>
          无样本数据
        </div>
      </Panel>
    )
  }

  const tagCounts = countTags(samples)
  const total = samples.length
  const hotThreshold = total * 0.2
  const countValues = [...tagCounts.values()]
  const minCount = countValues.length ? Math.min(...countValues) : 0
  const maxCount = countValues.length ? Math.max(...countValues) : 0

  const filtered = filterByTags(samples, selectedTags, combinator)
  const passCount = filtered.filter(s => s.verdict === 'pass').length
  const failCount = filtered.filter(s => s.verdict === 'fail').length
  const preview = filtered.slice(0, 8)
  const moreCount = filtered.length - preview.length

  return (
    <Panel title="标签探索器" subtitle="从攻击手法维度筛选样本">
      {/* Toolbar: combinator + clear */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['AND', 'OR'] as const).map(mode => {
            const active = combinator === mode
            return (
              <button
                key={mode}
                onClick={() => onCombinatorChange(mode)}
                title={mode === 'AND' ? '全部匹配（交集）' : '任一匹配（并集）'}
                style={{
                  padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: active ? theme.primary + '18' : theme.bg,
                  border: `1px solid ${active ? theme.primary : theme.border}`,
                  borderRadius: theme.radiusSm,
                  color: active ? theme.primary : theme.textDim,
                  transition: theme.transition,
                }}
              >
                {mode}
              </button>
            )
          })}
          <span style={{ fontSize: 11, color: theme.textFaint, alignSelf: 'center', marginLeft: 4 }}>
            {combinator === 'AND' ? '全部匹配（交集）' : '任一匹配（并集）'}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: theme.textDim }}>
          {selectedTags.size} / {tagCounts.size} tags selected
        </span>
        {selectedTags.size > 0 && (
          <button
            onClick={() => selectedTags.forEach(t => onToggleTag(t))}
            style={{
              padding: '5px 12px', fontSize: 12, cursor: 'pointer',
              background: theme.bg, border: `1px solid ${theme.border}`,
              borderRadius: theme.radiusSm, color: theme.textDim,
              transition: theme.transition,
            }}
          >
            清空
          </button>
        )}
      </div>

      {/* Tag cloud */}
      <div style={{ marginBottom: 16 }}>
        {tagCounts.size === 0 ? (
          <div style={{ fontSize: 12, color: theme.textFaint }}>样本未标记 tag</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[...tagCounts.entries()].map(([tag, count]) => {
              const active = selectedTags.has(tag)
              const hovered = hoveredTag === tag
              const isHot = count > hotThreshold
              const fs = fontSizeFor(count, minCount, maxCount)
              return (
                <button
                  key={tag}
                  onClick={() => onToggleTag(tag)}
                  onMouseEnter={() => setHoveredTag(tag)}
                  onMouseLeave={() => setHoveredTag(null)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 10px', fontSize: fs, cursor: 'pointer',
                    fontFamily: theme.monoFamily,
                    background: active ? theme.primary : hovered ? theme.surfaceHover : theme.surface,
                    color: active ? theme.bg : theme.textDim,
                    border: `1px solid ${active ? theme.primary : theme.border}`,
                    borderRadius: theme.radiusSm,
                    transition: theme.transition,
                  }}
                >
                  <span>{humanize(tag)}</span>
                  <span style={{ opacity: 0.6, fontSize: Math.max(fs - 2, 9) }}>{count}</span>
                  {isHot && <span style={{ color: active ? theme.bg : theme.danger, fontSize: 10 }}>🔥</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Result count + mini stacked bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 6 }}>
          {selectedTags.size === 0 && <span style={{ color: theme.textFaint }}>未筛选 · </span>}
          匹配 <b style={{ color: theme.text }}>{filtered.length}</b> 个样本
          （<span style={{ color: theme.success }}>{passCount} pass</span> · <span style={{ color: theme.danger }}>{failCount} fail</span>）
        </div>
        <div style={{ display: 'flex', height: 6, borderRadius: theme.radiusSm, overflow: 'hidden', border: `1px solid ${theme.border}` }}>
          <div style={{ width: filtered.length ? `${(passCount / filtered.length) * 100}%` : '0%', background: theme.success, transition: theme.transition }} />
          <div style={{ width: filtered.length ? `${(failCount / filtered.length) * 100}%` : '0%', background: theme.danger, transition: theme.transition }} />
          <div style={{ flex: 1, background: theme.bg }} />
        </div>
      </div>

      {/* Sample preview (first 8) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {preview.map(s => {
          const hovered = hoveredRow === s.sample_id
          return (
            <div
              key={s.sample_id}
              onClick={() => onSelectSample?.(s.sample_id)}
              onMouseEnter={() => setHoveredRow(s.sample_id)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: theme.radiusSm, cursor: 'pointer',
                background: hovered ? theme.surfaceHover : 'transparent',
                border: `1px solid ${hovered ? theme.borderActive : 'transparent'}`,
                transition: theme.transition,
              }}
            >
              <SeverityBadge severity={s.severity} />
              <span style={{ fontFamily: theme.monoFamily, fontSize: 12, color: theme.text }}>{s.sample_id}</span>
              <MonoTag tone="dim">{s.suite}</MonoTag>
              <span style={{ flex: 1, fontSize: 12, color: theme.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {truncate(s.question, 60)}
              </span>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {s.tags.slice(0, 4).map(t => <MonoTag key={t} tone="dim">{t}</MonoTag>)}
              </div>
            </div>
          )
        })}
        {moreCount > 0 && (
          <div style={{ fontSize: 12, color: theme.textFaint, textAlign: 'center', padding: '6px 0' }}>
            + {moreCount} 更多
          </div>
        )}
        {filtered.length === 0 && (
          <div style={{ fontSize: 12, color: theme.textFaint, textAlign: 'center', padding: '12px 0' }}>
            无匹配样本
          </div>
        )}
      </div>
    </Panel>
  )
}
