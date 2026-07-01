/**
 * RadarChart — multi-axis security coverage visualization.
 * Pure SVG, zero dependencies. Each spoke is a suite; filled area shows exposure.
 */
import { theme } from '../theme'
import type { SuiteResult } from '../types'

interface Props {
  suites: SuiteResult[]
  size?: number
}

export function RadarChart({ suites, size = 260 }: Props) {
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
        fillOpacity={0.12}
        stroke={theme.primary}
        strokeWidth={2}
        style={{ transition: 'all 600ms ease' }}
      />

      {/* Data points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x} cy={p.y} r={4}
          fill={theme.primary}
          style={{ transition: 'all 600ms ease' }}
        />
      ))}

      {/* Labels */}
      {points.map((p, i) => {
        const color = (theme.suites as Record<string, string>)[p.suite.name] || theme.primary
        return (
          <g key={i}>
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
