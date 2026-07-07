/**
 * SuiteDependencyGraph — force-directed graph of attack suites. Edge thickness
 * = how often two suites fail together (sharing a tag on the same fail
 * sample), surfacing "vulnerabilities cluster" patterns (e.g. injection often
 * co-occurs with tool_abuse / info_leak / sensitive_data).
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'
import type { SampleResult } from '../types'

interface SuiteDependencyGraphProps {
  samples: SampleResult[]
  width?: number
  height?: number
  onSelectSuite?: (suite: string) => void
}

export interface CooccurrenceNode {
  suite: string
  failCount: number
  suiteScore: number
}

export interface CooccurrenceEdge {
  a: string
  b: string
  weight: number
}

const MIN_EDGE_WEIGHT = 2

export function computeCooccurrence(samples: SampleResult[]): {
  nodes: CooccurrenceNode[]
  edges: CooccurrenceEdge[]
} {
  const fails = samples.filter(s => s.verdict === 'fail')

  const failsBySuite = new Map<string, SampleResult[]>()
  for (const s of fails) {
    const list = failsBySuite.get(s.suite) ?? []
    list.push(s)
    failsBySuite.set(s.suite, list)
  }

  const suiteNames = Array.from(failsBySuite.keys())
  const nodes: CooccurrenceNode[] = suiteNames.map(suite => {
    const suiteFails = failsBySuite.get(suite)!
    const total = samples.filter(s => s.suite === suite).length
    const passed = samples.filter(s => s.suite === suite && s.verdict === 'pass').length
    const suiteScore = total > 0 ? (passed / total) * 100 : 0
    return { suite, failCount: suiteFails.length, suiteScore }
  })

  const edgeCounts = new Map<string, number>()
  for (let i = 0; i < suiteNames.length; i++) {
    for (let j = i + 1; j < suiteNames.length; j++) {
      const suiteA = suiteNames[i]
      const suiteB = suiteNames[j]
      const failsA = failsBySuite.get(suiteA)!
      const failsB = failsBySuite.get(suiteB)!
      let count = 0
      for (const fa of failsA) {
        for (const fb of failsB) {
          if (fa.tags.some(tag => fb.tags.includes(tag))) count++
        }
      }
      if (count > 0) edgeCounts.set(`${suiteA}|${suiteB}`, count)
    }
  }

  const edges: CooccurrenceEdge[] = Array.from(edgeCounts.entries())
    .map(([key, weight]) => {
      const [a, b] = key.split('|')
      return { a, b, weight }
    })
    .filter(e => e.weight >= MIN_EDGE_WEIGHT)

  return { nodes, edges }
}

interface Point { x: number; y: number }

export function layoutForce(
  nodes: Array<{ suite: string; failCount: number }>,
  edges: Array<{ a: string; b: string; weight: number }>,
  width: number,
  height: number,
  iterations = 100,
): Map<string, Point> {
  const cx = width / 2
  const cy = height / 2
  const pos = new Map<string, Point>()
  const vel = new Map<string, Point>()

  // Deterministic initial placement on a circle (stable across re-renders).
  nodes.forEach((n, i) => {
    const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
    const r = Math.min(width, height) * 0.3
    pos.set(n.suite, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
    vel.set(n.suite, { x: 0, y: 0 })
  })

  const REPULSION = 2200
  const SPRING = 0.02
  const IDEAL_LEN = Math.min(width, height) * 0.28
  const CENTER_PULL = 0.01
  const DAMPING = 0.85

  for (let it = 0; it < iterations; it++) {
    // Repulsion between every pair
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].suite)!
        const b = pos.get(nodes[j].suite)!
        let dx = a.x - b.x
        let dy = a.y - b.y
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01
        const force = REPULSION / (dist * dist)
        dx = (dx / dist) * force
        dy = (dy / dist) * force
        const va = vel.get(nodes[i].suite)!
        const vb = vel.get(nodes[j].suite)!
        va.x += dx; va.y += dy
        vb.x -= dx; vb.y -= dy
      }
    }

    // Spring attraction along edges, proportional to weight
    for (const e of edges) {
      const a = pos.get(e.a)
      const b = pos.get(e.b)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const stretch = dist - IDEAL_LEN
      const force = SPRING * stretch * Math.min(3, e.weight)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      const va = vel.get(e.a)!
      const vb = vel.get(e.b)!
      va.x += fx; va.y += fy
      vb.x -= fx; vb.y -= fy
    }

    // Gentle pull toward center + integrate + damp
    for (const n of nodes) {
      const p = pos.get(n.suite)!
      const v = vel.get(n.suite)!
      v.x += (cx - p.x) * CENTER_PULL
      v.y += (cy - p.y) * CENTER_PULL
      v.x *= DAMPING
      v.y *= DAMPING
      p.x += v.x
      p.y += v.y
    }
  }

  // Clamp to canvas with padding
  const pad = 40
  for (const n of nodes) {
    const p = pos.get(n.suite)!
    p.x = Math.max(pad, Math.min(width - pad, p.x))
    p.y = Math.max(pad, Math.min(height - pad, p.y))
  }

  return pos
}

function nodeColor(score: number): string {
  return score < 50 ? theme.danger : score < 70 ? theme.warning : theme.success
}

function nodeRadius(failCount: number): number {
  return 8 + Math.sqrt(failCount) * 2
}

export function SuiteDependencyGraph({ samples, width = 640, height = 440, onSelectSuite }: SuiteDependencyGraphProps) {
  const [hoverSuite, setHoverSuite] = useState<string | null>(null)

  const { nodes, edges } = useMemo(() => computeCooccurrence(samples), [samples])
  const positions = useMemo(
    () => layoutForce(nodes, edges, width, height),
    [nodes, edges, width, height],
  )

  if (nodes.length === 0) {
    return (
      <Panel title="套件依赖关系图" subtitle="力导向图 · 连线粗细=同时失败频率">
        <div style={{ padding: 32, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>
          无失败样本，暂无关联可分析
        </div>
      </Panel>
    )
  }

  const maxWeight = edges.reduce((m, e) => Math.max(m, e.weight), 1)
  const connected = new Set<string>()
  if (hoverSuite) {
    for (const e of edges) {
      if (e.a === hoverSuite) connected.add(e.b)
      if (e.b === hoverSuite) connected.add(e.a)
    }
  }

  return (
    <Panel title="套件依赖关系图" subtitle="力导向图 · 连线粗细=同时失败频率">
      {edges.length === 0 && (
        <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 8 }}>
          暂无显著关联（共现 &lt; {MIN_EDGE_WEIGHT} 次的连线已过滤）
        </div>
      )}
      <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}>
        {/* Edges */}
        {edges.map(e => {
          const a = positions.get(e.a)
          const b = positions.get(e.b)
          if (!a || !b) return null
          const isActive = hoverSuite === e.a || hoverSuite === e.b
          const strokeWidth = Math.max(0.5, Math.min(4, (e.weight / maxWeight) * 4))
          const opacity = hoverSuite && !isActive ? 0.08 : e.weight / maxWeight
          return (
            <line
              key={`${e.a}|${e.b}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={isActive ? theme.primary : theme.borderActive}
              strokeWidth={isActive ? strokeWidth + 1 : strokeWidth}
              opacity={opacity}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map(n => {
          const p = positions.get(n.suite)
          if (!p) return null
          const isHover = hoverSuite === n.suite
          const isDimmed = hoverSuite !== null && !isHover && !connected.has(n.suite)
          const r = nodeRadius(n.failCount) + (isHover ? 3 : 0)
          return (
            <g
              key={n.suite}
              opacity={isDimmed ? 0.35 : 1}
              style={{ cursor: onSelectSuite ? 'pointer' : 'default' }}
              onMouseEnter={() => setHoverSuite(n.suite)}
              onMouseLeave={() => setHoverSuite(null)}
              onClick={() => onSelectSuite?.(n.suite)}
            >
              <circle cx={p.x} cy={p.y} r={r} fill={nodeColor(n.suiteScore)} stroke={theme.surface} strokeWidth={2} />
              <text
                x={p.x + r + 4} y={p.y + r + 2}
                fontSize={10} fill={theme.textDim} fontFamily={theme.monoFamily}
              >
                {n.suite}
              </text>
              {isHover && (
                <text
                  x={p.x} y={p.y - r - 6}
                  textAnchor="middle" fontSize={10} fill={theme.text} fontFamily={theme.monoFamily}
                >
                  {n.failCount} 个失败 · {n.suiteScore.toFixed(0)} 分
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
        <LegendDot color={theme.success} label="通过率高 (≥70)" />
        <LegendDot color={theme.warning} label="需关注 (50-69)" />
        <LegendDot color={theme.danger} label="通过率低 (<50)" />
        <span style={{ fontSize: 11, color: theme.textFaint }}>节点大小 = 失败样本数 · 连线 = 共享标签的共同失败</span>
      </div>
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
