/**
 * SeverityBubbleChart — 2D bubble matrix of suite × severity. Bubble size = sample
 * count, color = pass/fail ratio (green→red). Surfaces the "hot zones" where a
 * given severity level in a given suite fails most.
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'
import type { SampleResult } from '../types'

interface SeverityBubbleChartProps {
  samples: SampleResult[]
  /** SVG 宽度，默认 720 */
  width?: number
  /** SVG 高度，默认 360 */
  height?: number
  /** 点击气泡回调 */
  onSelect?: (suite: string, severity: string) => void
}

export interface BubbleData {
  suite: string
  severity: string
  total: number
  passed: number
  failed: number
  failRate: number
}

// Bottom → top on the Y axis.
const SEVERITY_ROWS = ['low', 'medium', 'high', 'critical'] as const

export function computeBubbles(samples: SampleResult[]): BubbleData[] {
  const groups = new Map<string, BubbleData>()
  for (const s of samples) {
    const key = `${s.suite}|${s.severity}`
    let g = groups.get(key)
    if (!g) {
      g = { suite: s.suite, severity: s.severity, total: 0, passed: 0, failed: 0, failRate: 0 }
      groups.set(key, g)
    }
    g.total++
    if (s.verdict === 'pass') g.passed++
    else if (s.verdict === 'fail') g.failed++
  }
  const out = Array.from(groups.values()).filter(g => g.total > 0)
  for (const g of out) {
    const judged = g.passed + g.failed
    g.failRate = judged ? g.failed / judged : 0
  }
  return out.sort((a, b) => a.suite.localeCompare(b.suite))
}

