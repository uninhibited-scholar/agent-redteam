/**
 * AttackPatterns — groups failed attacks by category and visualizes which
 * attack techniques are most effective against the model.
 *
 * Shows a horizontal "weakness profile": categories ranked by failure rate,
 * each with a mini breakdown of severity. This is the "where is the model
 * weakest" view that a security analyst needs.
 */
import { useMemo } from 'react'
import { theme } from '../theme'
import type { SampleResult } from '../types'
import { Tooltip } from './ui'

interface Props {
  samples: SampleResult[]
  /** Max categories to show. */
  limit?: number
  onCategoryClick?: (category: string) => void
}

interface CategoryStat {
  category: string
  total: number
  pass: number
  fail: number
  failRate: number
  severityBreakdown: Record<string, number>
}

export function AttackPatterns({ samples, limit = 12, onCategoryClick }: Props) {
  const stats = useMemo<CategoryStat[]>(() => {
    const map = new Map<string, CategoryStat>()
    for (const s of samples) {
      const cat = s.category || 'uncategorized'
      let e = map.get(cat)
      if (!e) {
        e = {
          category: cat, total: 0, pass: 0, fail: 0, failRate: 0,
          severityBreakdown: {},
        }
        map.set(cat, e)
      }
      e.total++
      if (s.verdict === 'pass') e.pass++
      else if (s.verdict === 'fail') {
        e.fail++
        e.severityBreakdown[s.severity] = (e.severityBreakdown[s.severity] || 0) + 1
      }
    }
    // Compute fail rates and sort by absolute failure count (most damage first)
    const arr = Array.from(map.values())
    for (const e of arr) e.failRate = e.total ? e.fail / e.total : 0
    arr.sort((a, b) => b.fail - a.fail || b.failRate - a.failRate)
    return arr.slice(0, limit)
  }, [samples, limit])

  const maxFail = Math.max(1, ...stats.map(s => s.fail))

  if (stats.length === 0 || stats.every(s => s.fail === 0)) {
    return (
      <div style={{ color: theme.textFaint, fontSize: 12, padding: 30, textAlign: 'center' }}>
        无失败样本——模型在该报告中的防御率 100% 🎉
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stats.map(stat => {
        const barWidth = (stat.fail / maxFail) * 100
        const sevEntries = Object.entries(stat.severityBreakdown)
          .sort(([a], [b]) => {
            const rank = { critical: 0, high: 1, medium: 2, low: 3 }
            return (rank[a as keyof typeof rank] ?? 9) - (rank[b as keyof typeof rank] ?? 9)
          })
        return (
          <Tooltip
            key={stat.category}
            content={
              <>
                <strong>{stat.category.replace(/_/g, ' ')}</strong>
                {'\n'}共 {stat.total} · 通过 {stat.pass} · 失败 {stat.fail}
                {'\n'}失败率 {(stat.failRate * 100).toFixed(0)}%
                {sevEntries.length > 0 && '\n' + sevEntries.map(([sev, n]) => `${sev}: ${n}`).join('  ')}
                {onCategoryClick && '\n点击查看样本'}
              </>
            }
          >
            <div
              onClick={() => onCategoryClick?.(stat.category)}
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr auto',
                alignItems: 'center',
                gap: 10,
                padding: '6px 4px',
                borderRadius: theme.radiusSm,
                cursor: onCategoryClick ? 'pointer' : 'default',
                transition: theme.transition,
              }}
              onMouseEnter={e => { if (onCategoryClick) e.currentTarget.style.background = theme.surfaceHover }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {/* Category label */}
              <span style={{
                fontSize: 11.5, color: theme.textDim,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {stat.category.replace(/_/g, ' ')}
              </span>
              {/* Stacked bar — each severity a different shade */}
              <div style={{
                position: 'relative', height: 20,
                background: theme.bg, borderRadius: theme.radiusSm, overflow: 'hidden',
                display: 'flex',
              }}>
                {stat.fail === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 10, color: theme.textFaint }}>无失败</span>
                  </div>
                ) : (
                  sevEntries.map(([sev, n]) => {
                    const sevColor = theme.severity[sev as keyof typeof theme.severity] || theme.textDim
                    const segWidth = (n / stat.fail) * barWidth
                    return (
                      <div key={sev} style={{
                        width: `${segWidth}%`,
                        background: `linear-gradient(180deg, ${sevColor}, ${sevColor}aa)`,
                        transition: 'width 500ms ease',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {segWidth > 12 && (
                          <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>{n}</span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
              {/* Fail rate badge */}
              <span style={{
                fontSize: 11, fontFamily: theme.monoFamily, fontWeight: 700,
                color: stat.failRate > 0.5 ? theme.danger : stat.failRate > 0.25 ? theme.warning : theme.success,
                minWidth: 44, textAlign: 'right',
              }}>
                {(stat.failRate * 100).toFixed(0)}%
              </span>
            </div>
          </Tooltip>
        )
      })}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: theme.textFaint }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: theme.severity.critical, borderRadius: 2 }} />critical
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: theme.severity.high, borderRadius: 2 }} />high
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: theme.severity.medium, borderRadius: 2 }} />medium
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, background: theme.severity.low, borderRadius: 2 }} />low
        </span>
      </div>
    </div>
  )
}
