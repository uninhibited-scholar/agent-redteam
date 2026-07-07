/** RiskTrendAnalyzer — analyzes per-suite score trends over scan history and forecasts which dimensions will decline. */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'

interface TrendPoint {
  x: number
  score: number
}

interface SuiteTrend {
  suite: string
  points: TrendPoint[]
}

interface RiskTrendAnalyzerProps {
  trends: SuiteTrend[]
  forecastSteps?: number
}

export function linearRegression(points: { x: number; y: number }[]): {
  slope: number
  intercept: number
  rSquared: number
} {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: n === 1 ? points[0].y : 0, rSquared: 0 }

  // Least squares via normal equations.
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
  for (const p of points) {
    sumX += p.x
    sumY += p.y
    sumXY += p.x * p.y
    sumXX += p.x * p.x
  }
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 }
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  // R² = 1 - SS_res / SS_tot.
  const meanY = sumY / n
  let ssRes = 0, ssTot = 0
  for (const p of points) {
    const pred = slope * p.x + intercept
    ssRes += (p.y - pred) ** 2
    ssTot += (p.y - meanY) ** 2
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot
  return { slope, intercept, rSquared }
}

export function forecast(points: TrendPoint[], steps: number): { x: number; score: number }[] {
  if (points.length < 2) return []
  const { slope, intercept } = linearRegression(points.map(p => ({ x: p.x, y: p.score })))
  const lastX = points[points.length - 1].x
  const out: { x: number; score: number }[] = []
  for (let i = 1; i <= steps; i++) {
    const x = lastX + i
    const score = Math.min(100, Math.max(0, slope * x + intercept))
    out.push({ x, score })
  }
  return out
}

export function classifyTrend(slope: number): 'improving' | 'declining' | 'stable' {
  if (slope > 0.5) return 'improving'
  if (slope < -0.5) return 'declining'
  return 'stable'
}

const SUITE_OWASP: Record<string, string> = {
  injection: 'LLM01',
  tool_abuse: 'LLM05',
  over_refusal: 'LLM09',
  info_leak: 'LLM06',
}

type Trend = 'improving' | 'declining' | 'stable'

interface AnalyzedSuite {
  suite: string
  points: TrendPoint[]
  slope: number
  trend: Trend
  currentScore: number
  forecastPoints: { x: number; score: number }[]
  forecastScore: number
  insufficient: boolean
}

function trendColor(trend: Trend): string {
  return trend === 'improving' ? theme.success : trend === 'declining' ? theme.danger : theme.textDim
}

