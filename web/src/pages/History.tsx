/**
 * History — list of past scans; click a row to load it into Overview/Findings.
 */
import { useState, useEffect } from 'react'
import { theme } from '../theme'
import type { HistoryItem } from '../types'

interface Props {
  onLoad: (runId: string) => void
}

export function History({ onLoad }: Props) {
  const [scans, setScans] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/history?limit=50')
      .then(r => r.json())
      .then(d => { setScans(d.scans || []); setLoading(false) })
      .catch(() => { setError('Failed to load history'); setLoading(false) })
  }, [])

  const scoreColor = (s: number) =>
    s >= 80 ? theme.success : s >= 50 ? theme.warning : theme.danger

  if (loading) {
    return <div style={{ padding: 80, textAlign: 'center', color: theme.textFaint }}>Loading...</div>
  }
  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: theme.danger }}>{error}</div>
  }

  return (
    <div>
      {scans.length === 0 ? (
        <div style={{
          textAlign: 'center', color: theme.textFaint, padding: 80,
        }}>
          <p style={{ fontSize: 16, marginBottom: 8, color: theme.textDim }}>No scans yet</p>
          <p style={{ fontSize: 13 }}>
            Launch a scan from the <span style={{ color: theme.primary }}>⚡</span> tab.
          </p>
        </div>
      ) : (
        <div style={{
          background: theme.surface,
          borderRadius: theme.radius,
          border: `1px solid ${theme.border}`,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2.2fr 1.4fr 0.8fr 1fr 1.2fr',
            padding: '12px 20px',
            background: theme.surfaceActive,
            fontSize: 10, fontWeight: 700,
            color: theme.textFaint,
            textTransform: 'uppercase', letterSpacing: 1,
            borderBottom: `1px solid ${theme.border}`,
          }}>
            <span>Run ID</span>
            <span>Model</span>
            <span style={{ textAlign: 'right' }}>Score</span>
            <span style={{ textAlign: 'right' }}>Pass/Fail</span>
            <span>Date</span>
          </div>
          {/* Rows */}
          {scans.map((s, i) => (
            <button
              key={s.run_id}
              onClick={() => onLoad(s.run_id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '2.2fr 1.4fr 0.8fr 1fr 1.2fr',
                alignItems: 'center',
                padding: '12px 20px',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderBottom: i < scans.length - 1 ? `1px solid ${theme.border}` : 'none',
                color: theme.text,
                fontSize: 12,
                fontFamily: theme.monoFamily,
                cursor: 'pointer',
                transition: theme.transition,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = theme.surfaceHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: theme.primary, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.run_id}
              </span>
              <span style={{ color: theme.textDim }}>{s.target_model}</span>
              <span style={{
                textAlign: 'right', fontWeight: 700,
                color: scoreColor(s.overall_score),
              }}>
                {s.overall_score.toFixed(1)}
              </span>
              <span style={{ textAlign: 'right' }}>
                <span style={{ color: theme.success }}>{s.total_passed}</span>
                <span style={{ color: theme.textFaint }}> / </span>
                <span style={{ color: theme.danger }}>{s.total_failed}</span>
              </span>
              <span style={{ color: theme.textFaint }}>{s.created_at}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
