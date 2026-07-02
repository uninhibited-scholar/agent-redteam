/**
 * Compare — side-by-side comparison of two scans with per-suite deltas.
 */
import { useState, useEffect } from 'react'
import { theme } from '../theme'
import type { HistoryItem, CompareResult, SuiteComparison } from '../types'

export function Compare() {
  const [scans, setScans] = useState<HistoryItem[]>([])
  const [runA, setRunA] = useState('')
  const [runB, setRunB] = useState('')
  const [result, setResult] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/history?limit=50')
      .then(r => r.json())
      .then(d => setScans(d.scans || []))
      .catch(() => {})
  }, [])

  const runCompare = async () => {
    if (!runA || !runB) { setError('Pick two scans to compare'); return }
    if (runA === runB) { setError('Pick two different scans'); return }
    setError(null); setLoading(true); setResult(null)
    try {
      const resp = await fetch(`/api/compare?run_a=${encodeURIComponent(runA)}&run_b=${encodeURIComponent(runB)}`)
      const data = await resp.json()
      if (!resp.ok) { setError(data.error || 'Compare failed'); setLoading(false); return }
      setResult(data)
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 880 }}>
      {/* Selectors */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-end',
        marginBottom: 24, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={labelStyle}>Scan A (baseline)</label>
          <select value={runA} onChange={e => setRunA(e.target.value)} style={selectStyle}>
            <option value="">— select —</option>
            {scans.map(s => (
              <option key={s.run_id} value={s.run_id}>
                {s.target_model} · {s.overall_score.toFixed(1)} · {s.run_id}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={labelStyle}>Scan B (newer)</label>
          <select value={runB} onChange={e => setRunB(e.target.value)} style={selectStyle}>
            <option value="">— select —</option>
            {scans.map(s => (
              <option key={s.run_id} value={s.run_id}>
                {s.target_model} · {s.overall_score.toFixed(1)} · {s.run_id}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={runCompare}
          disabled={loading}
          style={{
            padding: '10px 24px',
            background: theme.primary, color: theme.bg,
            border: 'none', borderRadius: theme.radius,
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Comparing...' : '⇄ Compare'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', marginBottom: 20,
          background: theme.danger + '15', border: `1px solid ${theme.danger}40`,
          borderRadius: theme.radius, fontSize: 13, color: theme.danger,
        }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Overall score card */}
          <div style={{
            display: 'flex', gap: 16, marginBottom: 24,
            flexWrap: 'wrap',
          }}>
            <ScoreCard label="A" model={result.model_a} score={result.score_a} />
            <DeltaCard delta={result.score_delta} />
            <ScoreCard label="B" model={result.model_b} score={result.score_b} />
          </div>

          {/* Per-suite deltas */}
          <div style={{
            background: theme.surface,
            borderRadius: theme.radius,
            border: `1px solid ${theme.border}`,
            padding: 24,
          }}>
            <h2 style={{
              fontSize: 14, fontWeight: 600, color: theme.primary,
              marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1,
            }}>
              Suite Deltas
            </h2>
            {result.suites.map(s => (
              <DeltaBar key={s.suite} suite={s} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ScoreCard({ label, model, score }: { label: string; model: string; score: number }) {
  const color = score >= 80 ? theme.success : score >= 50 ? theme.warning : theme.danger
  return (
    <div style={{
      flex: 1, minWidth: 180,
      background: theme.surface, border: `1px solid ${theme.border}`,
      borderRadius: theme.radius, padding: 20,
    }}>
      <div style={{
        fontSize: 11, color: theme.textFaint,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
      }}>
        Scan {label}
      </div>
      <div style={{
        fontFamily: theme.monoFamily, fontSize: 14, color: theme.textDim,
        marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {model}
      </div>
      <div style={{
        fontFamily: theme.monoFamily, fontSize: 32, fontWeight: 700, color,
      }}>
        {score.toFixed(1)}
      </div>
    </div>
  )
}

function DeltaCard({ delta }: { delta: number }) {
  const positive = delta > 0
  const neutral = delta === 0
  const color = neutral ? theme.textDim : positive ? theme.success : theme.danger
  return (
    <div style={{
      flex: 1, minWidth: 140,
      background: color + '12', border: `1px solid ${color}40`,
      borderRadius: theme.radius, padding: 20,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    }}>
      <div style={{
        fontSize: 11, color: theme.textFaint,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
      }}>
        Delta
      </div>
      <div style={{
        fontFamily: theme.monoFamily, fontSize: 36, fontWeight: 700, color,
      }}>
        {neutral ? '→' : positive ? '↑' : '↓'} {delta > 0 ? '+' : ''}{delta.toFixed(1)}
      </div>
      <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4 }}>
        {neutral ? 'no change' : positive ? 'improved' : 'regressed'}
      </div>
    </div>
  )
}

function DeltaBar({ suite }: { suite: SuiteComparison }) {
  const d = suite.delta
  const color = d === 0 ? theme.textDim : d > 0 ? theme.success : theme.danger
  // bar width relative to max 100; centre at 0, positive right, negative left
  const widthPct = Math.min(100, Math.abs(d))
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
          {suite.suite.replace(/_/g, ' ')}
        </span>
        <span style={{ fontFamily: theme.monoFamily, fontSize: 13, fontWeight: 700, color }}>
          {suite.score_a.toFixed(1)} → {suite.score_b.toFixed(1)}{'  '}
          ({d > 0 ? '+' : ''}{d.toFixed(1)})
        </span>
      </div>
      {/* diverging bar */}
      <div style={{
        position: 'relative', height: 8,
        background: theme.bg, borderRadius: 4,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
      }}>
        {/* centre line */}
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1,
          background: theme.borderActive,
        }} />
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          ...(d >= 0
            ? { left: '50%', width: `${widthPct / 2}%` }
            : { right: '50%', width: `${widthPct / 2}%` }),
          background: color, borderRadius: 4,
          transition: 'width 600ms ease',
        }} />
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: theme.textDim,
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
}
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: theme.bg, border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm, color: theme.text,
  fontSize: 12, fontFamily: theme.monoFamily,
  cursor: 'pointer',
}
