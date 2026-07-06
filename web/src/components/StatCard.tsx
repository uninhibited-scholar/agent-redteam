/**
 * StatCard — dense stat tile: value + label + optional trend delta +
 * optional mini sparkline. Used on Overview summary and Metrics page.
 * Purely presentational, richer than SummaryTiles.
 */
import { useState } from 'react'
import { theme } from '../theme'

interface StatCardProps {
  /** 标签，如"总样本数""失败数" */
  label: string
  /** 主数值 */
  value: number | string
  /** 可选：上次扫描的值（用于计算 delta） */
  previousValue?: number
  /** 可选：迷你 sparkline 数据点 */
  sparkline?: number[]
  /** 可选：数值后缀，如"%" "分" */
  suffix?: string
  /** 可选：图标（emoji 或字符） */
  icon?: string
  /** 可选：自定义主色（默认 theme.primary） */
  color?: string
  /** 可选：点击回调 */
  onClick?: () => void
  /** 趋势方向偏好：默认根据 delta 自动判断。
   *  'higher-is-better'（默认）：delta>0 绿色
   *  'lower-is-better'：delta<0 绿色（如失败数减少是好事） */
  trendDirection?: 'higher-is-better' | 'lower-is-better'
}

function sparklinePath(points: number[], width: number, height: number): string {
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = width / (points.length - 1)
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${i * step},${height - ((p - min) / range) * height}`)
    .join(' ')
}

export function StatCard({
  label, value, previousValue, sparkline, suffix, icon, color, onClick, trendDirection = 'higher-is-better',
}: StatCardProps) {
  const [hovered, setHovered] = useState(false)
  const accent = color || theme.primary
  const isNumeric = typeof value === 'number'
  const delta = isNumeric && previousValue !== undefined ? value - previousValue : undefined

  let deltaColor: string = theme.textDim
  let deltaArrow = '→'
  if (delta !== undefined) {
    if (delta === 0) {
      deltaColor = theme.textDim
      deltaArrow = '→'
    } else {
      const better = trendDirection === 'higher-is-better' ? delta > 0 : delta < 0
      deltaColor = better ? theme.success : theme.danger
      deltaArrow = delta > 0 ? '↑' : '↓'
    }
  }

  const showSparkline = isNumeric && sparkline && sparkline.length >= 2

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? theme.surfaceHover : theme.surface,
        border: `1px solid ${hovered ? accent : theme.border}`,
        borderRadius: theme.radius,
        padding: '14px 16px',
        transition: theme.transition,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        <span style={{
          fontSize: 10, color: theme.textDim, textTransform: 'uppercase',
          letterSpacing: 0.5, marginLeft: icon ? 'auto' : 0,
        }}>
          {label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: accent, fontFamily: theme.monoFamily }}>
          {value}
        </span>
        {suffix && <span style={{ fontSize: 13, color: theme.textFaint }}>{suffix}</span>}
      </div>

      {isNumeric && previousValue !== undefined && (
        <div style={{ fontSize: 11, color: deltaColor, marginTop: 6, fontFamily: theme.monoFamily }}>
          {delta === 0 ? `${deltaArrow} 持平` : `${deltaArrow} ${Math.abs(delta as number)}`}
        </div>
      )}

      {showSparkline && (
        <svg width={60} height={20} style={{ marginTop: 8, display: 'block' }}>
          <path
            d={sparklinePath(sparkline as number[], 60, 20)}
            fill="none"
            stroke={accent}
            strokeWidth={1.5}
          />
        </svg>
      )}
    </div>
  )
}
