/**
 * AttackTimeline — vertical, execution-ordered stream of sample results for one
 * scan run. Surfaces temporal clustering of failures (e.g. "5 in a row").
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'
import type { SampleResult } from '../types'

interface TimelineEntry {
  index: number
  sample: SampleResult
}

interface AttackTimelineProps {
  entries: TimelineEntry[]
  onSelect?: (sampleId: string) => void
  maxEntries?: number
}

const dotColor = (verdict: SampleResult['verdict']) =>
  verdict === 'pass' ? theme.success : verdict === 'error' ? theme.warning : theme.danger

/** Runs of ≥3 consecutive fail/error entries, as [startIdx, endIdx] into entries[]. */
function findFailStreaks(entries: TimelineEntry[]): Array<{ start: number; end: number }> {
  const streaks: Array<{ start: number; end: number }> = []
  let runStart = -1
  for (let i = 0; i < entries.length; i++) {
    const isFail = entries[i].sample.verdict !== 'pass'
    if (isFail) {
      if (runStart === -1) runStart = i
    } else {
      if (runStart !== -1 && i - runStart >= 3) streaks.push({ start: runStart, end: i - 1 })
      runStart = -1
    }
  }
  if (runStart !== -1 && entries.length - runStart >= 3) {
    streaks.push({ start: runStart, end: entries.length - 1 })
  }
  return streaks
}

export function AttackTimeline({ entries, onSelect, maxEntries = 50 }: AttackTimelineProps) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  const { passed, failed } = useMemo(() => {
    let passed = 0
    let failed = 0
    for (const e of entries) {
      if (e.sample.verdict === 'pass') passed++
      else failed++
    }
    return { passed, failed }
  }, [entries])

  const streaks = useMemo(() => findFailStreaks(entries), [entries])
  const streakByStart = useMemo(() => {
    const m = new Map<number, number>()
    for (const s of streaks) m.set(s.start, s.end - s.start + 1)
    return m
  }, [streaks])
  const inStreak = useMemo(() => {
    const set = new Set<number>()
    for (const s of streaks) for (let i = s.start; i <= s.end; i++) set.add(i)
    return set
  }, [streaks])

  const visible = entries.slice(0, maxEntries)
  const scrollable = entries.length > maxEntries

  return (
    <Panel
      title="攻击时间轴"
      subtitle={`共 ${entries.length} 个样本 · ${passed} 通过 · ${failed} 失败`}
    >
      {entries.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>
          无样本
        </div>
      ) : (
        <>
          {/* Horizontal mini-bar: full sequence compressed into a color band */}
          <div style={{ display: 'flex', width: '100%', height: 10, borderRadius: theme.radiusSm, overflow: 'hidden', marginBottom: 16 }}>
            {entries.map(e => (
              <div
                key={e.index}
                title={`#${e.index} ${e.sample.sample_id}`}
                style={{ width: 2, minWidth: 2, height: '100%', background: dotColor(e.sample.verdict) }}
              />
            ))}
          </div>

          <div
            style={{
              position: 'relative',
              paddingLeft: 24,
              maxHeight: scrollable ? 500 : undefined,
              overflowY: scrollable ? 'auto' : undefined,
            }}
          >
            <div style={{ position: 'absolute', left: 9, top: 8, bottom: 8, width: 2, background: theme.border }} />

            {visible.map(entry => {
              const { sample, index } = entry
              const isFail = sample.verdict !== 'pass'
              const color = dotColor(sample.verdict)
              const streakLen = streakByStart.get(index)
              const dangerSegment = inStreak.has(index)
              const key = sample.sample_id || String(index)
              const isHovered = hoverId === key

              return (
                <div key={key} style={{ position: 'relative', marginBottom: 14 }}>
                  {dangerSegment && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 9,
                        top: -7,
                        bottom: -7,
                        width: 2,
                        background: theme.danger,
                        opacity: 0.6,
                      }}
                    />
                  )}

                  <div
                    onMouseEnter={() => setHoverId(key)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => onSelect?.(sample.sample_id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: onSelect ? 'pointer' : 'default', position: 'relative' }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 10 - (isFail ? 6 : 4),
                        width: isFail ? 12 : 8,
                        height: isFail ? 12 : 8,
                        borderRadius: '50%',
                        background: color,
                        border: `2px solid ${theme.surface}`,
                        animation: isFail ? 'pulse 1.4s ease-in-out infinite' : 'none',
                      }}
                    />
                    <span style={{ width: 16 }} />

                    <span style={{ fontFamily: theme.monoFamily, fontSize: 12, color: theme.text }}>
                      {sample.sample_id}
                    </span>
                    <span style={{ fontSize: 11, color: theme.textDim }}>{sample.suite}</span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: theme.radiusSm,
                        border: `1px solid ${theme.border}`,
                        color: theme.textFaint,
                        textTransform: 'uppercase',
                      }}
                    >
                      {sample.severity}
                    </span>

                    {streakLen && (
                      <span style={{ fontSize: 11, color: theme.danger, fontWeight: 600, marginLeft: 4 }}>
                        ⚠ 连续 {streakLen} 个失败
                      </span>
                    )}
                  </div>

                  {isHovered && (
                    <div
                      style={{
                        marginLeft: 26,
                        marginTop: 4,
                        maxWidth: 480,
                        background: theme.bg,
                        border: `1px solid ${theme.borderActive}`,
                        borderRadius: theme.radiusSm,
                        padding: '6px 10px',
                        fontSize: 11,
                        color: theme.textDim,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                      }}
                    >
                      {(sample.error || sample.response || sample.question || '').slice(0, 100)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Panel>
  )
}