export function RiskTrendAnalyzer({ trends, forecastSteps = 3 }: RiskTrendAnalyzerProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (trends.length === 0) {
    return (
      <Panel title="风险趋势分析" subtitle="历史趋势 + 预测">
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: theme.textFaint }}>
          需要多次扫描才能分析趋势
        </div>
      </Panel>
    )
  }

  const analyzed: AnalyzedSuite[] = trends.map(t => {
    const insufficient = t.points.length < 2
    const { slope } = insufficient
      ? { slope: 0 }
      : linearRegression(t.points.map(p => ({ x: p.x, y: p.score })))
    const trend: Trend = insufficient ? 'stable' : classifyTrend(slope)
    const currentScore = t.points.length ? t.points[t.points.length - 1].score : 0
    const forecastPoints = insufficient ? [] : forecast(t.points, forecastSteps)
    const forecastScore = forecastPoints.length ? forecastPoints[forecastPoints.length - 1].score : currentScore
    return { suite: t.suite, points: t.points, slope, trend, currentScore, forecastPoints, forecastScore, insufficient }
  })

  const improving = analyzed.filter(a => !a.insufficient && a.trend === 'improving').length
  const declining = analyzed.filter(a => !a.insufficient && a.trend === 'declining').length
  const stable = analyzed.filter(a => a.insufficient || a.trend === 'stable').length

  const declineList = analyzed
    .filter(a => !a.insufficient && a.trend === 'declining')
    .sort((a, b) => a.slope - b.slope) // most negative first

  // ===== Chart geometry =====
  const W = 640, H = 240, padL = 36, padR = 60, padT = 12, padB = 24
  const allX = analyzed.flatMap(a => [...a.points.map(p => p.x), ...a.forecastPoints.map(p => p.x)])
  const minX = allX.length ? Math.min(...allX) : 0
  const maxX = allX.length ? Math.max(...allX) : 1
  const lastHistX = Math.max(...analyzed.flatMap(a => a.points.map(p => p.x)), minX)
  const sx = (x: number) => padL + ((x - minX) / (maxX - minX || 1)) * (W - padL - padR)
  const sy = (score: number) => padT + (1 - score / 100) * (H - padT - padB)
  const forecastBandX = sx(lastHistX)

  return (
    <Panel title="风险趋势分析" subtitle="历史趋势 + 预测">
      {/* Region 1: summary */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 16, padding: declining > 0 ? '12px' : 0,
        borderRadius: theme.radius,
        background: declining > 0 ? theme.danger + '10' : 'transparent',
      }}>
        <SummaryCard label="改善中" value={improving} color={theme.success} />
        <SummaryCard label="恶化中" value={declining} color={theme.danger} />
        <SummaryCard label="稳定" value={stable} color={theme.textDim} />
        {declining > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: theme.danger }}>
            ⚠ {declining} 个维度正在恶化
          </div>
        )}
      </div>

      {/* Region 2: multi-line chart */}
      <div style={{ marginBottom: 16 }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
          {/* Y gridlines */}
          {[0, 25, 50, 75, 100].map(g => (
            <g key={g}>
              <line x1={padL} y1={sy(g)} x2={W - padR} y2={sy(g)} stroke={theme.border} strokeWidth={0.5} />
              <text x={padL - 6} y={sy(g) + 3} textAnchor="end" fontSize={9} fill={theme.textFaint} fontFamily={theme.monoFamily}>{g}</text>
            </g>
          ))}
          {/* 50-line (fail threshold) */}
          <line x1={padL} y1={sy(50)} x2={W - padR} y2={sy(50)} stroke={theme.danger} strokeWidth={0.5} strokeDasharray="2 3" opacity={0.5} />

          {/* Forecast band */}
          {forecastBandX < W - padR && (
            <>
              <rect x={forecastBandX} y={padT} width={W - padR - forecastBandX} height={H - padT - padB} fill={theme.primary} opacity={0.04} />
              <text x={forecastBandX + 4} y={padT + 10} fontSize={9} fill={theme.textFaint}>预测</text>
            </>
          )}

          {/* Lines */}
          {analyzed.map(a => {
            if (a.points.length === 0) return null
            const color = trendColor(a.trend)
            const isHover = hovered === a.suite
            const opacity = hovered && !isHover ? 0.25 : 1
            const histPath = a.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.score).toFixed(1)}`).join(' ')
            const lastP = a.points[a.points.length - 1]
            const forePath = a.forecastPoints.length
              ? `M ${sx(lastP.x).toFixed(1)} ${sy(lastP.score).toFixed(1)} ` +
                a.forecastPoints.map(p => `L ${sx(p.x).toFixed(1)} ${sy(p.score).toFixed(1)}`).join(' ')
              : ''
            const endX = a.forecastPoints.length ? sx(a.forecastPoints[a.forecastPoints.length - 1].x) : sx(lastP.x)
            const endY = a.forecastPoints.length ? sy(a.forecastScore) : sy(lastP.score)
            return (
              <g key={a.suite} opacity={opacity} onMouseEnter={() => setHovered(a.suite)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
                <path d={histPath} fill="none" stroke={color} strokeWidth={isHover ? 2.5 : 1.5} strokeLinejoin="round" />
                {forePath && <path d={forePath} fill="none" stroke={color} strokeWidth={isHover ? 2.5 : 1.5} strokeDasharray="4 3" />}
                {a.points.map(p => <circle key={p.x} cx={sx(p.x)} cy={sy(p.score)} r={isHover ? 2.5 : 1.5} fill={color} />)}
                {endX < W - 4 && (
                  <text x={endX + 4} y={endY + 3} fontSize={9} fill={color} fontFamily={theme.monoFamily}>{a.suite}</text>
                )}
              </g>
            )
          })}
        </svg>
        {hovered && (() => {
          const a = analyzed.find(x => x.suite === hovered)
          if (!a) return null
          return (
            <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4 }}>
              <b style={{ color: trendColor(a.trend) }}>{a.suite}</b> · 当前 {a.currentScore.toFixed(1)} · 斜率 {a.slope.toFixed(2)}/次 · {a.trend}
            </div>
          )
        })()}
      </div>

      {/* Region 3: warning list */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 8 }}>恶化预警</div>
        {declineList.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.success }}>所有维度趋势稳定 ✓</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {declineList.map(a => {
              const willFail = a.forecastScore < 50
              return (
                <div key={a.suite} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: theme.radius,
                  background: willFail ? theme.danger + '12' : theme.bg,
                  border: `1px solid ${willFail ? theme.danger + '40' : theme.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
                    <span style={{ fontFamily: theme.monoFamily, fontSize: 13, color: theme.text }}>{a.suite}</span>
                    <MonoTag>{SUITE_OWASP[a.suite] ?? '—'}</MonoTag>
                  </div>
                  <div style={{ minWidth: 150, fontSize: 12, color: theme.textDim }}>
                    当前 <b style={{ color: theme.text }}>{a.currentScore.toFixed(1)}</b>
                    <span style={{ color: theme.danger, marginLeft: 6 }}>{a.slope.toFixed(1)} 分/次</span>
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: willFail ? theme.danger : theme.textDim }}>
                    {willFail
                      ? `⚠ 预计 ${forecastSteps} 步后不及格（→ ${a.forecastScore.toFixed(1)}）`
                      : `${forecastSteps} 步后预计 → ${a.forecastScore.toFixed(1)}`}
                  </div>
                  <div style={{ width: 100, height: 6, background: theme.border, borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${a.forecastScore}%`, background: willFail ? theme.danger : theme.warning }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Region 4: legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 12, borderTop: `1px solid ${theme.border}` }}>
        <LegendLine dashed={false} label="历史" />
        <LegendLine dashed label="预测" />
        <LegendDot color={theme.success} label="改善" />
        <LegendDot color={theme.danger} label="恶化" />
        <LegendDot color={theme.textDim} label="稳定" />
      </div>
    </Panel>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: '0 0 auto', minWidth: 90, padding: '10px 14px', background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radius }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: theme.textFaint }}>{label}</div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ fontSize: 11, color: theme.textFaint }}>{label}</span>
    </div>
  )
}

function LegendLine({ dashed, label }: { dashed: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <svg width={20} height={6}>
        <line x1={0} y1={3} x2={20} y2={3} stroke={theme.textDim} strokeWidth={1.5} strokeDasharray={dashed ? '4 3' : undefined} />
      </svg>
      <span style={{ fontSize: 11, color: theme.textFaint }}>{label}</span>
    </div>
  )
}