function clamp8(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** passRate=1 → successColor, passRate=0 → dangerColor, linear RGB lerp between. */
export function mixColor(passRate: number, successColor: string, dangerColor: string): string {
  const t = Math.max(0, Math.min(1, passRate))
  const [sr, sg, sb] = parseHex(successColor)
  const [dr, dg, db] = parseHex(dangerColor)
  const r = clamp8(dr + (sr - dr) * t)
  const g = clamp8(dg + (sg - dg) * t)
  const b = clamp8(db + (sb - db) * t)
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: theme.severity.critical,
  high: theme.severity.high,
  medium: theme.severity.medium,
  low: theme.severity.low,
}

interface Placed extends BubbleData { cx: number; cy: number; r: number }
interface Tip { data: BubbleData; x: number; y: number }

export function SeverityBubbleChart({ samples, width = 720, height = 360, onSelect }: SeverityBubbleChartProps) {
  const bubbles = useMemo(() => computeBubbles(samples), [samples])
  const [hover, setHover] = useState<string | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  const suites = useMemo(
    () => Array.from(new Set(bubbles.map(b => b.suite))).sort((a, b) => a.localeCompare(b)),
    [bubbles],
  )

  const padL = 90, padR = 24, padT = 20, padB = 64
  // Widen the canvas when there are many suites so labels don't collide.
  const minColW = suites.length > 15 ? 40 : 56
  const plotW = Math.max(width - padL - padR, suites.length * minColW)
  const svgW = plotW + padL + padR
  const plotH = height - padT - padB
  const rowH = plotH / SEVERITY_ROWS.length

  const colX = (suite: string) => padL + (suites.indexOf(suite) + 0.5) * (plotW / Math.max(1, suites.length))
  const rowY = (sev: string) => {
    const idx = SEVERITY_ROWS.indexOf(sev as typeof SEVERITY_ROWS[number])
    // Unknown severities fold onto the medium row so they still render.
    const safe = idx < 0 ? SEVERITY_ROWS.indexOf('medium') : idx
    return padT + (SEVERITY_ROWS.length - 1 - safe) * rowH + rowH / 2
  }

  const maxTotal = bubbles.reduce((m, b) => Math.max(m, b.total), 1)
  const k = Math.min(28, Math.max(10, rowH / 2 - 4)) / Math.sqrt(maxTotal)
  const radius = (count: number) => Math.max(4, Math.min(28, Math.sqrt(count) * k))

  const placed: Placed[] = bubbles.map(b => ({ ...b, cx: colX(b.suite), cy: rowY(b.severity), r: radius(b.total) }))
  const allPass = bubbles.length > 0 && bubbles.every(b => b.failed === 0)

  return (
    <Panel title="严重性气泡矩阵" subtitle="套件 × 严重度，气泡大小=样本数">
      {samples.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>无样本数据</div>
      ) : (
        <>
          <div style={{ position: 'relative', overflowX: 'auto' }}>
            <svg width={svgW} height={height} style={{ display: 'block' }}>
              {/* Row background bands + Y labels + gridlines */}
              {SEVERITY_ROWS.map((sev, i) => {
                const yTop = padT + (SEVERITY_ROWS.length - 1 - i) * rowH
                const yc = yTop + rowH / 2
                return (
                  <g key={sev}>
                    <rect x={padL} y={yTop} width={plotW} height={rowH} fill={SEVERITY_COLOR[sev] + '08'} />
                    <line x1={padL} y1={yTop} x2={padL + plotW} y2={yTop} stroke={theme.border} strokeWidth={1} />
                    <text x={padL - 12} y={yc + 4} textAnchor="end" fontSize={11} fontFamily={theme.monoFamily} fill={SEVERITY_COLOR[sev]}>
                      {sev}
                    </text>
                  </g>
                )
              })}
              {/* Bottom axis line */}
              <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke={theme.border} strokeWidth={1} />

              {/* X labels (rotated -30°) */}
              {suites.map(suite => {
                const x = colX(suite)
                return (
                  <text
                    key={suite}
                    x={x} y={padT + plotH + 16}
                    textAnchor="end" fontSize={suites.length > 15 ? 9 : 11}
                    fontFamily={theme.fontFamily} fill={theme.textDim}
                    transform={`rotate(-30 ${x} ${padT + plotH + 16})`}
                  >
                    {suite.replace(/_/g, ' ')}
                  </text>
                )
              })}

              {/* Bubbles */}
              {placed.map(b => {
                const key = `${b.suite}|${b.severity}`
                const isHover = hover === key
                const passRate = b.passed + b.failed ? b.passed / (b.passed + b.failed) : 1
                const fill = mixColor(passRate, theme.success, theme.danger)
                return (
                  <g key={key}>
                    <circle
                      cx={b.cx} cy={b.cy} r={b.r + (isHover ? 4 : 0)}
                      fill={fill} fillOpacity={isHover ? 1 : 0.7}
                      stroke={isHover ? theme.text : 'none'} strokeWidth={isHover ? 1 : 0}
                      style={{ cursor: onSelect ? 'pointer' : 'default', transition: 'r 100ms ease' }}
                      onMouseEnter={() => { setHover(key); setTip({ data: b, x: b.cx, y: b.cy - b.r }) }}
                      onMouseLeave={() => { setHover(null); setTip(null) }}
                      onClick={() => onSelect?.(b.suite, b.severity)}
                    />
                    {b.total > 0 && b.r >= 9 && (
                      <text
                        x={b.cx} y={b.cy + 4} textAnchor="middle" fontSize={11} fontWeight={700}
                        fontFamily={theme.monoFamily} fill={theme.bg} pointerEvents="none"
                      >
                        {b.total}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>

            {tip && (
              <div style={{
                position: 'absolute', left: Math.min(tip.x + 8, svgW - 170), top: Math.max(0, tip.y - 8),
                pointerEvents: 'none', zIndex: 10,
                background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius,
                padding: '6px 10px', fontSize: 11, color: theme.text, fontFamily: theme.monoFamily,
                whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
              }}>
                <div>{tip.data.suite.replace(/_/g, ' ')} · {tip.data.severity}</div>
                <div style={{ color: theme.textDim, marginTop: 2 }}>
                  总 {tip.data.total} · <span style={{ color: theme.success }}>pass {tip.data.passed}</span> · <span style={{ color: theme.danger }}>fail {tip.data.failed}</span>
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 14, flexWrap: 'wrap', fontSize: 11, color: theme.textDim }}>
            <LegendDot color={theme.success} label="全通过" />
            <LegendDot color={mixColor(0.5, theme.success, theme.danger)} label="部分失败" />
            <LegendDot color={theme.danger} label="全失败" />
            <span style={{ fontFamily: theme.monoFamily, color: theme.textFaint }}>气泡大小 ∝ √样本数</span>
            {allPass && <span style={{ color: theme.success, fontWeight: 600 }}>全部通过 ✓</span>}
          </div>
        </>
      )}
    </Panel>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, opacity: 0.7 }} />
      {label}
    </span>
  )
}
