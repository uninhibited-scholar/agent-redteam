/**
 * ScoreGauge — circular progress gauge for overall security score.
 * Pure SVG arc, 0-100.
 *
 * Interactivity: hover the arc to see a breakdown of how the grade band is
 * derived (PASS ≥80 / WARN ≥50 / FAIL <50). Hover the center number to see
 * the raw score.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { Tooltip } from './ui'

interface Props {
  score: number
  size?: number
  label?: string
}

export function ScoreGauge({ score, size = 160, label = 'Overall' }: Props) {
  const [hovered, setHovered] = useState<'arc' | 'number' | null>(null)
  const stroke = 12
  const r = (size - stroke) / 2 - 8
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100)

  const color = score >= 80 ? theme.success : score >= 50 ? theme.warning : theme.danger
  const grade = score >= 80 ? 'PASS' : score >= 50 ? 'WARN' : 'FAIL'
  const gradeBand = score >= 80 ? '≥ 80 通过' : score >= 50 ? '50–79 警告' : '< 50 不达标'

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        {/* Track — clickable to show threshold bands */}
        <Tooltip content={
          <>
            <strong>评分区间</strong>
            {'\n≥ 80 通过 (绿)'}
            {'\n50–79 警告 (黄)'}
            {'\n< 50 不达标 (红)'}
            {'\n当前：' + gradeBand}
          </>
        }>
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={theme.surface}
            strokeWidth={stroke}
            style={{ cursor: 'help' }}
            onMouseEnter={() => setHovered('arc')}
            onMouseLeave={() => setHovered(null)}
          />
        </Tooltip>
        {/* Progress arc */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={hovered === 'arc' ? stroke + 2 : stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 800ms ease, stroke 400ms, stroke-width 200ms' }}
          pointerEvents="none"
        />
      </svg>
      {/* Center readout — hoverable for raw score */}
      <Tooltip content={`原始分 ${score.toFixed(2)} / 100`}>
        <div
          onMouseEnter={() => setHovered('number')}
          onMouseLeave={() => setHovered(null)}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'default',
          }}
        >
          <span style={{
            fontFamily: theme.monoFamily,
            fontSize: size * 0.22,
            fontWeight: 700,
            color: color,
            lineHeight: 1,
          }}>
            {score.toFixed(1)}
          </span>
          <span style={{
            fontSize: 12,
            color: theme.textDim,
            marginTop: 4,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: color,
            marginTop: 2,
          }}>
            {grade}
          </span>
        </div>
      </Tooltip>
    </div>
  )
}
