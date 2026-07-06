import { useState } from 'react'
import { theme } from '../theme'

interface StatSparklineProps {
  /** Y 值序列，按时间顺序。至少 2 个点才画线，1 个点画圆点，0 个画占位 */
  values: number[]
  /** 宽度，默认 120 */
  width?: number
  /** 高度，默认 32 */
  height?: number
  /** 线条颜色，默认 theme.primary */
  color?: string
  /** 是否填充线下区域（淡色渐变），默认 true */
  fill?: boolean
  /** 是否在右端显示最新值的数字，默认 false */
  showLast?: boolean
  /** 值域。不传则自动用 min/max。传入则固定（多个 sparkline 对齐用） */
  domain?: [number, number]
  /** 点击回调（可选） */
  onClick?: () => void
}

export function StatSparkline({
  values, width = 120, height = 32, color, fill = true,
  showLast = false, domain, onClick,
}: StatSparklineProps) {
  const [hover, setHover] = useState(false)

  if (values.length === 0) {
    return (
      <span style={{ color: theme.textFaint, fontFamily: theme.monoFamily, fontSize: 12 }}>—</span>
    )
  }

  const trendColor = color ?? (
    values[values.length - 1] > values[0] ? theme.success :
    values[values.length - 1] < values[0] ? theme.danger :
    theme.primary
  )

  const pad = 2
  const [dMin, dMax] = domain ?? [Math.min(...values), Math.max(...values)]
  const span = dMax - dMin || 1

  const coords = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * width : width / 2
    const y = dMax === dMin
      ? height / 2
      : pad + (1 - (v - dMin) / span) * (height - pad * 2)
    return [x, y] as const
  })

  const last = values[values.length - 1]
  const svgWidth = showLast ? width + 32 : width

  return (
    <svg
      width={svgWidth}
      height={height}
      viewBox={`0 0 ${svgWidth} ${height}`}
      onClick={onClick}
      onMouseEnter={() => onClick && setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        opacity: hover ? 0.75 : 1,
        transition: 'opacity 120ms ease',
      }}
    >
      {values.length === 1 ? (
        <circle cx={coords[0][0]} cy={coords[0][1]} r={2} fill={trendColor} />
      ) : (
        <>
          {fill && (
            <path
              d={`M${coords[0][0]},${height} ` +
                coords.map(([x, y]) => `L${x},${y}`).join(' ') +
                ` L${coords[coords.length - 1][0]},${height} Z`}
              fill={`${trendColor}20`}
              stroke="none"
            />
          )}
          <polyline
            points={coords.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke={trendColor}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={coords[coords.length - 1][0]}
            cy={coords[coords.length - 1][1]}
            r={2}
            fill={trendColor}
          />
        </>
      )}
      {showLast && (
        <text
          x={width + 6}
          y={height / 2 + 3}
          fontSize={10}
          fontFamily={theme.monoFamily}
          fill={theme.textDim}
        >
          {last.toFixed(1)}
        </text>
      )}
    </svg>
  )
}
