/**
 * ModelComparisonMatrix — heatmap matrix of N models × suites. Rows = models,
 * columns = suites, cell = that model's score on that suite. Upgrades the
 * Compare page from "A vs B" to "A vs B vs C vs ...".
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'

interface ModelSuiteScore {
  model: string
  suites: Record<string, number>
  overall: number
}

interface ModelComparisonMatrixProps {
  models: ModelSuiteScore[]
  suiteOrder?: string[]
  onSelectCell?: (model: string, suite: string) => void
  onSelectModel?: (model: string) => void
}

export function scoreToHeat(score: number): { bg: string; fg: string } {
  if (score < 0) return { bg: theme.surfaceHover, fg: theme.textFaint }
  if (score >= 90) return { bg: theme.success, fg: '#FFFFFF' }
  if (score >= 80) return { bg: theme.success + 'B3', fg: '#FFFFFF' }
  if (score >= 70) return { bg: theme.success + '4D', fg: theme.text }
  if (score >= 60) return { bg: theme.warning + '80', fg: theme.text }
  if (score >= 50) return { bg: theme.warning, fg: '#FFFFFF' }
  return { bg: theme.danger, fg: '#FFFFFF' }
}

function collectSuiteNames(models: ModelSuiteScore[], suiteOrder?: string[]): string[] {
  if (suiteOrder && suiteOrder.length > 0) return suiteOrder
  const set = new Set<string>()
  for (const m of models) {
    for (const s of Object.keys(m.suites)) set.add(s)
  }
  return Array.from(set).sort()
}

function columnStats(models: ModelSuiteScore[], suite: string): { best?: string; worst?: string; avg: number | null } {
  const scored = models
    .map(m => ({ model: m.model, score: m.suites[suite] }))
    .filter((e): e is { model: string; score: number } => typeof e.score === 'number' && e.score >= 0)
  if (scored.length === 0) return { avg: null }
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a))
  const worst = scored.reduce((a, b) => (b.score < a.score ? b : a))
  const avg = scored.reduce((sum, e) => sum + e.score, 0) / scored.length
  return { best: best.model, worst: worst.model, avg }
}

export function ModelComparisonMatrix({ models, suiteOrder, onSelectCell, onSelectModel }: ModelComparisonMatrixProps) {
  const [hoverRow, setHoverRow] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  const suites = useMemo(() => collectSuiteNames(models, suiteOrder), [models, suiteOrder])
  const stats = useMemo(() => {
    const map = new Map<string, ReturnType<typeof columnStats>>()
    for (const s of suites) map.set(s, columnStats(models, s))
    return map
  }, [models, suites])

  const topModel = useMemo(
    () => models.reduce<ModelSuiteScore | undefined>((best, m) => (!best || m.overall > best.overall ? m : best), undefined),
    [models],
  )

  if (models.length === 0) {
    return (
      <Panel title="多模型对比矩阵" subtitle="无模型数据">
        <div style={{ padding: 32, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>
          无模型数据
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="多模型对比矩阵" subtitle={`${models.length} 个模型 × ${suites.length} 个套件`}>
      <div style={{ maxHeight: models.length > 8 ? 480 : undefined, overflowY: models.length > 8 ? 'auto' : undefined, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 120 + suites.length * 90 }}>
          <thead>
            <tr>
              <th style={headCellStyle}></th>
              {suites.map(s => (
                <th key={s} style={{ ...headCellStyle, textAlign: 'center' }}>
                  <MonoTag tone="dim">{s}</MonoTag>
                </th>
              ))}
              <th style={{ ...headCellStyle, textAlign: 'center' }}>Overall</th>
            </tr>
          </thead>
          <tbody>
            {models.map(m => (
              <tr
                key={m.model}
                onMouseEnter={() => setHoverRow(m.model)}
                onMouseLeave={() => setHoverRow(null)}
                style={{ background: hoverRow === m.model ? theme.surfaceHover : 'transparent', transition: theme.transition }}
              >
                <td
                  onClick={() => onSelectModel?.(m.model)}
                  style={{
                    ...bodyCellStyle, fontFamily: theme.monoFamily, fontSize: 12, color: theme.text,
                    cursor: onSelectModel ? 'pointer' : 'default', whiteSpace: 'nowrap',
                  }}
                >
                  {m.model}
                  <div style={{ fontSize: 10, color: theme.textFaint }}>{m.overall.toFixed(0)} 分</div>
                </td>

                {suites.map(s => {
                  const score = m.suites[s]
                  const has = typeof score === 'number'
                  const { bg, fg } = has ? scoreToHeat(score) : scoreToHeat(-1)
                  const colStat = stats.get(s)
                  const isBest = has && colStat?.best === m.model
                  const isWorst = has && colStat?.worst === m.model && colStat.best !== colStat.worst
                  const border = isBest ? theme.success : isWorst ? theme.danger : 'transparent'
                  return (
                    <td key={s} style={{ ...bodyCellStyle, padding: 4, textAlign: 'center' }}>
                      <div
                        onClick={() => onSelectCell?.(m.model, s)}
                        onMouseEnter={e => setTooltip({
                          text: `${m.model} · ${s}: ${has ? score.toFixed(0) : '无数据'}`,
                          x: e.clientX, y: e.clientY,
                        })}
                        onMouseMove={e => setTooltip({
                          text: `${m.model} · ${s}: ${has ? score.toFixed(0) : '无数据'}`,
                          x: e.clientX, y: e.clientY,
                        })}
                        onMouseLeave={() => setTooltip(null)}
                        style={{
                          background: bg, color: fg, borderRadius: theme.radiusSm,
                          border: `2px solid ${border}`, padding: '8px 4px',
                          fontSize: 12, fontWeight: 600, cursor: onSelectCell ? 'pointer' : 'default',
                          transition: theme.transition,
                        }}
                      >
                        {has ? score.toFixed(0) : '—'}
                      </div>
                    </td>
                  )
                })}

                <td style={{ ...bodyCellStyle, textAlign: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: scoreToHeat(m.overall).bg === theme.surfaceHover ? theme.textFaint : vertexTextColor(m.overall) }}>
                    {m.overall.toFixed(0)}
                  </span>
                  {topModel?.model === m.model && <span style={{ marginLeft: 4 }}>👑</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={bodyCellStyle}>
                <span style={{ fontSize: 10, color: theme.textFaint }}>最高 / 平均</span>
              </td>
              {suites.map(s => {
                const st = stats.get(s)
                return (
                  <td key={s} style={{ ...bodyCellStyle, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: theme.success, fontFamily: theme.monoFamily }}>{st?.best ?? '—'}</div>
                    <div style={{ fontSize: 10, color: theme.textFaint }}>{st?.avg != null ? st.avg.toFixed(0) : '—'}</div>
                  </td>
                )
              })}
              <td style={bodyCellStyle}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
        <span style={{ fontSize: 10, color: theme.textFaint }}>&lt;50</span>
        <div style={{
          flex: 1, maxWidth: 240, height: 8, borderRadius: 4,
          background: `linear-gradient(90deg, ${theme.danger}, ${theme.warning}, ${theme.success}80, ${theme.success})`,
        }} />
        <span style={{ fontSize: 10, color: theme.textFaint }}>50</span>
        <span style={{ fontSize: 10, color: theme.textFaint }}>70</span>
        <span style={{ fontSize: 10, color: theme.textFaint }}>80</span>
        <span style={{ fontSize: 10, color: theme.textFaint }}>90+</span>
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

function vertexTextColor(score: number): string {
  return score >= 80 ? theme.success : score >= 50 ? theme.warning : theme.danger
}

const headCellStyle: React.CSSProperties = {
  padding: '6px 8px', borderBottom: `1px solid ${theme.border}`,
  fontSize: 11, color: theme.textDim, fontWeight: 600,
}

const bodyCellStyle: React.CSSProperties = {
  padding: '6px 8px', borderBottom: `1px solid ${theme.border}`,
}
