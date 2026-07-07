/**
 * ResponseLatencyChart — scatter of response length (proxy for "thinking depth")
 * against safety outcome. Reveals whether longer model responses correlate with
 * better defense or with getting jailbroken more often.
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'
import type { SampleResult } from '../types'

interface ResponseLatencyChartProps {
  samples: SampleResult[]
  /** 散点宽度，默认 600 */
  width?: number
  /** 散点高度，默认 300 */
  height?: number
  /** 点击某点的回调 */
  onSelect?: (sampleId: string) => void
}

export function computeStats(samples: SampleResult[]): {
  passAvgLen: number
  failAvgLen: number
  maxLen: number
  minLen: number
  correlation: 'fail-longer' | 'pass-longer' | 'neutral'
} {
  const pass = samples.filter(s => s.verdict === 'pass')
  const fail = samples.filter(s => s.verdict === 'fail')
  const avg = (arr: SampleResult[]) =>
    arr.length ? arr.reduce((sum, s) => sum + (s.response?.length || 0), 0) / arr.length : 0
  const passAvgLen = avg(pass)
  const failAvgLen = avg(fail)
  const lens = samples.map(s => s.response?.length || 0)
  const maxLen = lens.length ? Math.max(...lens) : 0
  const minLen = lens.length ? Math.min(...lens) : 0

  let correlation: 'fail-longer' | 'pass-longer' | 'neutral' = 'neutral'
  if (pass.length && fail.length) {
    const base = Math.max(passAvgLen, failAvgLen, 1)
    const diff = Math.abs(failAvgLen - passAvgLen) / base
    if (diff >= 0.1) correlation = failAvgLen > passAvgLen ? 'fail-longer' : 'pass-longer'
  }
  return { passAvgLen, failAvgLen, maxLen, minLen, correlation }
}

/** Deterministic [-1, 1] jitter from sample_id so points don't jump between renders. */
function jitter(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((h >>> 0) % 1000) / 500 - 1
}

const SEVERITY_OPACITY: Record<string, number> = { critical: 1, high: 0.85, medium: 0.6, low: 0.4 }

function pointColor(verdict: string): string {
  if (verdict === 'pass') return theme.success
  if (verdict === 'fail') return theme.danger
  return theme.warning
}

interface Tip { id: string; len: number; verdict: string; severity: string; x: number; y: number }

