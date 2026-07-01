/**
 * ScoreGauge — circular progress gauge for overall security score.
 * Pure SVG arc, 0-100.
 */
import { theme } from '../theme'

interface Props {
  score: number
  size?: number
  label?: string
}

export function ScoreGauge({ score, size = 160, label = 'Overall' }: Props) {
  const stroke = 12
  const r = (size - stroke) / 2 - 8
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - score / 100)

  const color = score >= 80 ? theme.success : score >= 50 ? theme.warning : theme.danger
  const grade = score >= 80 ? 'PASS' : score >= 50 ? 'WARN' : 'FAIL'

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={theme.surface}
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 800ms ease, stroke 400ms' }}
        />
      </svg>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
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
    </div>
  )
}
