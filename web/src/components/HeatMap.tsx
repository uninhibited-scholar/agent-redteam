/**
 * HeatMap — suite × severity matrix showing vulnerability density.
 * Rows = suites, Columns = severity levels. Cell color intensity = count.
 *
 * Interactivity: hover a cell to see exact counts + pass rate; click to drill
 * into that suite×severity slice (caller supplies onCellClick).
 */
import { useState } from 'react'
import { theme } from '../theme'
import type { SampleResult } from '../types'
import { Tooltip } from './ui'

interface Props {
  samples: SampleResult[]
  onCellClick?: (suite: string, severity: string) => void
}

const SEVERITIES = ['critical', 'high', 'medium', 'low']

export function HeatMap({ samples, onCellClick }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const suites = [...new Set(samples.map(s => s.suite))].sort()

  // Build matrix: suite × severity → failed count
  const matrix: Record<string, Record<string, number>> = {}
  // Also keep totals for the tooltip (pass/fail/total per cell)
  const totals: Record<string, Record<string, { fail: number; pass: number; other: number }>> = {}
  for (const suite of suites) {
    matrix[suite] = {}
    totals[suite] = {}
    for (const sev of SEVERITIES) {
      const cellSamples = samples.filter(s => s.suite === suite && s.severity === sev)
      matrix[suite][sev] = cellSamples.filter(s => s.verdict === 'fail').length
      totals[suite][sev] = {
        fail: cellSamples.filter(s => s.verdict === 'fail').length,
        pass: cellSamples.filter(s => s.verdict === 'pass').length,
        other: cellSamples.filter(s => s.verdict !== 'fail' && s.verdict !== 'pass').length,
      }
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
                const cellKey = `${suite}:${sev}`
                const isHovered = hovered === cellKey
                const t = totals[suite][sev]
                const total = t.fail + t.pass + t.other
                return (
                  <td key={sev} style={{
                    padding: 0,
                    borderBottom: `1px solid ${theme.border}`,
                    textAlign: 'center',
                  }}>
                    <Tooltip
                      content={
                        <>
                          <strong style={{ color: (theme.severity as Record<string,string>)[sev] }}>
                            {suite.replace(/_/g, ' ')} · {sev}
                          </strong>
                          {total > 0 ? (
                            <>
                              {'\n'}失败 {t.fail} · 通过 {t.pass}{t.other > 0 ? ` · 其他 ${t.other}` : ''}
                              {'\n'}通过率 {((t.pass / Math.max(1, t.fail + t.pass)) * 100).toFixed(0)}%
                              {onCellClick && '\n点击查看样本'}
                            </>
                          ) : (
                            '\n无样本'
                          )}
                        </>
                      }
                    >
                      <div
                        onMouseEnter={() => setHovered(cellKey)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => total > 0 && onCellClick?.(suite, sev)}
                        style={{
                          width: 48, height: 36,
                          margin: '4px auto',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: cellColor(val),
                          borderRadius: theme.radiusSm,
                          fontFamily: theme.monoFamily,
                          fontSize: 13,
                          fontWeight: 600,
                          color: val > 0 ? '#fff' : theme.textFaint,
                          border: `1px solid ${val > 0 ? theme.danger + (isHovered ? '60' : '30') : theme.border}`,
                          cursor: total > 0 && onCellClick ? 'pointer' : 'default',
                          transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                          transition: 'transform 120ms ease, border-color 120ms',
                          boxShadow: isHovered && val > 0 ? `0 0 0 2px ${theme.danger}40` : 'none',
                        }}
                      >
                        {val || ''}
                      </div>
                    </Tooltip>
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
