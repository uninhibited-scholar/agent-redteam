/**
 * HeatMap — suite × severity matrix showing vulnerability density.
 * Rows = suites, Columns = severity levels. Cell color intensity = count.
 */
import { theme } from '../theme'
import type { SampleResult } from '../types'

interface Props {
  samples: SampleResult[]
}

const SEVERITIES = ['critical', 'high', 'medium', 'low']

export function HeatMap({ samples }: Props) {
  const suites = [...new Set(samples.map(s => s.suite))].sort()

  // Build matrix: suite × severity → failed count
  const matrix: Record<string, Record<string, number>> = {}
  for (const suite of suites) {
    matrix[suite] = {}
    for (const sev of SEVERITIES) {
      matrix[suite][sev] = samples.filter(
        s => s.suite === suite && s.severity === sev && s.verdict === 'fail'
      ).length
    }
  }

  const maxVal = Math.max(1, ...Object.values(matrix).flatMap(m => Object.values(m)))

  const cellColor = (val: number) => {
    if (val === 0) return theme.surface
    const intensity = val / maxVal
    return `rgba(255, 23, 68, ${0.15 + intensity * 0.7})`
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{
              textAlign: 'left', padding: '8px 12px',
              fontSize: 11, color: theme.textFaint,
              borderBottom: `1px solid ${theme.border}`,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              Suite
            </th>
            {SEVERITIES.map(sev => (
              <th key={sev} style={{
                padding: '8px 12px',
                fontSize: 11, color: (theme.severity as Record<string,string>)[sev],
                borderBottom: `1px solid ${theme.border}`,
                textTransform: 'uppercase', letterSpacing: 0.5,
                textAlign: 'center',
              }}>
                {sev}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {suites.map(suite => (
            <tr key={suite}>
              <td style={{
                padding: '10px 12px',
                fontSize: 12, color: theme.text,
                fontWeight: 500,
                borderBottom: `1px solid ${theme.border}`,
              }}>
                {suite.replace(/_/g, ' ')}
              </td>
              {SEVERITIES.map(sev => {
                const val = matrix[suite][sev]
                return (
                  <td key={sev} style={{
                    padding: 0,
                    borderBottom: `1px solid ${theme.border}`,
                    textAlign: 'center',
                  }}>
                    <div style={{
                      width: 48, height: 36,
                      margin: '4px auto',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: cellColor(val),
                      borderRadius: theme.radiusSm,
                      fontFamily: theme.monoFamily,
                      fontSize: 13,
                      fontWeight: 600,
                      color: val > 0 ? '#fff' : theme.textFaint,
                      border: `1px solid ${val > 0 ? theme.danger + '30' : theme.border}`,
                    }}>
                      {val || ''}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
