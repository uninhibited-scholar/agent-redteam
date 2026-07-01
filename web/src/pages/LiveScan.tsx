/**
 * LiveScan — real-time scan telemetry with WebSocket.
 */
import { useState, useEffect, useRef } from 'react'
import { theme } from '../theme'
import type { SampleResult, SuiteResult } from '../types'
import { TelemetryStream } from '../components/TelemetryStream'
import { SuiteBar } from '../components/SuiteBar'

export function LiveScan() {
  const [connected, setConnected] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [events, setEvents] = useState<SampleResult[]>([])
  const [suiteResults, setSuiteResults] = useState<Record<string, SuiteResult>>({})
  const [totalPass, setTotalPass] = useState(0)
  const [totalFail, setTotalFail] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:7878/ws')
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'sample_result') {
        const s = msg.data as SampleResult
        setEvents(prev => [...prev, s])
        if (s.verdict === 'pass') setTotalPass(p => p + 1)
        else if (s.verdict === 'fail') setTotalFail(f => f + 1)

        // Update suite running score
        setSuiteResults(prev => {
          const key = s.suite
          const existing = prev[key] || { name: key, total: 0, passed: 0, failed: 0, errors: 0, skipped: 0, score: 0, owasp: s.owasp }
          existing.total += 1
          if (s.verdict === 'pass') existing.passed += 1
          else if (s.verdict === 'fail') existing.failed += 1
          else existing.errors += 1
          const judged = existing.passed + existing.failed
          existing.score = judged > 0 ? 100 * existing.passed / judged : 0
          return { ...prev, [key]: existing }
        })
      } else if (msg.type === 'scan_started') {
        setScanning(true)
        setEvents([])
        setTotalPass(0)
        setTotalFail(0)
        setSuiteResults({})
      } else if (msg.type === 'scan_done') {
        setScanning(false)
      }
    }

    return () => ws.close()
  }, [])

  const overallScore = (() => {
    const judged = totalPass + totalFail
    return judged > 0 ? (100 * totalPass / judged) : 0
  })()

  return (
    <div>
      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        marginBottom: 24,
        padding: '12px 20px',
        background: theme.surface,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: connected ? (scanning ? theme.warning : theme.success) : theme.danger,
          animation: scanning ? 'pulse 1s ease infinite' : 'none',
        }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
          {scanning ? 'SCANNING...' : connected ? 'Connected — Ready' : 'Disconnected'}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: theme.monoFamily,
          fontSize: 20, fontWeight: 700,
          color: overallScore >= 80 ? theme.success : overallScore >= 50 ? theme.warning : theme.danger,
        }}>
          {overallScore.toFixed(1)}
        </span>
        <span style={{ fontSize: 12, color: theme.textDim }}>
          {totalPass + totalFail} samples
        </span>
      </div>

      {/* Live suite scores */}
      {Object.keys(suiteResults).length > 0 && (
        <div style={{
          background: theme.surface,
          borderRadius: theme.radius,
          border: `1px solid ${theme.border}`,
          padding: 24,
          marginBottom: 24,
        }}>
          <h2 style={{
            fontSize: 14, fontWeight: 600, color: theme.primary,
            marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1,
          }}>
            Live Suite Scores
          </h2>
          {Object.values(suiteResults).map(s => (
            <SuiteBar key={s.name} suite={s as SuiteResult} />
          ))}
        </div>
      )}

      {/* Telemetry stream */}
      <div style={{
        background: theme.surface,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        padding: 24,
      }}>
        <h2 style={{
          fontSize: 14, fontWeight: 600, color: theme.primary,
          marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1,
        }}>
          Attack Telemetry
        </h2>
        <TelemetryStream events={events} maxHeight={500} />
      </div>
    </div>
  )
}
