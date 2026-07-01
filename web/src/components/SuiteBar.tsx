/**
 * SuiteBar — horizontal progress bar for a single suite score.
 */
import { theme } from '../theme'
import type { SuiteResult } from '../types'

interface Props {
  suite: SuiteResult
}

export function SuiteBar({ suite }: Props) {
  const color = suite.score >= 80 ? theme.success : suite.score >= 50 ? theme.warning : theme.danger
  const suiteColor = (theme.suites as Record<string, string>)[suite.name] || theme.primary

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 600,
          color: theme.text,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: suiteColor,
          }} />
          {suite.name.replace(/_/g, ' ')}
          <span style={{
            fontSize: 10, color: theme.primary,
            fontFamily: theme.monoFamily,
            background: theme.primary + '15',
            padding: '1px 5px', borderRadius: 3,
          }}>
            {suite.owasp || ''}
          </span>
        </span>
        <span style={{
          fontFamily: theme.monoFamily,
          fontSize: 14, fontWeight: 700,
          color,
        }}>
          {suite.score.toFixed(1)}
        </span>
      </div>
      <div style={{
        height: 8,
        background: theme.surface,
        borderRadius: 4,
        overflow: 'hidden',
        border: `1px solid ${theme.border}`,
      }}>
        <div style={{
          width: `${suite.score}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${suiteColor}80, ${color})`,
          borderRadius: 4,
          transition: 'width 800ms ease',
        }} />
      </div>
      <div style={{
        display: 'flex', gap: 12, marginTop: 4,
        fontSize: 11, color: theme.textFaint,
      }}>
        <span>pass: {suite.passed}</span>
        <span>fail: {suite.failed}</span>
        {suite.errors > 0 && <span style={{ color: theme.warning }}>err: {suite.errors}</span>}
        <span>total: {suite.total}</span>
      </div>
    </div>
  )
}
