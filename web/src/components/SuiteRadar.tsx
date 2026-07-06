/**
 * SuiteRadarCompare — overlaid radar chart comparing two scans.
 * Draws two polygons (baseline + newer) on the same axes so regressions
 * and improvements are immediately visible as shape changes.
 *
 * Pure SVG, zero deps.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { Tooltip } from './ui'

export interface RadarSuite {
  name: string
  score: number
}

interface Props {
  suitesA: RadarSuite[]
  suitesB: RadarSuite[]
  labelA?: string
  labelB?: string
  colorA?: string
  colorB?: string
  size?: number
}

export function SuiteRadarCompare({
  suitesA, suitesB, labelA = 'A', labelB = 'B',
  colorA, colorB, size = 300,
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.36
  // Merge suite names from both, preserving A's order
  const allNames: string[] = []
  for (const s of suitesA) if (!allNames.includes(s.name)) allNames.push(s.name)
  for (const s of suitesB) if (!allNames.includes(s.name)) allNames.push(s.name)
  const n = allNames.length || 1
  const levels = [0.25, 0.5, 0.75, 1.0]

  const colA = colorA ?? theme.textFaint
  const colB = colorB ?? theme.primary

  const scoreFor = (suites: RadarSuite[], name: string) =>
    suites.find(s => s.name === name)?.score ?? 0

  const points = allNames.map((name, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const a = scoreFor(suitesA, name)
    const b = scoreFor(suitesB, name)
    return {
      name, a, b,
      angle,
      ax: cx + radius * (a / 100) * Math.cos(angle),
      ay: cy + radius * (a / 100) * Math.sin(angle),
      bx: cx + radius * (b / 100) * Math.cos(angle),
      by: cy + radius * (b / 100) * Math.sin(angle),
      labelX: cx + (radius + 22) * Math.cos(angle),
      labelY: cy + (radius + 22) * Math.sin(angle),
    }
  })

  const polyA = points.map(p => `${p.ax},${p.ay}`).join(' ')
  const polyB = points.map(p => `${p.bx},${p.by}`).join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid rings */}
        {levels.map((lv, i) => {
          const r = radius * lv
          const ringPoints = allNames.map((_, j) => {
            const angle = (Math.PI * 2 * j) / n - Math.PI / 2
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
          }).join(' ')
          return (
            <polygon key={i} points={ringPoints} fill="none"
              stroke={theme.border} strokeWidth={1}
              opacity={i === levels.length - 1 ? 0.6 : 0.3} />
          )
        })}
        {/* Spokes */}
        {points.map((p, i) => (
          <line key={i} x1={cx} y1={cy}
            x2={cx + radius * Math.cos(p.angle)} y2={cy + radius * Math.sin(p.angle)}
            stroke={theme.border} strokeWidth={1} opacity={0.4} />
        ))}
        {/* Polygon A (baseline, faded) */}
        <polygon points={polyA} fill={colA} fillOpacity={0.08}
          stroke={colA} strokeWidth={1.5} strokeDasharray="4 3" />
        {/* Polygon B (newer, prominent) */}
        <polygon points={polyB} fill={colB} fillOpacity={0.14}
          stroke={colB} strokeWidth={2} />
        {/* Vertices B — interactive */}
        {points.map((p, i) => {
          const delta = p.b - p.a
          const improved = delta > 0
          return (
            <Tooltip key={i} content={
              <>
                <strong>{p.name.replace(/_/g, ' ')}</strong>
                {`\n${labelA}: ${p.a.toFixed(1)}`}
                {`\n${labelB}: ${p.b.toFixed(1)}`}
                {`\nΔ ${delta > 0 ? '+' : ''}${delta.toFixed(1)} ${improved ? '✓' : delta < 0 ? '✗' : ''}`}
              </>
            }>
              <circle cx={p.bx} cy={p.by} r={hovered === i ? 6 : 4}
                fill={improved ? theme.success : delta < 0 ? theme.danger : colB}
                stroke={hovered === i ? theme.bg : 'none'} strokeWidth={hovered === i ? 2 : 0}
                style={{ transition: 'r 200ms ease', cursor: 'pointer' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            </Tooltip>
          )
        })}
        {/* Labels */}
        {points.map((p, i) => {
          const dim = hovered !== null && hovered !== i
          return (
            <g key={i} style={{ opacity: dim ? 0.35 : 1, transition: 'opacity 200ms' }}>
              <text x={p.labelX} y={p.labelY - 6} textAnchor="middle"
                fontSize={10} fontWeight={600} fill={theme.textDim}
                fontFamily={theme.fontFamily}>
                {p.name.replace(/_/g, ' ')}
              </text>
              <text x={p.labelX} y={p.labelY + 8} textAnchor="middle"
                fontSize={11} fontWeight={700}
                fill={p.b >= 80 ? theme.success : p.b >= 50 ? theme.warning : theme.danger}
                fontFamily={theme.monoFamily}>
                {p.b.toFixed(0)}
              </text>
            </g>
          )
        })}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
        <LegendItem color={colA} label={`${labelA}（基线）`} dashed />
        <LegendItem color={colB} label={`${labelB}（当前）`} />
      </div>
    </div>
  )
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <svg width={20} height={10}>
        <line x1={0} y1={5} x2={20} y2={5} stroke={color} strokeWidth={2}
          strokeDasharray={dashed ? '4 3' : undefined} />
      </svg>
      <span style={{ fontSize: 11, color: theme.textDim }}>{label}</span>
    </div>
  )
}