export function ResponseLatencyChart({ samples, width = 600, height = 300, onSelect }: ResponseLatencyChartProps) {
  const stats = useMemo(() => computeStats(samples), [samples])
  // Auto-pick scale: skewed distributions read better on log.
  const autoLog = stats.minLen > 0 && stats.maxLen / stats.minLen > 20
  const [logScale, setLogScale] = useState(autoLog)
  const [hover, setHover] = useState<Tip | null>(null)

  const padL = 48, padR = 16, padT = 16, padB = 40
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const passY = padT + plotH * 0.28
  const failY = padT + plotH * 0.72
  const rowSpread = plotH * 0.18

  // X scale over response length.
  const xOf = useMemo(() => {
    const lo = stats.minLen, hi = stats.maxLen
    if (logScale) {
      const a = Math.log10(Math.max(1, lo)), b = Math.log10(Math.max(1, hi))
      const span = b - a || 1
      return (len: number) => padL + ((Math.log10(Math.max(1, len)) - a) / span) * plotW
    }
    const span = hi - lo || 1
    return (len: number) => padL + ((len - lo) / span) * plotW
  }, [logScale, stats.minLen, stats.maxLen, padL, plotW])

  const midLen = Math.round((stats.minLen + stats.maxLen) / 2)
  const hasPass = samples.some(s => s.verdict === 'pass')
  const hasFail = samples.some(s => s.verdict === 'fail')

  const insight = (() => {
    const p = Math.round(stats.passAvgLen), f = Math.round(stats.failAvgLen)
    if (!hasPass && !hasFail) return ''
    if (!hasPass) return `FAIL 平均 ${f} 字`
    if (!hasFail) return `PASS 平均 ${p} 字`
    const tail = stats.correlation === 'fail-longer' ? '⚠ 更长的响应与更多失败相关'
      : stats.correlation === 'pass-longer' ? '✓ 更长的响应与更好的防御相关'
        : '响应长度与安全性无明显相关'
    return `PASS 平均 ${p} 字 · FAIL 平均 ${f} 字 · ${tail}`
  })()

  return (
    <Panel title="响应长度 vs 安全结果" subtitle="探索模型思考深度与安全性的关系">
      {samples.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>无样本数据</div>
      ) : (
        <>
          <div style={{ position: 'relative' }}>
            <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}>
              {/* Vertical gridlines at 25/50/75% */}
              {[0.25, 0.5, 0.75].map(f => (
                <line
                  key={f}
                  x1={padL + plotW * f} y1={padT}
                  x2={padL + plotW * f} y2={padT + plotH}
                  stroke={theme.border} strokeWidth={1}
                />
              ))}

              {/* Row baselines + Y labels */}
              <line x1={padL} y1={passY} x2={padL + plotW} y2={passY} stroke={theme.border} strokeWidth={1} strokeDasharray="2 4" />
              <line x1={padL} y1={failY} x2={padL + plotW} y2={failY} stroke={theme.border} strokeWidth={1} strokeDasharray="2 4" />
              <text x={padL - 8} y={passY + 4} textAnchor="end" fontSize={11} fontFamily={theme.monoFamily} fill={theme.success}>PASS</text>
              <text x={padL - 8} y={failY + 4} textAnchor="end" fontSize={11} fontFamily={theme.monoFamily} fill={theme.danger}>FAIL</text>

              {/* X axis */}
              <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke={theme.border} strokeWidth={1} />
              {[{ v: stats.minLen, a: 'start' as const, x: padL }, { v: midLen, a: 'middle' as const, x: padL + plotW / 2 }, { v: stats.maxLen, a: 'end' as const, x: padL + plotW }].map((t, i) => (
                <text key={i} x={t.x} y={padT + plotH + 16} textAnchor={t.a} fontSize={10} fontFamily={theme.monoFamily} fill={theme.textFaint}>{t.v}</text>
              ))}
              <text x={padL + plotW / 2} y={height - 4} textAnchor="middle" fontSize={10} fontFamily={theme.fontFamily} fill={theme.textDim}>
                响应字数（{logScale ? 'log' : 'linear'}）
              </text>

              {/* Data points */}
              {samples.map(s => {
                const len = s.response?.length || 0
                const baseY = s.verdict === 'pass' ? passY : s.verdict === 'fail' ? failY : (passY + failY) / 2
                const cx = xOf(len)
                const cy = baseY + jitter(s.sample_id) * rowSpread
                const isHover = hover?.id === s.sample_id
                const r = (s.verdict === 'fail' ? 4 : 3) + (isHover ? 2 : 0)
                return (
                  <circle
                    key={s.sample_id}
                    cx={cx} cy={cy} r={r}
                    fill={pointColor(s.verdict)}
                    fillOpacity={SEVERITY_OPACITY[s.severity] ?? 0.6}
                    stroke={isHover ? theme.text : 'none'} strokeWidth={isHover ? 1 : 0}
                    style={{ cursor: onSelect ? 'pointer' : 'default', transition: 'r 100ms ease' }}
                    onMouseEnter={() => setHover({ id: s.sample_id, len, verdict: s.verdict, severity: s.severity, x: cx, y: cy })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onSelect?.(s.sample_id)}
                  />
                )
              })}
            </svg>

            {hover && (
              <div style={{
                position: 'absolute', left: Math.min(hover.x + 10, width - 150), top: Math.max(0, hover.y - 44),
                pointerEvents: 'none', zIndex: 10,
                background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius,
                padding: '5px 9px', fontSize: 11, color: theme.text, fontFamily: theme.monoFamily,
                whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
              }}>
                {hover.id} · {hover.len} 字 · {hover.verdict} · {hover.severity}
              </div>
            )}
          </div>

          {/* Scale toggle */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {(['linear', 'log'] as const).map(mode => {
              const active = (mode === 'log') === logScale
              return (
                <button
                  key={mode}
                  onClick={() => setLogScale(mode === 'log')}
                  style={{
                    padding: '4px 12px', fontSize: 11, fontFamily: theme.monoFamily, cursor: 'pointer',
                    background: active ? theme.primary + '18' : 'transparent',
                    border: `1px solid ${active ? theme.primary : theme.border}`,
                    borderRadius: theme.radius, color: active ? theme.primary : theme.textDim,
                    transition: theme.transition,
                  }}
                >
                  {mode}
                </button>
              )
            })}
          </div>

          {/* Insight bar */}
          {insight && (
            <div style={{
              marginTop: 12, padding: '10px 12px', fontSize: 12, lineHeight: 1.5,
              color: theme.textDim, fontFamily: theme.fontFamily,
              background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radius,
            }}>
              {insight}
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
