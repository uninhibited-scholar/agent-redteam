/**
 * ScoreBadge — compact pill showing a 0-100 safety score with color
 * rating and letter grade. Reused across History, suite cards, compare tables.
 */
import { theme } from '../theme'

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showGrade?: boolean
  showVerdict?: boolean
  label?: string
}

export function scoreToGrade(score: number): Grade {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}

const sizeMap = {
  sm: { fontSize: 13, padding: '2px 8px', gradeFontSize: 10 },
  md: { fontSize: 18, padding: '4px 12px', gradeFontSize: 13 },
  lg: { fontSize: 28, padding: '8px 16px', gradeFontSize: 18 },
}

export function ScoreBadge({ score, size = 'md', showGrade = true, showVerdict = false, label }: ScoreBadgeProps) {
  const { fontSize, padding, gradeFontSize } = sizeMap[size]

  if (score < 0) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: theme.textFaint, background: theme.textFaint + '15',
        border: `1px solid ${theme.textFaint}60`, borderRadius: theme.radiusSm,
        padding, fontFamily: theme.monoFamily, fontSize,
      }}>
        N/A
      </span>
    )
  }

  const clamped = Math.min(100, score)
  const color = clamped >= 80 ? theme.success : clamped >= 50 ? theme.warning : theme.danger
  const grade = scoreToGrade(clamped)
  const verdictText = label ?? (clamped < 50 ? 'FAIL' : clamped >= 80 ? 'PASS' : undefined)
  const verdictColor = clamped < 50 ? theme.danger : theme.success

  return (
    <span style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      color, background: color + '15', border: `1px solid ${color}60`,
      borderRadius: theme.radiusSm, padding,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: theme.monoFamily, fontSize, fontWeight: 700 }}>
          {clamped.toFixed(1)}
        </span>
        {showGrade && (
          <span style={{ fontFamily: theme.fontFamily, fontSize: gradeFontSize, fontWeight: 600 }}>
            {grade}
          </span>
        )}
      </span>
      {showVerdict && verdictText && (
        <span style={{
          fontSize: gradeFontSize - 2, fontWeight: 700, letterSpacing: 0.5,
          color: verdictColor, fontFamily: theme.fontFamily,
        }}>
          {verdictText}
        </span>
      )}
    </span>
  )
}
