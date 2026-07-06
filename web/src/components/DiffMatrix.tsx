/**
 * DiffMatrix — heatmap-style matrix comparing two scans across suites.
 * Each cell shows the score delta with color encoding (green=better, red=worse).
 *
 * Use cases: model-vs-model regression analysis, before/after hardening.
 */
import { theme } from '../theme'
import { Tooltip } from './ui'

export interface DiffRow {
  label: string
  /** Value in scan A (baseline). */
  a: number
  /** Value in scan B (newer). */
  b: number
}

interface Props {
  rows: DiffRow[]
  /** Column headers for A and B. */
  headerA?: string
  headerB?: string
}

export function DiffMatrix({ rows, headerA = 'Scan A', headerB = 'Scan B' }: Props) {
  const maxAbsDelta = Math.max(1, ...rows.map(r => Math.abs(r.a - r.b)))

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <Th align="left">Suite</Th>
            <Th align="right">{headerA}</Th>
            <Th align="right">{headerB}</Th>
            <Th align="center">Δ</Th>
            <Th align="center">变化</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const delta = row.b - row.a
            const improved = delta > 0
            const regressed = delta < 0
            const color = improved ? theme.success : regressed ? theme.danger : theme.textDim
            const intensity = Math.abs(delta) / maxAbsDelta
            return (
              <tr key={row.label}>
                <td style={cellStyle}>
                  <span style={{ color: theme.text, fontSize: 12 }}>{row.label.replace(/_/g, ' ')}</span>
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: theme.monoFamily, color: scoreColor(row.a) }}>
                  {row.a.toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: theme.monoFamily, color: scoreColor(row.b) }}>
                  {row.b.toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', fontFamily: theme.monoFamily, fontWeight: 700, color }}>
                  {improved ? '↑' : regressed ? '↓' : '→'} {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <Tooltip content={`${row.label}: ${row.a.toFixed(1)} → ${row.b.toFixed(1)}`}>
                    <span style={{
                      display: 'inline-block', width: 48, height: 16, borderRadius: 3,
                      background: color + Math.round(intensity * 200 + 30).toString(16).padStart(2, '0'),
                      border: `1px solid ${color}60`,
                    }} />
                  </Tooltip>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function scoreColor(s: number) {
  return s >= 80 ? theme.success : s >= 50 ? theme.warning : theme.danger
}

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
  borderBottom: `1px solid ${theme.border}`,
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' | 'center' }) {
  return (
    <th style={{
      padding: '8px 12px',
      textAlign: align,
      fontSize: 10, fontWeight: 700, color: theme.textFaint,
      borderBottom: `1px solid ${theme.border}`,
      textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {children}
    </th>
  )
}
