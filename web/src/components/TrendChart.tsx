/**
 * TrendChart — multi-series line chart for tracking metrics over scans/time.
 * Pure SVG, zero deps. Supports up to ~6 series, hover crosshair, value readout.
 *
 * Use cases: score trend across scans, pass-rate over time per suite,
 * failure-count history.
 */
import { useState, useMemo } from 'react'
import { theme } from '../theme'
import { Tooltip } from './ui'

export interface TrendSeries {
  id: string
  label: string
  color: string
  /** Y values, one per x tick. Lengths must match across series. */
  points: (number | null)[]
}

export interface TrendPoint {
  label: string    // x-axis tick label
  values: (number | null)[]   // one per series, parallel to series[]
}

interface Props {
  series: TrendSeries[]
  points: TrendPoint[]
  width?: number
  height?: number
  yLabel?: string
  yMin?: number
  yMax?: number
  /** Optional click handler: which x index was clicked. */
  onPointClick?: (xIndex: number) => void
}

export function TrendChart({
  series, points, width = 560, height = 240,
  yLabel, yMin = 0, yMax, onPointClick,
}: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null)

  const padding = { top: 20, right: 20, bottom: 32, left: 44 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom

  // Compute Y domain
  const allVals = series.flatMap(s => s.points).filter((v): v is number => v !== null)
  const dataMax = yMax ?? (allVals.length ? Math.max(...allVals) : 100)
  const dataMin = yMin
  const domain = dataMax - dataMin || 1

  const n = points.length || 1
  const xStep = plotW / Math.max(1, n - 1)

  const xCoord = (i: number) => padding.left + i * xStep
  const yCoord = (v: number) => padding.top + plotH - ((v - dataMin) / domain) * plotH

  // Gridlines (5 horizontal)
  const gridLines = useMemo(() => {
    const lines = []
    for (let i = 0; i <= 4; i++) {
      const v = dataMin + (domain * i) / 4
      lines.push({ v, y: yCoord(v) })
    }
    return lines
  }, [dataMin, domain]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build path strings per series
  const paths = series.map(s => {
    let d = ''
    let started = false
    s.points.forEach((v, i) => {
      if (v === null) { started = false; return }
      const cmd = started ? 'L' : 'M'
      d += `${cmd}${xCoord(i).toFixed(1)},${yCoord(v).toFixed(1)} `
      started = true
    })
    return { series: s, d }
  })

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Gridlines + Y labels */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={padding.left} y1={g.y}
              x2={width - padding.right} y2={g.y}
              stroke={theme.border}
              strokeWidth={1}
              opacity={0.4}
            />
            <text
              x={padding.left - 6} y={g.y + 3}
              textAnchor="end"
              fontSize={10}
              fill={theme.textFaint}
              fontFamily={theme.monoFamily}
            >
              {g.v.toFixed(0)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={xCoord(i)} y={height - padding.bottom + 16}
            textAnchor="middle"
            fontSize={10}
            fill={theme.textFaint}
            fontFamily={theme.fontFamily}
          >
            {p.label.length > 12 ? p.label.slice(0, 11) + '…' : p.label}
          </text>
        ))}

        {/* Hover crosshair */}
        {hoverX !== null && (
          <line
            x1={xCoord(hoverX)} y1={padding.top}
            x2={xCoord(hoverX)} y2={padding.top + plotH}
            stroke={theme.primary}
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
            pointerEvents="none"
          />
        )}

        {/* Series lines */}
        {paths.map(({ series: s, d }) => (
          <path
            key={s.id}
            d={d}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ transition: 'd 400ms ease' }}
          />
        ))}

        {/* Data points (hover targets) */}
        {points.map((p, xIdx) => (
          <g key={xIdx}>
            {/* Invisible hit strip spanning the full plot height */}
            <rect
              x={xCoord(xIdx) - xStep / 2} y={padding.top}
              width={xStep} height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverX(xIdx)}
              onMouseLeave={() => setHoverX(null)}
              onClick={() => onPointClick?.(xIdx)}
              style={{ cursor: onPointClick ? 'pointer' : 'default' }}
            />
            {/* Visible dots when this x is hovered */}
            {hoverX === xIdx && series.map((s, sIdx) => {
              const v = p.values[sIdx]
              if (v === null) return null
              return (
                <circle
                  key={s.id}
                  cx={xCoord(xIdx)} cy={yCoord(v)} r={4}
                  fill={s.color}
                  stroke={theme.bg}
                  strokeWidth={2}
                  pointerEvents="none"
                />
              )
            })}
          </g>
        ))}

        {/* Y-axis label */}
        {yLabel && (
          <text
            x={-(height / 2)} y={12}
            transform="rotate(-90)"
            textAnchor="middle"
            fontSize={10}
            fill={theme.textFaint}
            fontFamily={theme.fontFamily}
          >
            {yLabel}
          </text>
        )}
      </svg>

      {/* Hover readout (HTML overlay for richer formatting) */}
      {hoverX !== null && (
        <div style={{
          position: 'absolute',
          left: Math.min(xCoord(hoverX) + 8, width - 140),
          top: padding.top,
          background: theme.bg,
          border: `1px solid ${theme.borderActive}`,
          borderRadius: theme.radiusSm,
          padding: '6px 10px',
          fontSize: 11,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          animation: 'fadeIn 100ms ease',
        }}>
          <div style={{ color: theme.text, fontWeight: 600, marginBottom: 4 }}>
            {points[hoverX].label}
          </div>
          {series.map((s, sIdx) => {
            const v = points[hoverX].values[sIdx]
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                <span style={{ color: theme.textDim }}>{s.label}</span>
                <span style={{ color: theme.text, fontFamily: theme.monoFamily, marginLeft: 'auto' }}>
                  {v === null ? '—' : v.toFixed(1)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Compact legend for a TrendChart. */
export function TrendLegend({ series }: { series: TrendSeries[] }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
      {series.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 16, height: 2, background: s.color }} />
          <span style={{ fontSize: 11, color: theme.textDim }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Convenience helper for the Tooltip variant used in legends. */
export function LegendTooltip({ children }: { children: React.ReactNode }) {
  return <Tooltip content={children}><span style={{ cursor: 'help' }}>ⓘ</span></Tooltip>
}
