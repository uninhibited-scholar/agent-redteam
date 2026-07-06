/**
 * DonutChart — segmented ring showing proportional breakdown.
 * Pure SVG, zero deps. Each segment is an arc computed via stroke-dasharray.
 *
 * Use cases: verdict distribution (pass/fail/error), severity split, suite share.
 * Hover a segment to see label + value + percentage; click to drill.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { Tooltip } from './ui'

export interface DonutSegment {
  label: string
  value: number
  color: string
  /** Optional detail shown in the tooltip (e.g. absolute counts). */
  detail?: string
}

interface Props {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string | number
  onSegmentClick?: (seg: DonutSegment) => void
}

export function DonutChart({
  segments, size = 180, thickness = 22,
  centerLabel, centerValue, onSegmentClick,
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const radius = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * radius

  // Build cumulative offsets so segments sit edge-to-edge
  let cumulative = 0
  const arcs = segments.map((seg, i) => {
    const fraction = total > 0 ? seg.value / total : 0
    const dash = fraction * circumference
    const offset = circumference - cumulative
    cumulative += dash
    return { seg, dash, offset, fraction, index: i }
  })

  // Small gap between segments for visual separation
  const gap = segments.length > 1 ? Math.min(2, circumference * 0.004) : 0

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={theme.surface}
          strokeWidth={thickness}
        />
        {/* Segments */}
        {total > 0 && arcs.map(({ seg, dash, offset, index }) => (
          <Tooltip
            key={seg.label}
            content={
              <>
                <strong style={{ color: seg.color }}>{seg.label}</strong>
                {'\n' + seg.value + (total ? ` (${(100 * seg.value / total).toFixed(1)}%)` : '')}
                {seg.detail && '\n' + seg.detail}
                {onSegmentClick && '\n点击查看'}
              </>
            }
          >
            <circle
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={hovered === index ? thickness + 4 : thickness}
              strokeDasharray={`${Math.max(0, dash - gap)} ${circumference}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{
                transition: 'stroke-width 180ms ease',
                cursor: onSegmentClick ? 'pointer' : 'default',
                opacity: hovered === null || hovered === index ? 1 : 0.4,
              }}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSegmentClick?.(seg)}
            />
          </Tooltip>
        ))}
      </svg>
      {/* Center readout */}
      {(centerValue !== undefined || centerLabel) && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          {hovered !== null && arcs[hovered] ? (
            <>
              <span style={{
                fontFamily: theme.monoFamily, fontSize: size * 0.13, fontWeight: 700,
                color: arcs[hovered].seg.color,
              }}>
                {arcs[hovered].seg.value}
              </span>
              <span style={{ fontSize: 10, color: theme.textDim, marginTop: 2 }}>
                {arcs[hovered].seg.label}
              </span>
              <span style={{ fontSize: 11, color: theme.textFaint }}>
                {(arcs[hovered].fraction * 100).toFixed(1)}%
              </span>
            </>
          ) : (
            <>
              {centerValue !== undefined && (
                <span style={{
                  fontFamily: theme.monoFamily, fontSize: size * 0.18, fontWeight: 700,
                  color: theme.text,
                }}>
                  {centerValue}
                </span>
              )}
              {centerLabel && (
                <span style={{ fontSize: 11, color: theme.textDim, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {centerLabel}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Compact legend row for a DonutChart. */
export function DonutLegend({ segments, onSelect }: {
  segments: DonutSegment[]
  onSelect?: (seg: DonutSegment) => void
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {segments.map(seg => (
        <div
          key={seg.label}
          onClick={() => onSelect?.(seg)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 6px', borderRadius: theme.radiusSm,
            cursor: onSelect ? 'pointer' : 'default',
            transition: theme.transition,
          }}
          onMouseEnter={e => { if (onSelect) e.currentTarget.style.background = theme.surfaceHover }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: theme.text }}>{seg.label}</span>
          <span style={{ fontSize: 12, color: theme.textDim, fontFamily: theme.monoFamily }}>{seg.value}</span>
          <span style={{ fontSize: 11, color: theme.textFaint, minWidth: 44, textAlign: 'right' }}>
            {total ? (100 * seg.value / total).toFixed(0) : 0}%
          </span>
        </div>
      ))}
    </div>
  )
}
