/**
 * AttackSurfaceMap — enhanced radar: not just per-suite scores, but each weak
 * vertex is annotated with its worst failing sample, so an analyst sees *which*
 * concrete attack is dragging a dimension down.
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'
import type { SuiteResult, SampleResult } from '../types'

interface AttackSurfaceMapProps {
  suites: SuiteResult[]
  samples: SampleResult[]
  size?: number
  onSelectSuite?: (suite: string) => void
}

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
const WEAK_THRESHOLD = 70

function severityColor(sev: string): string {
  return theme.severity[sev as keyof typeof theme.severity] || theme.textDim
}

function abbreviate(name: string): string {
  const clean = name.replace(/_/g, ' ')
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

export function findWeakSpots(
  suites: SuiteResult[],
  samples: SampleResult[],
): Array<{ suite: string; score: number; worstFailure?: SampleResult }> {
  return suites
    .filter(s => s.score < WEAK_THRESHOLD)
    .map(s => {
      const fails = samples.filter(sm => sm.suite === s.name && sm.verdict === 'fail')
      const worstFailure = fails.reduce<SampleResult | undefined>((worst, sm) => {
        if (!worst) return sm
        return (SEVERITY_RANK[sm.severity] || 0) > (SEVERITY_RANK[worst.severity] || 0) ? sm : worst
      }, undefined)
      return { suite: s.name, score: s.score, worstFailure }
    })
    .sort((a, b) => a.score - b.score)
}

function vertexColor(score: number): string {
  return score >= 80 ? theme.success : score >= 50 ? theme.warning : theme.danger
}

function vertexRadius(score: number): number {
  return score >= 80 ? 4 : score >= 50 ? 5 : 6
}

interface VertexGeom {
  suite: SuiteResult
  angle: number
  x: number
  y: number
  labelX: number
  labelY: number
  anchor: 'start' | 'middle' | 'end'
}

interface Annotation {
  suite: string
  score: number
  worstFailure?: SampleResult
  vx: number
  vy: number
  lineEndX: number
  lineEndY: number
  boxX: number
  boxY: number
  boxAnchorRight: boolean
}

function layoutRadar(suites: SuiteResult[], center: number, radius: number) {
  const n = suites.length
  const vertices: VertexGeom[] = suites.map((suite, i) => {
    const angle = (-90 + (i * 360) / n) * (Math.PI / 180)
    const ratio = Math.max(0, Math.min(100, suite.score)) / 100
    const x = center + radius * ratio * Math.cos(angle)
    const y = center + radius * ratio * Math.sin(angle)
    const lx = center + (radius + 14) * Math.cos(angle)
    const ly = center + (radius + 14) * Math.sin(angle)
    const cos = Math.cos(angle)
    const anchor: 'start' | 'middle' | 'end' = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'
    return { suite, angle, x, y, labelX: lx, labelY: ly, anchor }
  })
  return vertices
}

function layoutAnnotations(
  weakSpots: ReturnType<typeof findWeakSpots>,
  vertices: VertexGeom[],
  center: number,
): Annotation[] {
  const byName = new Map(vertices.map(v => [v.suite.name, v]))
  const result: Annotation[] = []
  weakSpots.forEach((ws, i) => {
      const v = byName.get(ws.suite)
      if (!v) return
      const ux = Math.cos(v.angle)
      const uy = Math.sin(v.angle)
      // Leader line extends 30px radially outward from the data vertex.
      const lineEndX = v.x + 30 * ux
      const lineEndY = v.y + 30 * uy
      // Alternate boxes vertically to reduce overlap between adjacent weak spots.
      const stagger = (i % 2 === 0 ? -1 : 1) * 6
      result.push({
        suite: ws.suite,
        score: ws.score,
        worstFailure: ws.worstFailure,
        vx: v.x,
        vy: v.y,
        lineEndX,
        lineEndY,
        boxX: lineEndX,
        boxY: lineEndY + stagger,
        boxAnchorRight: v.x < center,
      })
  })
  return result
}

export function AttackSurfaceMap({ suites, samples, size = 400, onSelectSuite }: AttackSurfaceMapProps) {
  const [hoverSuite, setHoverSuite] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  const center = size / 2
  const radius = size / 2 - 64

  const weakSpots = useMemo(() => findWeakSpots(suites, samples), [suites, samples])
  const vertices = useMemo(() => layoutRadar(suites, center, radius), [suites, center, radius])
  const annotations = useMemo(() => layoutAnnotations(weakSpots, vertices, center), [weakSpots, vertices, center])

  if (suites.length === 0) {
    return (
      <Panel title="攻击面地图" subtitle="雷达 + 弱点标注">
        <div style={{ padding: 32, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>
          无套件数据
        </div>
      </Panel>
    )
  }

  const rings = [0.25, 0.5, 0.75, 1]
  const dataPoints = vertices.map(v => `${v.x},${v.y}`).join(' ')

  return (
    <Panel title="攻击面地图" subtitle="雷达 + 弱点标注">
      <div style={{ position: 'relative', width: size, maxWidth: '100%', margin: '0 auto' }}>
        <svg width={size} height={size} style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}>
          <style>{`@keyframes asmPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }`}</style>

          {/* Reference rings */}
          {rings.map(r => (
            <circle key={r} cx={center} cy={center} r={radius * r}
              fill="none" stroke={theme.border} strokeWidth={1} />
          ))}

          {/* Radial axes */}
          {vertices.map(v => (
            <line key={`axis-${v.suite.name}`} x1={center} y1={center}
              x2={center + radius * Math.cos(v.angle)} y2={center + radius * Math.sin(v.angle)}
              stroke={theme.border} strokeWidth={1} />
          ))}

          {/* Data polygon */}
          <polygon points={dataPoints}
            fill={theme.primary + '1F'} stroke={theme.primary} strokeWidth={2} strokeLinejoin="round" />

          {/* Weak-spot leader lines */}
          {annotations.map(a => (
            <path key={`lead-${a.suite}`} d={`M ${a.vx} ${a.vy} L ${a.lineEndX} ${a.lineEndY}`}
              stroke={theme.danger} strokeWidth={hoverSuite === a.suite ? 2 : 1} fill="none" />
          ))}

          {/* Vertices + labels */}
          {vertices.map(v => {
            const score = v.suite.score
            const isHover = hoverSuite === v.suite.name
            const baseR = vertexRadius(score)
            const r = isHover ? baseR + 3 : baseR
            const color = vertexColor(score)
            const pulse = score < 50 && !isHover
            return (
              <g key={`vtx-${v.suite.name}`}>
                <circle
                  cx={v.x} cy={v.y} r={r}
                  fill={color} stroke={theme.bg} strokeWidth={1.5}
                  style={{ cursor: onSelectSuite ? 'pointer' : 'default', animation: pulse ? 'asmPulse 1.5s infinite' : undefined }}
                  onMouseEnter={e => {
                    setHoverSuite(v.suite.name)
                    setTooltip({ text: `${abbreviate(v.suite.name)} · ${score.toFixed(1)} 分`, x: e.clientX, y: e.clientY })
                  }}
                  onMouseMove={e => setTooltip({ text: `${abbreviate(v.suite.name)} · ${score.toFixed(1)} 分`, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => { setHoverSuite(null); setTooltip(null) }}
                  onClick={() => onSelectSuite?.(v.suite.name)}
                />
                <text x={v.labelX} y={v.labelY} textAnchor={v.anchor} dominantBaseline="middle"
                  fontSize={10} fill={theme.textDim} fontFamily={theme.fontFamily}>
                  {abbreviate(v.suite.name)}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Annotation boxes (HTML positioned over the SVG) */}
        {annotations.map(a => {
          const isHover = hoverSuite === a.suite
          return (
            <div
              key={`box-${a.suite}`}
              onMouseEnter={() => setHoverSuite(a.suite)}
              onMouseLeave={() => setHoverSuite(null)}
              onClick={() => onSelectSuite?.(a.suite)}
              style={{
                position: 'absolute', left: a.boxX, top: a.boxY,
                transform: `translate(${a.boxAnchorRight ? '-100%' : '0'}, -50%)`,
                maxWidth: 140, background: theme.surface,
                border: `1px solid ${isHover ? theme.danger : theme.danger + '99'}`,
                borderRadius: theme.radius, padding: '6px 8px',
                boxShadow: isHover ? '0 6px 18px rgba(0,0,0,0.5)' : undefined,
                cursor: onSelectSuite ? 'pointer' : 'default', zIndex: isHover ? 5 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <MonoTag tone="dim">{abbreviate(a.suite)}</MonoTag>
                <span style={{ fontSize: 11, color: theme.danger, fontWeight: 700 }}>{a.score.toFixed(0)}</span>
              </div>
              {a.worstFailure ? (
                <>
                  <div style={{ fontSize: 10, color: theme.textDim, fontFamily: theme.monoFamily, marginBottom: 2 }}>
                    {a.worstFailure.sample_id}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: severityColor(a.worstFailure.severity) }} />
                    <span style={{ fontSize: 9, color: severityColor(a.worstFailure.severity), textTransform: 'uppercase' }}>
                      {a.worstFailure.severity}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: theme.textFaint, lineHeight: 1.4 }}>
                    {a.worstFailure.question.slice(0, 40)}{a.worstFailure.question.length > 40 ? '…' : ''}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 10, color: theme.textFaint }}>无失败样本</div>
              )}
            </div>
          )
        })}
      </div>

      {/* No-weakness state */}
      {weakSpots.length === 0 && (
        <div style={{ textAlign: 'center', color: theme.success, fontSize: 12, fontWeight: 600, marginTop: 8 }}>
          无明显弱点 ✓
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <LegendDot color={theme.success} label="安全 (≥80)" />
        <LegendDot color={theme.warning} label="需关注 (50-79)" />
        <LegendDot color={theme.danger} label="危险 (<50)" />
        <LegendBox label="弱点标注" />
      </div>

      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y + 12, zIndex: 300,
          pointerEvents: 'none', background: theme.surface,
          border: `1px solid ${theme.borderActive}`, borderRadius: theme.radius,
          padding: '5px 9px', fontSize: 11, color: theme.text,
          fontFamily: theme.monoFamily, whiteSpace: 'nowrap',
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        }}>
          {tooltip.text}
        </div>
      )}
    </Panel>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 11, color: theme.textDim }}>{label}</span>
    </div>
  )
}

function LegendBox({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 10, borderRadius: 2, border: `1px solid ${theme.danger}`, background: theme.surface }} />
      <span style={{ fontSize: 11, color: theme.textDim }}>{label}</span>
    </div>
  )
}
