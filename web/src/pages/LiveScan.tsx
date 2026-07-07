/**
 * LiveScan — real-time scan telemetry with WebSocket.
 *
 * Enhanced: progress bar with ETA, per-suite live cards, running throughput,
 * rolling verdict mini-donut, and a richer telemetry stream.
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { theme } from '../theme'
import type { SampleResult } from '../types'
import { TelemetryStream } from '../components/TelemetryStream'
import { DonutChart, type DonutSegment } from '../components/DonutChart'
import { ConnectionStatus } from '../components/ConnectionStatus'
import { LiveMetricOverlay } from '../components/LiveMetricOverlay'
import { ScanLogViewer } from '../components/ScanLogViewer'
import { Panel } from '../components/ui'

interface SuiteProgress {
  name: string
  total: number
  passed: number
  failed: number
  errors: number
  score: number
  owasp: string
  /** Latest few samples for a mini timeline. */
  recent: ('pass' | 'fail' | 'error')[]
}

export function LiveScan() {
  const [connected, setConnected] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [events, setEvents] = useState<SampleResult[]>([])
  const [suites, setSuites] = useState<Record<string, SuiteProgress>>({})
  const [suiteOrder, setSuiteOrder] = useState<string[]>([])
  const [totalExpected, setTotalExpected] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [scanDone, setScanDone] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  // Rolling throughput tracking
  const [recentTimestamps, setRecentTimestamps] = useState<number[]>([])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onmessage = (ev) => {
      let msg: { type?: string; data?: SampleResult & { suites?: string[] } }
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return  // ignore non-JSON frames
      }
      if (msg.type === 'scan_started') {
        setScanning(true); setScanDone(false)
        setEvents([]); setSuites([] as unknown as Record<string, SuiteProgress>)
        setSuiteOrder([])
        setTotalExpected(0)
        setStartedAt(Date.now())
        const suiteCount = msg.data?.suites?.length || 0
        if (suiteCount) setTotalExpected(suiteCount * 200)
      } else if (msg.type === 'scan_done') {
        setScanning(false); setScanDone(true)
      } else if (msg.type === 'scan_failed') {
        setScanning(false)
      } else if (msg.type === 'sample_result' && msg.data) {
        const s = msg.data
        // Guard against malformed payloads missing required fields.
        if (typeof s.suite !== 'string' || typeof s.verdict !== 'string') return
        const now = Date.now()
        setEvents(prev => [...prev.slice(-499), s])  // cap at 500
        setRecentTimestamps(prev => [...prev.slice(-59), now])

        setSuites(prev => {
          const existing = prev[s.suite] || {
            name: s.suite, total: 0, passed: 0, failed: 0, errors: 0, score: 0,
            owasp: s.owasp, recent: [],
          }
          existing.total += 1
          if (s.verdict === 'pass') existing.passed += 1
          else if (s.verdict === 'fail') existing.failed += 1
          else existing.errors += 1
          const judged = existing.passed + existing.failed
          existing.score = judged > 0 ? 100 * existing.passed / judged : 0
          existing.recent = [...existing.recent, s.verdict as ('pass'|'fail'|'error')].slice(-12)
          return { ...prev, [s.suite]: existing }
        })
        setSuiteOrder(prev => prev.includes(s.suite) ? prev : [...prev, s.suite])
      }
    }

    return () => ws.close()
  }, [])

  const totalPass = useMemo(() => Object.values(suites).reduce((s, x) => s + x.passed, 0), [suites])
  const totalFail = useMemo(() => Object.values(suites).reduce((s, x) => s + x.failed, 0), [suites])
  const totalError = useMemo(() => Object.values(suites).reduce((s, x) => s + x.errors, 0), [suites])
  const processed = totalPass + totalFail + totalError

  const overallScore = (() => {
    const judged = totalPass + totalFail
    return judged > 0 ? (100 * totalPass / judged) : 0
  })()

  const progressPct = totalExpected > 0 ? Math.min(100, (processed / totalExpected) * 100) : 0

  // ETA calculation based on rolling throughput (samples/min)
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0
  const throughput = recentTimestamps.length > 1 && elapsed > 2
    ? (recentTimestamps.length / Math.max(1, (recentTimestamps[recentTimestamps.length - 1] - recentTimestamps[0]) / 1000)) * 60
    : 0
  const remaining = totalExpected > processed ? totalExpected - processed : 0
  const etaSeconds = throughput > 0 ? (remaining / throughput) * 60 : 0

  // Live verdict donut
  const verdictSegs: DonutSegment[] = [
    { label: '通过', value: totalPass, color: theme.success },
    { label: '失败', value: totalFail, color: theme.danger },
    { label: '错误', value: totalError, color: theme.warning },
  ].filter(s => s.value > 0)

  return (
    <div>
      {/* Status bar */}
      <Panel padding="14px 20px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ConnectionStatus
            status={connected ? (scanning ? 'connected' : 'connected') : 'disconnected'}
            lastMessageAt={events.length > 0 ? recentTimestamps[recentTimestamps.length - 1] : undefined}
            onReconnect={() => {
              wsRef.current?.close()
              // effect cleanup will re-create on next render cycle
              setTimeout(() => window.location.reload(), 200)
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
            {scanning ? '扫描中…' : scanDone ? '扫描完成' : ''}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{
            fontFamily: theme.monoFamily, fontSize: 20, fontWeight: 700,
            color: overallScore >= 80 ? theme.success : overallScore >= 50 ? theme.warning : theme.danger,
          }}>
            {overallScore.toFixed(1)}
          </span>
          <span style={{ fontSize: 12, color: theme.textDim }}>{processed} samples</span>
        </div>

        {/* Live metric overlay during scan */}
        {scanning && startedAt && totalExpected > 0 && (
          <div style={{ marginTop: 14 }}>
            <LiveMetricOverlay
              completedSamples={events}
              totalPlanned={totalExpected}
              startedAt={startedAt}
              scanning={scanning}
            />
          </div>
        )}

        {/* Progress bar */}
        {(scanning || scanDone) && totalExpected > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: theme.textFaint }}>
                {processed} / {totalExpected}（{progressPct.toFixed(1)}%）
              </span>
              <span style={{ fontSize: 11, color: theme.textFaint }}>
                {scanning && throughput > 0 && `${throughput.toFixed(1)} 样本/分 · `}
                {scanning && etaSeconds > 0 && `预计剩余 ${formatDuration(etaSeconds)}`}
                {scanDone && `耗时 ${formatDuration(elapsed)}`}
              </span>
            </div>
            <div style={{ height: 6, background: theme.bg, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progressPct}%`,
                background: `linear-gradient(90deg, ${theme.primary}, ${theme.primaryDim})`,
                transition: 'width 400ms ease',
                borderRadius: 3,
              }} />
            </div>
          </div>
        )}
      </Panel>

      {/* Top row: live donut + suite cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, marginTop: 20, alignItems: 'start' }}>
        {/* Live donut */}
        {processed > 0 && (
          <Panel title="实时判定" padding={20}>
            <DonutChart
              segments={verdictSegs}
              size={140}
              centerValue={overallScore.toFixed(0)}
              centerLabel="score"
            />
          </Panel>
        )}

        {/* Suite cards */}
        {suiteOrder.length > 0 && (
          <Panel title="套件进度" subtitle={`${suiteOrder.length} 个套件`} padding={20}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {suiteOrder.map(name => {
                const s = suites[name]
                if (!s) return null
                const scoreColor = s.score >= 80 ? theme.success : s.score >= 50 ? theme.warning : theme.danger
                return (
                  <div key={name} style={{
                    padding: 12, borderRadius: theme.radius,
                    background: theme.bg, border: `1px solid ${theme.border}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: theme.primary, fontWeight: 600, textTransform: 'capitalize' }}>
                        {name.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: theme.monoFamily, color: scoreColor }}>
                        {s.score.toFixed(0)}
                      </span>
                    </div>
                    {/* Mini bar */}
                    <div style={{ height: 3, background: theme.surface, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${s.score}%`, background: scoreColor, transition: 'width 400ms' }} />
                    </div>
                    {/* Recent verdict dots */}
                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      {s.recent.map((v, i) => (
                        <span key={i} style={{
                          width: 6, height: 6, borderRadius: 2,
                          background: v === 'pass' ? theme.success : v === 'fail' ? theme.danger : theme.warning,
                          opacity: 0.4 + (i / s.recent.length) * 0.6,
                        }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 4 }}>
                      <span style={{ color: theme.success }}>{s.passed}</span>
                      <span> / </span>
                      <span style={{ color: theme.danger }}>{s.failed}</span>
                      <span> · {s.total} 总</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        )}
      </div>

      {/* Telemetry stream */}
      <Panel title="攻击遥测" subtitle={`${events.length} 条事件`} padding={24}>
        <div style={{ marginTop: 16 }}>
          {events.length > 0 ? (
            <TelemetryStream events={events} maxHeight={500} />
          ) : (
            <div style={{ color: theme.textFaint, fontSize: 12, padding: 20, textAlign: 'center' }}>
              {connected ? '等待扫描开始…（在 Scan 标签页发起）' : '未连接到 WebSocket'}
            </div>
          )}
        </div>
      </Panel>

      {/* Structured scan log — filterable, searchable */}
      {events.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <ScanLogViewer
            entries={events.map(e => ({
              timestamp: Date.now(),
              level: e.verdict === 'error' ? 'error' : e.verdict === 'fail' ? 'warn' : 'info',
              source: e.suite,
              message: `${e.sample_id}: ${e.verdict}${e.error ? ' — ' + e.error : ''}`,
              sampleId: e.sample_id,
            }))}
            maxEntries={300}
          />
        </div>
      )}
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}秒`
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}分`
  return `${(seconds / 3600).toFixed(1)}小时`
}
