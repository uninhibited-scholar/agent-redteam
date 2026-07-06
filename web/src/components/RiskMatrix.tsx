/**
 * RiskMatrix — 2D likelihood x impact grid, green-to-red gradient, click to highlight.
 * Bucketing: likelihood derived from difficulty, impact from severity.
 */
import { Fragment, useState } from 'react'
import { theme } from '../theme'
import type { SampleResult } from '../types'

type Level = 'low' | 'medium' | 'high'
const LEVELS: Level[] = ['low', 'medium', 'high']

const LIKELIHOOD_BY_DIFFICULTY: Record<string, Level> = {
  easy: 'high',
  medium: 'medium',
  hard: 'low',
}

const IMPACT_BY_SEVERITY: Record<string, Level> = {
  critical: 'high',
  high: 'high',
  medium: 'medium',
  low: 'low',
}

function cellColor(likelihood: Level, impact: Level): string {
  const score = LEVELS.indexOf(likelihood) + LEVELS.indexOf(impact) // 0..4
  const colors = [theme.success, '#8BC34A', theme.warning, '#FF6E40', theme.danger]
  return colors[Math.min(score, colors.length - 1)]
}

interface Props {
  samples: SampleResult[]
  onCellClick?: (likelihood: Level, impact: Level, samples: SampleResult[]) => void
}

export function RiskMatrix({ samples, onCellClick }: Props) {
  const [active, setActive] = useState<string | null>(null)

  const failed = samples.filter(s => s.verdict === 'fail')

  const buckets = new Map<string, SampleResult[]>()
  for (const s of failed) {
    const likelihood = LIKELIHOOD_BY_DIFFICULTY[s.difficulty] || 'medium'
    const impact = IMPACT_BY_SEVERITY[s.severity] || 'medium'
    const key = `${likelihood}:${impact}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(s)
  }

  // rows = impact (high at top), cols = likelihood (low to high)
  const impactRows: Level[] = ['high', 'medium', 'low']

  function handleClick(likelihood: Level, impact: Level) {
    const key = `${likelihood}:${impact}`
    setActive(prev => (prev === key ? null : key))
    onCellClick?.(likelihood, impact, buckets.get(key) || [])
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(3, 1fr)', gap: 4 }}>
        <div />
        {LEVELS.map(l => (
          <div key={l} style={{
            textAlign: 'center', fontSize: 11, color: theme.textDim,
            textTransform: 'uppercase', paddingBottom: 4,
          }}>
            {l}
          </div>
        ))}

        {impactRows.map(impact => (
          <Fragment key={impact}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              fontSize: 11, color: theme.textDim, textTransform: 'uppercase',
              paddingRight: 8,
            }}>
              {impact}
            </div>
            {LEVELS.map(likelihood => {
              const key = `${likelihood}:${impact}`
              const count = buckets.get(key)?.length || 0
              const isActive = active === key
              return (
                <div
                  key={key}
                  onClick={() => handleClick(likelihood, impact)}
                  style={{
                    height: 64, borderRadius: theme.radiusSm,
                    background: count > 0 ? cellColor(likelihood, impact) : theme.surface,
                    opacity: count > 0 ? (isActive ? 1 : 0.75) : 0.4,
                    border: isActive ? `2px solid ${theme.text}` : `1px solid ${theme.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: theme.transition,
                    fontSize: 18, fontWeight: 700,
                    color: count > 0 ? '#0A0E1A' : theme.textFaint,
                  }}
                >
                  {count > 0 ? count : ''}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 10, color: theme.textFaint }}>← 可能性</span>
        <span style={{ fontSize: 10, color: theme.textFaint }}>影响 ↑</span>
      </div>
    </div>
  )
}
