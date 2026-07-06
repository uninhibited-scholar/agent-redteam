/** ModelLeaderboard — ranks models by average scan score to surface the safest model at a glance. */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'
import { EmptyState } from './EmptyState'

interface ModelScore {
  model: string
  avgScore: number
  bestScore: number
  scanCount: number
  scoreHistory: number[]
}

interface ModelLeaderboardProps {
  models: ModelScore[]
  onSelect?: (model: string) => void
}

function scoreColor(score: number): string {
  if (score >= 80) return theme.success
  if (score >= 50) return theme.warning
  return theme.danger
}

function trendDelta(history: number[]): number {
  return history[history.length - 1] - history[0]
}

function Sparkline({ history }: { history: number[] }) {
  if (history.length < 2) {
    return <span style={{ fontSize: 12, color: theme.textFaint }}>—</span>
  }
  const w = 80
  const h = 24
  const min = Math.min(...history)
  const max = Math.max(...history)
  const range = max - min || 1
  const step = w / (history.length - 1)
  const points = history.map((v, i) => {
    const x = i * step
    const y = h - ((v - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const delta = trendDelta(history)
  const color = delta >= 0 ? theme.success : theme.danger

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={((history.length - 1) * step).toFixed(1)}
          cy={(h - ((history[history.length - 1] - min) / range) * h).toFixed(1)}
          r={2}
          fill={color}
        />
      </svg>
      <span style={{ fontSize: 11, fontFamily: theme.monoFamily, color, minWidth: 32 }}>
        {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
      </span>
    </div>
  )
}

export function ModelLeaderboard({ models, onSelect }: ModelLeaderboardProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  const ranked = [...models].sort((a, b) => b.avgScore - a.avgScore)

  return (
    <Panel title="模型安全排行榜" subtitle={`${models.length} 个模型`}>
      {ranked.length === 0 ? (
        <EmptyState icon="🏆" title="暂无扫描数据" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ranked.map((m, i) => {
            const rank = i + 1
            const isFirst = rank === 1
            const isLast = rank === ranked.length && ranked.length > 1
            const isHovered = hovered === m.model
            const barColor = scoreColor(m.avgScore)

            return (
              <div
                key={m.model}
                onClick={() => onSelect?.(m.model)}
                onMouseEnter={() => setHovered(m.model)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 16px',
                  borderRadius: theme.radiusSm,
                  border: `1px solid ${isHovered ? theme.primary : theme.border}`,
                  background: isHovered ? theme.surfaceHover : theme.bg,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  transition: theme.transition,
                }}
              >
                <div style={{
                  position: 'absolute', inset: 0,
                  width: `${Math.min(Math.max(m.avgScore, 0), 100)}%`,
                  background: barColor, opacity: 0.12,
                  transition: theme.transition,
                  pointerEvents: 'none',
                }} />

                <div style={{
                  position: 'relative', minWidth: 36, textAlign: 'center',
                  fontSize: 16, fontWeight: 700,
                  color: isFirst ? theme.success : isLast ? theme.danger + '99' : theme.textDim,
                }}>
                  {isFirst ? '👑' : `#${rank}`}
                </div>

                <div style={{ position: 'relative', minWidth: 140 }}>
                  <span style={{ fontFamily: theme.monoFamily, fontSize: 13, color: theme.text }}>
                    {m.model}
                  </span>
                </div>

                <div style={{ position: 'relative', minWidth: 110 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: barColor, lineHeight: 1.1 }}>
                    {m.avgScore.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textFaint }}>
                    best: {m.bestScore.toFixed(1)}
                  </div>
                </div>

                <div style={{ position: 'relative', minWidth: 70 }}>
                  <MonoTag tone="dim">{m.scanCount === 1 ? '1 scan' : `${m.scanCount} scans`}</MonoTag>
                </div>

                <div style={{ position: 'relative', marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                  <Sparkline history={m.scoreHistory} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {ranked.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 10, borderTop: `1px solid ${theme.border}` }}>
          <LegendDot color={theme.success} label="≥ 80 安全" />
          <LegendDot color={theme.warning} label="50–79 中等" />
          <LegendDot color={theme.danger} label="< 50 高风险" />
        </div>
      )}
    </Panel>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ fontSize: 11, color: theme.textFaint }}>{label}</span>
    </div>
  )
}
