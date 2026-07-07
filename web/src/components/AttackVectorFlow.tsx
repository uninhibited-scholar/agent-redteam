/**
 * AttackVectorFlow — Sankey-style flow of attack samples through
 * category → difficulty → result. Thick ribbons reveal which attack path
 * most easily breaches the model (e.g. "prompt injection → medium → fail").
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'
import type { SampleResult } from '../types'

type Verdict2 = 'pass' | 'fail'

export interface FlowDef {
  from: 'category' | 'difficulty'
  fromName: string
  to: 'difficulty' | 'result'
  toName: string
  count: number
  verdict: Verdict2
}

export interface ComputedFlow {
  categories: { name: string; count: number }[]
  difficulties: { name: string; count: number }[]
  results: { name: string; count: number }[]
  flows: FlowDef[]
}

interface PlacedNode {
  name: string
  y: number
  h: number
  count: number
}

interface FlowPath {
  d: string
  count: number
  verdict: Verdict2
  fromName: string
  toName: string
}

export interface Layout {
  categoryNodes: PlacedNode[]
  difficultyNodes: PlacedNode[]
  resultNodes: PlacedNode[]
  flowPaths: FlowPath[]
}

const DIFF_ORDER = ['easy', 'medium', 'hard', 'other']
const PAD = 40
const NODE_W = 10
const GAP = 4

function normalizeDifficulty(d: string): string {
  return DIFF_ORDER.includes(d) ? d : 'other'
}

function toResult(v: SampleResult['verdict']): Verdict2 {
  return v === 'pass' ? 'pass' : 'fail'
}

export function computeFlow(samples: SampleResult[]): ComputedFlow {
  const catCount: Record<string, number> = {}
  const diffCount: Record<string, number> = {}
  const resCount: Record<string, number> = {}

  interface Agg { from: FlowDef['from']; fromName: string; to: FlowDef['to']; toName: string; pass: number; fail: number }
  const agg = new Map<string, Agg>()

  const addFlow = (from: FlowDef['from'], fromName: string, to: FlowDef['to'], toName: string, verdict: Verdict2) => {
    const key = `${from}|${fromName}|${to}|${toName}`
    let e = agg.get(key)
    if (!e) {
      e = { from, fromName, to, toName, pass: 0, fail: 0 }
      agg.set(key, e)
    }
    e[verdict]++
  }

  for (const s of samples) {
    const c = s.category || 'other'
    const d = normalizeDifficulty(s.difficulty)
    const r = toResult(s.verdict)
    catCount[c] = (catCount[c] || 0) + 1
    diffCount[d] = (diffCount[d] || 0) + 1
    resCount[r] = (resCount[r] || 0) + 1
    addFlow('category', c, 'difficulty', d, r)
    addFlow('difficulty', d, 'result', r, r)
  }

  const categories = Object.entries(catCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
  const difficulties = DIFF_ORDER
    .filter(d => diffCount[d] > 0)
    .map(name => ({ name, count: diffCount[name] }))
  const results = (['pass', 'fail'] as const)
    .filter(r => resCount[r] > 0)
    .map(name => ({ name, count: resCount[name] }))

  const flows: FlowDef[] = Array.from(agg.values()).map(e => ({
    from: e.from,
    fromName: e.fromName,
    to: e.to,
    toName: e.toName,
    count: e.pass + e.fail,
    verdict: e.pass >= e.fail ? 'pass' : 'fail',
  }))

  return { categories, difficulties, results, flows }
}

function placeColumn(items: { name: string; count: number }[], usableH: number): { nodes: PlacedNode[]; map: Record<string, PlacedNode> } {
  const present = items.filter(i => i.count > 0)
  const total = present.reduce((s, i) => s + i.count, 0) || 1
  const gaps = Math.max(0, present.length - 1) * GAP
  const drawH = Math.max(0, usableH - gaps)
  const nodes: PlacedNode[] = []
  const map: Record<string, PlacedNode> = {}
  let y = PAD
  for (const it of present) {
    const h = (it.count / total) * drawH
    const node: PlacedNode = { name: it.name, y, h, count: it.count }
    nodes.push(node)
    map[it.name] = node
    y += h + GAP
  }
  return { nodes, map }
}

function buildRibbons(
  flows: FlowDef[],
  srcMap: Record<string, PlacedNode>,
  tgtMap: Record<string, PlacedNode>,
  x0: number,
  x1: number,
  out: FlowPath[],
): void {
  const srcTop = new Map<FlowDef, number>()
  const srcW = new Map<FlowDef, number>()
  const tgtTop = new Map<FlowDef, number>()
  const tgtW = new Map<FlowDef, number>()
  const srcAcc: Record<string, number> = {}
  const tgtAcc: Record<string, number> = {}

  const outSorted = [...flows].sort((a, b) =>
    (srcMap[a.fromName]?.y ?? 0) - (srcMap[b.fromName]?.y ?? 0) ||
    (tgtMap[a.toName]?.y ?? 0) - (tgtMap[b.toName]?.y ?? 0))
  for (const f of outSorted) {
    const n = srcMap[f.fromName]
    if (!n) continue
    const off = srcAcc[f.fromName] || 0
    const w = n.count ? (f.count / n.count) * n.h : 0
    srcTop.set(f, n.y + off)
    srcW.set(f, w)
    srcAcc[f.fromName] = off + w
  }

  const inSorted = [...flows].sort((a, b) =>
    (tgtMap[a.toName]?.y ?? 0) - (tgtMap[b.toName]?.y ?? 0) ||
    (srcMap[a.fromName]?.y ?? 0) - (srcMap[b.fromName]?.y ?? 0))
  for (const f of inSorted) {
    const n = tgtMap[f.toName]
    if (!n) continue
    const off = tgtAcc[f.toName] || 0
    const w = n.count ? (f.count / n.count) * n.h : 0
    tgtTop.set(f, n.y + off)
    tgtW.set(f, w)
    tgtAcc[f.toName] = off + w
  }

  const mx = (x0 + x1) / 2
  for (const f of flows) {
    if (!srcTop.has(f) || !tgtTop.has(f)) continue
    const y0 = srcTop.get(f)!
    const w0 = srcW.get(f)!
    const y1 = tgtTop.get(f)!
    const w1 = tgtW.get(f)!
    const d = `M ${x0} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1} ` +
      `L ${x1} ${y1 + w1} C ${mx} ${y1 + w1}, ${mx} ${y0 + w0}, ${x0} ${y0 + w0} Z`
    out.push({ d, count: f.count, verdict: f.verdict, fromName: f.fromName, toName: f.toName })
  }
}

export function layoutNodes(flow: ComputedFlow, width: number, height: number): Layout {
  const usableH = Math.max(0, height - 2 * PAD)
  const catX = width * 0.15
  const diffX = width * 0.5
  const resX = width * 0.85

  const cat = placeColumn(flow.categories, usableH)
  const diff = placeColumn(flow.difficulties, usableH)
  const res = placeColumn(flow.results, usableH)

  const flowPaths: FlowPath[] = []
  buildRibbons(flow.flows.filter(f => f.from === 'category'), cat.map, diff.map, catX + NODE_W, diffX, flowPaths)
  buildRibbons(flow.flows.filter(f => f.from === 'difficulty'), diff.map, res.map, diffX + NODE_W, resX, flowPaths)

  return {
    categoryNodes: cat.nodes,
    difficultyNodes: diff.nodes,
    resultNodes: res.nodes,
    flowPaths,
  }
}

function verdictFill(v: Verdict2): string {
  return v === 'pass' ? theme.success : theme.danger
}

interface AttackVectorFlowProps {
  samples: SampleResult[]
  suiteFilter?: string
  width?: number
  height?: number
}

interface NodeColumn {
  nodes: PlacedNode[]
  x: number
  labelSide: 'left' | 'right'
}

export function AttackVectorFlow({ samples, suiteFilter, width = 720, height = 400 }: AttackVectorFlowProps) {
  const [hoverFlow, setHoverFlow] = useState<string | null>(null)
  const [hoverNode, setHoverNode] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  const filtered = useMemo(
    () => (suiteFilter ? samples.filter(s => s.suite === suiteFilter) : samples),
    [samples, suiteFilter],
  )
  const flow = useMemo(() => computeFlow(filtered), [filtered])
  const layout = useMemo(() => layoutNodes(flow, width, height), [flow, width, height])

  const catX = width * 0.15
  const diffX = width * 0.5
  const resX = width * 0.85

  const columns: NodeColumn[] = [
    { nodes: layout.categoryNodes, x: catX, labelSide: 'right' },
    { nodes: layout.difficultyNodes, x: diffX, labelSide: 'right' },
    { nodes: layout.resultNodes, x: resX, labelSide: 'left' },
  ]

  return (
    <Panel title="攻击向量流向" subtitle="从攻击类型 → 难度 → 结果">
      {filtered.length === 0 ? (
        <div style={{
          height, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: theme.textFaint, fontSize: 13,
        }}>
          无样本数据
        </div>
      ) : (
        <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
          <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}>
            {/* Ribbons first so nodes/labels sit on top */}
            {layout.flowPaths.map(fp => {
              const key = `${fp.fromName}->${fp.toName}`
              const active = hoverFlow === key
              return (
                <path
                  key={key}
                  d={fp.d}
                  fill={verdictFill(fp.verdict)}
                  fillOpacity={active ? 0.6 : fp.verdict === 'pass' ? 0.3 : 0.4}
                  stroke="none"
                  style={{ cursor: 'pointer', transition: 'fill-opacity 120ms ease' }}
                  onMouseEnter={() => setHoverFlow(key)}
                  onMouseMove={e => setTooltip({
                    text: `${fp.fromName} → ${fp.toName}: ${fp.count} 个样本`,
                    x: e.nativeEvent.offsetX,
                    y: e.nativeEvent.offsetY,
                  })}
                  onMouseLeave={() => { setHoverFlow(null); setTooltip(null) }}
                />
              )
            })}

            {/* Node rects + labels */}
            {columns.map((col, ci) => col.nodes.map(node => {
              const nodeKey = `${ci}:${node.name}`
              const isHover = hoverNode === nodeKey
              const labelX = col.labelSide === 'right' ? col.x + NODE_W + 6 : col.x - 6
              const anchor = col.labelSide === 'right' ? 'start' : 'end'
              return (
                <g key={nodeKey}>
                  <rect
                    x={col.x}
                    y={node.y}
                    width={NODE_W}
                    height={Math.max(1, node.h)}
                    rx={3}
                    fill={isHover ? theme.primary : theme.borderActive}
                    style={{ cursor: 'default', transition: 'fill 120ms ease' }}
                    onMouseEnter={() => setHoverNode(nodeKey)}
                    onMouseLeave={() => setHoverNode(null)}
                  />
                  <text
                    x={labelX}
                    y={node.y + node.h / 2 - 1}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    fontSize={11}
                    fontFamily={theme.fontFamily}
                    fill={theme.textDim}
                  >
                    {node.name}
                  </text>
                  <text
                    x={labelX}
                    y={node.y + node.h / 2 + 11}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    fontSize={10}
                    fontFamily={theme.monoFamily}
                    fill={theme.textFaint}
                  >
                    {node.count}
                  </text>
                </g>
              )
            }))}
          </svg>

          {tooltip && (
            <div style={{
              position: 'absolute', left: tooltip.x + 12, top: tooltip.y + 12,
              pointerEvents: 'none', zIndex: 10,
              background: theme.surface, border: `1px solid ${theme.borderActive}`,
              borderRadius: theme.radius, padding: '5px 9px',
              fontSize: 11, color: theme.text, fontFamily: theme.monoFamily,
              whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
            }}>
              {tooltip.text}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <LegendItem color={theme.success} label="pass" />
        <LegendItem color={theme.danger} label="fail" />
      </div>
    </Panel>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 16, height: 8, borderRadius: 2, background: color, opacity: 0.5 }} />
      <span style={{ fontSize: 11, color: theme.textDim, fontFamily: theme.monoFamily }}>{label}</span>
    </div>
  )
}
