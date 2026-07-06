/**
 * ModelProfile — condenses one model's scan results into a shareable
 * "security business card": overall score, strengths/weaknesses radar,
 * key risk summary, letter grade. Designed to be screenshotted.
 */
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'
import type { SuiteResult } from '../types'

interface ModelProfileProps {
  model: string
  overallScore: number
  totalSamples: number
  totalPassed: number
  totalFailed: number
  suites: SuiteResult[]
  /** 扫描日期（ISO），显示在底部 */
  scannedAt?: string
}

export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}

export function scoreColor(score: number): string {
  if (score >= 80) return theme.success
  if (score >= 50) return theme.warning
  return theme.danger
}

function abbreviate(name: string): string {
  const parts = name.split(/[_\s-]+/).filter(Boolean)
  if (parts.length > 1) {
    return parts.map(p => p[0]!.toUpperCase()).join('').slice(0, 4)
  }
  return name.slice(0, 3).toUpperCase()
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 10)
}

function ScoreRing({ score }: { score: number }) {
  const size = 80
  const stroke = 6
  const r = (size - stroke) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  const valid = score >= 0
  const pct = valid ? Math.max(0, Math.min(100, score)) / 100 : 0
  const color = valid ? scoreColor(score) : theme.textFaint

  return (
    <svg width={size} height={size}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={theme.border} strokeWidth={stroke} />
      {valid && (
        <circle
          cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
          strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`}
        />
      )}
      <text x={c} y={c} textAnchor="middle" dominantBaseline="central"
        fontSize={valid ? 22 : 13} fontWeight={700} fill={color} fontFamily={theme.monoFamily}>
        {valid ? scoreToGrade(score) : 'N/A'}
      </text>
    </svg>
  )
}

function MiniRadar({ suites }: { suites: SuiteResult[] }) {
  if (suites.length < 3) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
        套件数不足，无法绘制雷达
      </div>
    )
  }

  const size = 200
  const center = size / 2
  const maxR = 80
  const n = suites.length
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const pointAt = (i: number, r: number) => {
    const a = angleFor(i)
    return { x: center + r * Math.cos(a), y: center + r * Math.sin(a) }
  }

  const weakestIdx = suites.reduce((minI, s, i) => (s.score < suites[minI]!.score ? i : minI), 0)

  const dataPoints = suites.map((s, i) => pointAt(i, (Math.max(0, s.score) / 100) * maxR))
  const dataPath = dataPoints.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg width={size} height={size}>
      {[0.33, 0.66, 1].map(f => (
        <circle key={f} cx={center} cy={center} r={maxR * f} fill="none" stroke={theme.border} strokeWidth={1} />
      ))}
      {suites.map((s, i) => {
        const p = pointAt(i, maxR)
        return <line key={s.name} x1={center} y1={center} x2={p.x} y2={p.y} stroke={theme.border} strokeWidth={1} />
      })}
      <polygon points={dataPath} fill={theme.primary + '26'} stroke={theme.primary} strokeWidth={1.5} />
      {suites.map((s, i) => {
        const isWeak = i === weakestIdx
        return (
          <circle
            key={s.name}
            cx={dataPoints[i]!.x} cy={dataPoints[i]!.y}
            r={isWeak ? 4.5 : 2.5}
            fill={isWeak ? theme.danger : theme.primary}
          />
        )
      })}
      {suites.map((s, i) => {
        const p = pointAt(i, maxR + 14)
        return (
          <text
            key={s.name}
            x={p.x} y={p.y}
            textAnchor="middle" dominantBaseline="central"
            fontSize={8} fill={i === weakestIdx ? theme.danger : theme.textFaint}
            fontFamily={theme.fontFamily}
          >
            {abbreviate(s.name)}
          </text>
        )
      })}
    </svg>
  )
}

export function ModelProfile({
  model, overallScore, totalSamples, totalPassed, totalFailed, suites, scannedAt,
}: ModelProfileProps) {
  const strengths = suites.filter(s => s.score >= 80).slice(0, 5)
  const weaknesses = suites.filter(s => s.score < 70).slice(0, 5)
  const noSignal = suites.length > 0 && strengths.length === 0 && weaknesses.length === 0
  const totalErrors = suites.reduce((sum, s) => sum + s.errors, 0)
  const validScore = overallScore >= 0

  return (
    <Panel padding="20px">
      <div style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, fontFamily: theme.monoFamily }}>
              {model}
            </div>
            <div style={{
              fontSize: 48, fontWeight: 700, fontFamily: theme.monoFamily,
              color: validScore ? scoreColor(overallScore) : theme.textFaint,
            }}>
              {validScore ? overallScore : 'N/A'}
            </div>
          </div>
          <ScoreRing score={overallScore} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          {suites.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
              无套件数据
            </div>
          ) : (
            <MiniRadar suites={suites} />
          )}
        </div>

        {suites.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.success, marginBottom: 6 }}>✓ 强项</div>
              {noSignal ? (
                <div style={{ fontSize: 12, color: theme.textFaint }}>无显著强项或弱项</div>
              ) : strengths.length === 0 ? (
                <div style={{ fontSize: 12, color: theme.textFaint }}>—</div>
              ) : (
                strengths.map(s => (
                  <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: theme.textDim }}>{s.name.replace(/_/g, ' ')}</span>
                    <span style={{ color: theme.success, fontFamily: theme.monoFamily }}>{s.score}</span>
                  </div>
                ))
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.danger, marginBottom: 6 }}>⚠ 弱项</div>
              {noSignal ? (
                <div style={{ fontSize: 12, color: theme.textFaint }}>无显著强项或弱项</div>
              ) : weaknesses.length === 0 ? (
                <div style={{ fontSize: 12, color: theme.textFaint }}>全部达标 ✓</div>
              ) : (
                weaknesses.map(s => (
                  <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: theme.textDim }}>{s.name.replace(/_/g, ' ')}</span>
                    <span style={{ color: theme.danger, fontFamily: theme.monoFamily }}>{s.score}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
          <MonoTag tone="dim">
            {totalSamples} samples · {totalPassed} passed · {totalFailed} failed · {totalErrors} errors
          </MonoTag>
          {scannedAt && (
            <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 6 }}>
              Scanned: {formatDate(scannedAt)}
            </div>
          )}
          <div style={{ fontSize: 10, color: theme.textFaint, textAlign: 'center', marginTop: 10 }}>
            Generated by agent-redteam
          </div>
        </div>
      </div>
    </Panel>
  )
}
