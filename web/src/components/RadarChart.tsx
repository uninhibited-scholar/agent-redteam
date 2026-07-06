/**
 * RadarChart — multi-axis security coverage visualization.
 * Pure SVG, zero dependencies. Each spoke is a suite; filled area shows exposure.
 *
 * Interactivity: hover a vertex to highlight it + see a tooltip with the
 * suite's pass/fail/total; click a vertex to drill into that suite (caller
 * supplies onSuiteClick).
 */
import { useState } from 'react'
import { theme } from '../theme'
import type { SuiteResult } from '../types'
import { Tooltip } from './ui'

interface Props {
  suites: SuiteResult[]
  size?: number
  onSuiteClick?: (suite: SuiteResult) => void
}

export function RadarChart({ suites, size = 260, onSuiteClick }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.38
  const n = suites.length || 1
  const levels = [0.25, 0.5, 0.75, 1.0]

  // Each suite is a spoke; score/100 determines the point distance
  const points = suites.map((s, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const r = radius * (s.score / 100)
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      angle,
      labelX: cx + (radius + 22) * Math.cos(angle),
      labelY: cy + (radius + 22) * Math.sin(angle),
      suite: s,
    }
  })

  const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid rings */}
      {levels.map((lv, i) => {
        const r = radius * lv
        const ringPoints = suites.map((_, j) => {
          const angle = (Math.PI * 2 * j) / n - Math.PI / 2
          return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
        }).join(' ')
        return (
          <polygon
            key={i}
            points={ringPoints}
            fill="none"
            stroke={theme.border}
            strokeWidth={1}
            opacity={i === levels.length - 1 ? 0.6 : 0.3}
          />
        )
      })}

      {/* Spokes */}
      {points.map((p, i) => (
        <line
          key={i}
          x1={cx} y1={cy}
          x2={cx + radius * Math.cos(p.angle)}
          y2={cy + radius * Math.sin(p.angle)}
          stroke={theme.border}
          strokeWidth={1}
          opacity={0.4}
        />
      ))}

      {/* Data polygon */}
      <polygon
        points={polygonPoints}
        fill={theme.primary}
        fillOpacity={hovered === null ? 0.12 : 0.06}
        stroke={theme.primary}
        strokeWidth={2}
        style={{ transition: 'all 600ms ease' }}
      />

      {/* Data points — interactive */}
      {points.map((p, i) => {
        const isHovered = hovered === i
        const color = (theme.suites as Record<string, string>)[p.suite.name] || theme.primary
        return (
          <Tooltip
            key={i}
            content={
              <>
                <strong style={{ color }}>{p.suite.name.replace(/_/g, ' ')}</strong>
                {'\n'}score {p.suite.score.toFixed(1)} · pass {p.suite.passed}/{p.suite.passed + p.suite.failed}
                {onSuiteClick && '\n点击查看详情'}
              </>
            }
          >
            <circle
              cx={p.x} cy={p.y} r={isHovered ? 6 : 4}
              fill={isHovered ? color : theme.primary}
              stroke={isHovered ? theme.bg : 'none'}
              strokeWidth={isHovered ? 2 : 0}
              style={{
                transition: 'all 200ms ease',
                cursor: onSuiteClick ? 'pointer' : 'default',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSuiteClick?.(p.suite)}
            />
          </Tooltip>
        )
      })}

      {/* Labels — dim non-hovered for focus */}
      {points.map((p, i) => {
        const color = (theme.suites as Record<string, string>)[p.suite.name] || theme.primary
        const dim = hovered !== null && hovered !== i
        return (
          <g key={i} style={{ opacity: dim ? 0.35 : 1, transition: 'opacity 200ms' }}>
            <text
              x={p.labelX} y={p.labelY - 6}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={color}
              fontFamily={theme.fontFamily}
            >
              {p.suite.name.replace(/_/g, ' ')}
            </text>
            <text
              x={p.labelX} y={p.labelY + 8}
              textAnchor="middle"
              fontSize={13}
              fontWeight={700}
              fill={p.suite.score >= 80 ? theme.success : p.suite.score >= 50 ? theme.warning : theme.danger}
              fontFamily={theme.monoFamily}
            >
              {p.suite.score.toFixed(0)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
