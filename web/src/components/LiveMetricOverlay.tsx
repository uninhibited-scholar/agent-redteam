/**
 * LiveMetricOverlay — floating panel of key metrics while a scan is running:
 * overall progress ring, pass/fail/error counts, throughput, and per-suite
 * progress bars colored by their current fail rate. Data streams in via
 * completedSamples as WebSocket sample_result events arrive.
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'
import type { SampleResult } from '../types'

interface LiveMetricOverlayProps {
  /** 已完成的样本（按时间顺序） */
  completedSamples: SampleResult[]
  /** 本次扫描计划的总样本数 */
  totalPlanned: number
  /** 扫描开始时间（unix ms） */
  startedAt: number
  /** 是否正在扫描 */
  scanning: boolean
  /** 可选：点击某指标的下钻回调 */
  onDrill?: (suite: string) => void
}

export interface SuiteProgress {
  suite: string
  done: number
  planned: number
  failRate: number
}

export interface LiveMetrics {
  passed: number
  failed: number
  errors: number
  passRate: number
  failRate: number
  elapsedMs: number
  ratePerMin: number
  estimatedRemainingMs: number
  suiteProgress: SuiteProgress[]
}

export function computeLiveMetrics(
  completed: SampleResult[],
  totalPlanned: number,
  startedAt: number,
  now: number,
): LiveMetrics {
  let passed = 0, failed = 0, errors = 0
  const bySuite = new Map<string, { done: number; pass: number; fail: number }>()
  for (const s of completed) {
    if (s.verdict === 'pass') passed++
    else if (s.verdict === 'fail') failed++
    else if (s.verdict === 'error') errors++
    const g = bySuite.get(s.suite) || { done: 0, pass: 0, fail: 0 }
    g.done++
    if (s.verdict === 'pass') g.pass++
    else if (s.verdict === 'fail') g.fail++
    bySuite.set(s.suite, g)
  }

  const judged = passed + failed
  const passRate = judged ? passed / judged : 0
  const failRate = judged ? failed / judged : 0

  const elapsedMs = Math.max(0, now - startedAt)
  const ratePerMin = elapsedMs > 0 ? completed.length / (elapsedMs / 60000) : 0
  const remaining = totalPlanned - completed.length
  const estimatedRemainingMs = ratePerMin > 0 && remaining > 0 ? (remaining / ratePerMin) * 60000 : 0

  // Planned samples are split evenly across the suites seen so far.
  const suiteCount = bySuite.size || 1
  const plannedPerSuite = totalPlanned / suiteCount
  const suiteProgress: SuiteProgress[] = Array.from(bySuite.entries())
    .map(([suite, g]) => {
      const sj = g.pass + g.fail
      return { suite, done: g.done, planned: plannedPerSuite, failRate: sj ? g.fail / sj : 0 }
    })
    .sort((a, b) => a.suite.localeCompare(b.suite))

  return { passed, failed, errors, passRate, failRate, elapsedMs, ratePerMin, estimatedRemainingMs, suiteProgress }
}

function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return '0:00'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Suite-bar color: green at 0% fail, red at 100% fail — linear RGB lerp, no libs. */
function failColor(failRate: number): string {
  const [gr, gg, gb] = hexToRgb(theme.success)
  const [rr, rg, rb] = hexToRgb(theme.danger)
  const t = Math.max(0, Math.min(1, failRate))
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `#${[mix(gr, rr), mix(gg, rg), mix(gb, rb)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 60, stroke = 6
  const r = (size - stroke) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.max(0, Math.min(1, pct)))
  return (
    <svg width={size} height={size}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={theme.border} strokeWidth={stroke} />
      <circle
        cx={c} cy={c} r={r} fill="none"
        stroke={theme.primary} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform={`rotate(-90 ${c} ${c})`}
        style={{ transition: 'stroke-dashoffset 300ms ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} fontFamily={theme.monoFamily} fill={theme.text}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: theme.monoFamily, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 9, color: theme.textFaint, marginTop: 2, letterSpacing: 0.3 }}>{label}</div>
    </div>
  )
}

export function LiveMetricOverlay({ completedSamples, totalPlanned, startedAt, scanning, onDrill }: LiveMetricOverlayProps) {
  const [hoverSuite, setHoverSuite] = useState<string | null>(null)

  const metrics = useMemo(
    () => computeLiveMetrics(completedSamples, totalPlanned, startedAt, Date.now()),
    [completedSamples, totalPlanned, startedAt],
  )

  // Scan finished (or never started) — the overlay disappears entirely.
  if (!scanning) return null

  const noResultsYet = completedSamples.length === 0
  const pct = totalPlanned > 0 ? Math.min(1, completedSamples.length / totalPlanned) : 0

  return (
    <div style={{ maxWidth: 280 }}>
      <Panel padding="14px 16px">
        {totalPlanned > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <ProgressRing pct={pct} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, fontFamily: theme.monoFamily }}>
                {completedSamples.length} / {totalPlanned}
              </div>
              <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 2 }}>
                {noResultsYet ? '等待第一个结果…' : `预计剩余 ${formatDuration(metrics.estimatedRemainingMs)}`}
              </div>
            </div>
          </div>
        )}

        {noResultsYet ? (
          totalPlanned === 0 && (
            <div style={{ fontSize: 12, color: theme.textFaint, textAlign: 'center', padding: '8px 0' }}>
              等待第一个结果…
            </div>
          )
        ) : (
          <>
            {/* 2x2 live metric grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <StatCell label={`通过 · ${(metrics.passRate * 100).toFixed(0)}%`} value={String(metrics.passed)} color={theme.success} />
              <StatCell label={`失败 · ${(metrics.failRate * 100).toFixed(0)}%`} value={String(metrics.failed)} color={theme.danger} />
              <StatCell label="错误" value={String(metrics.errors)} color={theme.warning} />
              <StatCell label="样本/分钟" value={metrics.ratePerMin.toFixed(1)} color={theme.primary} />
            </div>

            {/* Per-suite progress, colored by current fail rate */}
            {metrics.suiteProgress.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {metrics.suiteProgress.map(sp => {
                  const width = sp.planned > 0 ? Math.min(100, (sp.done / sp.planned) * 100) : 0
                  const isHover = hoverSuite === sp.suite
                  return (
                    <div
                      key={sp.suite}
                      onMouseEnter={() => setHoverSuite(sp.suite)}
                      onMouseLeave={() => setHoverSuite(null)}
                      onClick={() => onDrill?.(sp.suite)}
                      style={{ cursor: onDrill ? 'pointer' : 'default', position: 'relative' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: theme.textDim, marginBottom: 2 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sp.suite.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontFamily: theme.monoFamily }}>{sp.done}/{Math.round(sp.planned)}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: theme.bg, overflow: 'hidden', border: `1px solid ${theme.border}` }}>
                        <div style={{ width: `${width}%`, height: '100%', background: failColor(sp.failRate), transition: 'width 300ms ease' }} />
                      </div>
                      {isHover && (
                        <div style={{
                          position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 10,
                          background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius,
                          padding: '5px 9px', fontSize: 10, color: theme.textDim, fontFamily: theme.monoFamily,
                          whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
                        }}>
                          {sp.suite}: {(sp.failRate * 100).toFixed(0)}% 失败
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}
