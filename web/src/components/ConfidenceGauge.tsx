/**
 * ConfidenceGauge — meta-analysis of how *trustworthy* a scan score is.
 * Not all pass/fail carry equal weight: thin sample counts, empty model
 * responses, and narrow coverage all lower confidence. Answers the question
 * "this 84.6 — how sure are you it's really 84.6?".
 */
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'
import type { SuiteResult, SampleResult } from '../types'

interface ConfidenceGaugeProps {
  suites: SuiteResult[]
  samples: SampleResult[]
  /** 扫描的总体覆盖比例（已测样本数/总样本池），0-1 */
  coverage?: number
}

export interface ConfidenceFactors {
  sampleAdequacy: number    // 0-1
  coverageBreadth: number   // 0-1
  resultConsistency: number // 0-1
  failureClarity: number    // 0-1
}

const WEIGHTS = { sampleAdequacy: 0.30, coverageBreadth: 0.25, resultConsistency: 0.25, failureClarity: 0.20 }
const SAMPLE_TARGET = 30   // samples/suite for full adequacy
const SUITE_TARGET = 10    // suites for full breadth

export function computeConfidence(
  suites: SuiteResult[],
  samples: SampleResult[],
  coverage?: number,
): { factors: ConfidenceFactors; overall: number; level: 'high' | 'medium' | 'low' } {
  const empty: ConfidenceFactors = { sampleAdequacy: 0, coverageBreadth: 0, resultConsistency: 0, failureClarity: 0 }
  if (suites.length === 0 || samples.length === 0) {
    return { factors: empty, overall: 0, level: 'low' }
  }

  const avgPerSuite = samples.length / suites.length
  const sampleAdequacy = Math.min(1, avgPerSuite / SAMPLE_TARGET)

  const coverageBreadth = coverage !== undefined
    ? Math.max(0, Math.min(1, coverage))
    : Math.min(1, suites.length / SUITE_TARGET)

  const noise = samples.filter(s => s.verdict === 'error' || s.verdict === 'skip').length
  const resultConsistency = 1 - noise / samples.length

  const fails = samples.filter(s => s.verdict === 'fail')
  const failureClarity = fails.length === 0
    ? 1
    : fails.filter(s => s.response.trim().length > 0).length / fails.length

  const factors: ConfidenceFactors = { sampleAdequacy, coverageBreadth, resultConsistency, failureClarity }
  const overall =
    factors.sampleAdequacy * WEIGHTS.sampleAdequacy +
    factors.coverageBreadth * WEIGHTS.coverageBreadth +
    factors.resultConsistency * WEIGHTS.resultConsistency +
    factors.failureClarity * WEIGHTS.failureClarity

  const level = overall >= 0.8 ? 'high' : overall >= 0.5 ? 'medium' : 'low'
  return { factors, overall, level }
}

function confColor(v: number): string {
  if (v >= 0.8) return theme.success
  if (v >= 0.5) return theme.warning
  return theme.danger
}

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)]
}

/** Arc path across the top semicircle from `fromDeg` to `toDeg` (180→0 = full). */
function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const [x1, y1] = polar(cx, cy, r, fromDeg)
  const [x2, y2] = polar(cx, cy, r, toDeg)
  const largeArc = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

function Gauge({ pct, color }: { pct: number; color: string }) {
  const w = 240, h = 140, cx = w / 2, cy = 130, r = 100
  const endDeg = 180 - pct * 180
  return (
    <svg width={w} height={h}>
      <path d={arcPath(cx, cy, r, 180, 0)} fill="none" stroke={theme.border} strokeWidth={12} strokeLinecap="round" />
      {pct > 0 && (
        <path d={arcPath(cx, cy, r, 180, endDeg)} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" />
      )}
      <text x={cx} y={cy - 34} textAnchor="middle" fontSize={40} fontWeight={700}
        fill={color} fontFamily={theme.monoFamily}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}

function FactorRow({ label, detail, value, weight }: {
  label: string
  detail: string
  value: number
  weight: number
}) {
  const color = confColor(value)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: theme.text, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: theme.textFaint, fontFamily: theme.monoFamily }}>{detail}</span>
        <MonoTag tone="dim">权重 {Math.round(weight * 100)}%</MonoTag>
      </div>
      <div style={{ height: 6, background: theme.bg, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.round(value * 100)}%`, height: '100%', background: color, transition: theme.transition }} />
      </div>
    </div>
  )
}

export function ConfidenceGauge({ suites, samples, coverage }: ConfidenceGaugeProps) {
  const { factors, overall, level } = computeConfidence(suites, samples, coverage)
  const hasData = suites.length > 0 && samples.length > 0
  const pct = overall
  const color = confColor(pct)
  const levelLabel = level === 'high' ? 'HIGH' : level === 'medium' ? 'MEDIUM' : 'LOW'

  // Per-suite noise stats for low-confidence warnings
  const suiteStats = suites.map(s => {
    const inSuite = samples.filter(x => x.suite === s.name)
    const errors = inSuite.filter(x => x.verdict === 'error' || x.verdict === 'skip').length
    const errorRate = inSuite.length > 0 ? errors / inSuite.length : 1
    return { name: s.name, count: inSuite.length, errors, errorRate }
  })
  const lowConf = suiteStats.filter(s => s.count < 10 || s.errorRate > 0.2)

  const avgPerSuite = suites.length > 0 ? samples.length / suites.length : 0
  const errorRateAll = samples.length > 0
    ? samples.filter(s => s.verdict === 'error' || s.verdict === 'skip').length / samples.length
    : 0
  const failCount = samples.filter(s => s.verdict === 'fail').length

  const advice = pct >= 0.8
    ? '分数可信，可用于决策'
    : pct >= 0.5
      ? '分数有参考价值，建议增加样本量'
      : '分数不可靠，建议跑全量扫描后再判断'

  return (
    <Panel title="置信度分析" subtitle="这个分数有多可信">
      {!hasData ? (
        <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
          无数据
        </div>
      ) : (
        <>
          {/* Region 1: main gauge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
            <Gauge pct={pct} color={color} />
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color, marginTop: -8 }}>
              {levelLabel}
            </div>
          </div>

          {/* Region 2: factor breakdown */}
          <div style={{ marginBottom: 20 }}>
            <FactorRow
              label="样本充分性"
              detail={`${avgPerSuite.toFixed(1)}/${SAMPLE_TARGET} 样本/套件`}
              value={factors.sampleAdequacy}
              weight={WEIGHTS.sampleAdequacy}
            />
            <FactorRow
              label="覆盖广度"
              detail={coverage !== undefined
                ? `${Math.round(coverage * 100)}% 样本池`
                : `${suites.length}/${SUITE_TARGET} 套件`}
              value={factors.coverageBreadth}
              weight={WEIGHTS.coverageBreadth}
            />
            <FactorRow
              label="结果一致性"
              detail={`error/skip ${Math.round(errorRateAll * 100)}%`}
              value={factors.resultConsistency}
              weight={WEIGHTS.resultConsistency}
            />
            <FactorRow
              label="失败明确性"
              detail={failCount === 0 ? '无失败样本' : `${Math.round(factors.failureClarity * 100)}% fail 有响应`}
              value={factors.failureClarity}
              weight={WEIGHTS.failureClarity}
            />
          </div>

          {/* Region 3: low-confidence suite warnings */}
          <div style={{ marginBottom: 16 }}>
            {lowConf.length === 0 ? (
              <div style={{ fontSize: 12, color: theme.success }}>所有套件置信度良好 ✓</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lowConf.map(s => (
                  <div key={s.name} style={{
                    borderLeft: `3px solid ${theme.danger}`,
                    background: theme.danger + '08',
                    padding: '6px 10px', borderRadius: theme.radiusSm,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 12, color: theme.text, flex: 1 }}>{s.name.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 11, color: theme.textDim, fontFamily: theme.monoFamily }}>
                      {s.count} 样本 · {s.errors} error
                    </span>
                    <span style={{ fontSize: 10, color: theme.danger }}>
                      {s.count < 10 ? '样本不足' : 'error 率高'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Region 4: advice */}
          <div style={{
            padding: '10px 14px', borderRadius: theme.radius,
            background: color + '12', borderLeft: `3px solid ${color}`,
            fontSize: 13, fontWeight: 600, color: theme.text,
          }}>
            {advice}
          </div>
        </>
      )}
    </Panel>
  )
}
