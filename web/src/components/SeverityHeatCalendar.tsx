/**
 * SeverityHeatCalendar — GitHub-contribution-style heatmap where each cell is a
 * scan run, colored by failure severity. Reveals whether the model's safety
 * posture is improving or degrading over time.
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'

interface CalendarEntry {
  date: string
  score: number
  severeFails: number
  scanCount: number
  model: string
}

interface SeverityHeatCalendarProps {
  entries: CalendarEntry[]
  weeks?: number
}

interface Cell {
  date: string
  entry?: CalendarEntry
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const CELL = 12
const GAP = 3

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Monday of the week containing d (getDay: 0=Sun..6=Sat → shift to Mon-based). */
function mondayOf(d: Date): Date {
  const offset = (d.getDay() + 6) % 7
  return addDays(d, -offset)
}

function alphaHex(opacity: number): string {
  return Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0')
}

export function severityColor(score: number, severeFails: number): { color: string; opacity: number } {
  if (score < 0) return { color: theme.textFaint, opacity: 0.45 }
  const color = score >= 80 ? theme.success : score >= 50 ? theme.warning : theme.danger
  // More critical/high fails → more opaque (draws the eye). Floor keeps a clean
  // pass clearly visible even with zero severe fails.
  const opacity = Math.min(1, 0.4 + severeFails * 0.12)
  return { color, opacity }
}

export function buildCalendar(entries: CalendarEntry[], weeks: number): {
  columns: Cell[][]
  monthLabels: Array<{ weekIndex: number; label: string }>
} {
  const byDate = new Map(entries.map(e => [e.date, e]))
  const startMonday = addDays(mondayOf(new Date()), -(weeks - 1) * 7)

  const columns: Cell[][] = []
  const monthLabels: Array<{ weekIndex: number; label: string }> = []
  let lastMonth = -1

  for (let w = 0; w < weeks; w++) {
    const colMonday = addDays(startMonday, w * 7)
    const col: Cell[] = []
    for (let dow = 0; dow < 7; dow++) {
      const d = addDays(colMonday, dow)
      const iso = toISO(d)
      col.push({ date: iso, entry: byDate.get(iso) })
    }
    const month = colMonday.getMonth()
    if (month !== lastMonth) {
      monthLabels.push({ weekIndex: w, label: MONTHS[month] })
      lastMonth = month
    }
    columns.push(col)
  }

  return { columns, monthLabels }
}

/** Average score (excluding failed scans) over a date window [fromISO, toISO]. */
function avgScore(entries: CalendarEntry[], fromISO: string, toISO: string): number | null {
  const scored = entries.filter(e => e.date >= fromISO && e.date <= toISO && e.score >= 0)
  if (scored.length === 0) return null
  return scored.reduce((s, e) => s + e.score, 0) / scored.length
}

function computeTrend(entries: CalendarEntry[]): { recent: number | null; delta: number | null } {
  const today = new Date()
  const recentFrom = toISO(addDays(today, -6))
  const recentTo = toISO(today)
  const prevFrom = toISO(addDays(today, -13))
  const prevTo = toISO(addDays(today, -7))
  const recent = avgScore(entries, recentFrom, recentTo)
  const prev = avgScore(entries, prevFrom, prevTo)
  const delta = recent !== null && prev !== null ? recent - prev : null
  return { recent, delta }
}

export function SeverityHeatCalendar({ entries, weeks = 16 }: SeverityHeatCalendarProps) {
  const [tooltip, setTooltip] = useState<{ cell: Cell; x: number; y: number } | null>(null)

  const { columns, monthLabels } = useMemo(() => buildCalendar(entries, weeks), [entries, weeks])
  const trend = useMemo(() => computeTrend(entries), [entries])
  const todayISO = toISO(new Date())

  if (entries.length === 0) {
    return (
      <Panel title="安全趋势热力" subtitle="每个格子=一次扫描，颜色=严重度">
        <div style={{ padding: 32, textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>
          还没有扫描记录
        </div>
      </Panel>
    )
  }

  const gridWidth = columns.length * (CELL + GAP)

  function cellStyle(cell: Cell): React.CSSProperties {
    const base: React.CSSProperties = {
      width: CELL, height: CELL, borderRadius: theme.radiusSm,
      transition: theme.transition, cursor: cell.entry ? 'pointer' : 'default',
    }
    if (cell.date > todayISO) {
      return { ...base, background: 'transparent', visibility: 'hidden' }
    }
    if (!cell.entry) {
      return { ...base, background: 'transparent', border: `1px solid ${theme.border}66` }
    }
    const { color, opacity } = severityColor(cell.entry.score, cell.entry.severeFails)
    const style: React.CSSProperties = { ...base, background: color + alphaHex(opacity) }
    if (cell.entry.score < 0) {
      style.backgroundImage = `repeating-linear-gradient(45deg, ${theme.textDim}55 0 2px, transparent 2px 4px)`
    }
    return style
  }

  return (
    <Panel title="安全趋势热力" subtitle="每个格子=一次扫描，颜色=严重度">
      <div style={{ display: 'flex', gap: 6 }}>
        {/* Weekday labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, paddingTop: 18, width: 26 }}>
          {WEEKDAYS.map((wd, i) => (
            <div key={wd} style={{ height: CELL, fontSize: 9, color: theme.textFaint, lineHeight: `${CELL}px` }}>
              {i % 2 === 0 ? wd : ''}
            </div>
          ))}
        </div>

        <div>
          {/* Month labels */}
          <div style={{ position: 'relative', height: 14, width: gridWidth }}>
            {monthLabels.map(m => (
              <span
                key={`${m.label}-${m.weekIndex}`}
                style={{
                  position: 'absolute', left: m.weekIndex * (CELL + GAP),
                  fontSize: 9, color: theme.textFaint, fontFamily: theme.monoFamily,
                }}
              >
                {m.label}
              </span>
            ))}
          </div>

          {/* Grid: columns = weeks */}
          <div style={{ display: 'flex', gap: GAP }}>
            {columns.map((col, ci) => (
              <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                {col.map(cell => (
                  <div
                    key={cell.date}
                    style={cellStyle(cell)}
                    onMouseEnter={cell.entry ? e => setTooltip({ cell, x: e.clientX, y: e.clientY }) : undefined}
                    onMouseMove={cell.entry ? e => setTooltip({ cell, x: e.clientX, y: e.clientY }) : undefined}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend + trend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
        <LegendSwatch color={theme.success} label="安全 (≥80)" />
        <LegendSwatch color={theme.warning} label="需关注 (50-79)" />
        <LegendSwatch color={theme.danger} label="危险 (<50)" />
        <LegendSwatch striped label="扫描失败" />
        <div style={{ flex: 1 }} />
        <TrendLabel recent={trend.recent} delta={trend.delta} />
      </div>

      {tooltip && tooltip.cell.entry && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y + 12, zIndex: 300,
          pointerEvents: 'none', background: theme.surface,
          border: `1px solid ${theme.borderActive}`, borderRadius: theme.radius,
          padding: '8px 10px', fontSize: 11, color: theme.text,
          fontFamily: theme.monoFamily, whiteSpace: 'nowrap',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', lineHeight: 1.6,
        }}>
          <div style={{ color: theme.textDim }}>{tooltip.cell.date}</div>
          <div>{tooltip.cell.entry.model}</div>
          <div>
            分数：{tooltip.cell.entry.score < 0 ? '扫描失败' : tooltip.cell.entry.score.toFixed(1)}
          </div>
          <div style={{ color: theme.textFaint }}>
            {tooltip.cell.entry.scanCount} 次扫描 · {tooltip.cell.entry.severeFails} 个严重失败
          </div>
        </div>
      )}
    </Panel>
  )
}

function LegendSwatch({ color, striped, label }: { color?: string; striped?: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: CELL, height: CELL, borderRadius: theme.radiusSm,
        background: striped ? theme.textFaint + '55' : (color || theme.textFaint) + '99',
        backgroundImage: striped
          ? `repeating-linear-gradient(45deg, ${theme.textDim}55 0 2px, transparent 2px 4px)`
          : undefined,
      }} />
      <span style={{ fontSize: 11, color: theme.textDim }}>{label}</span>
    </div>
  )
}

function TrendLabel({ recent, delta }: { recent: number | null; delta: number | null }) {
  if (recent === null) {
    return <span style={{ fontSize: 11, color: theme.textFaint }}>近7天暂无评分</span>
  }
  const avg = recent.toFixed(1)
  if (delta === null || Math.abs(delta) < 0.05) {
    return <span style={{ fontSize: 11, color: theme.textDim }}>近7天平均 {avg} 分（持平）</span>
  }
  const improved = delta > 0
  const color = improved ? theme.success : theme.danger
  const arrow = improved ? '↑' : '↓'
  const sign = improved ? '+' : '−'
  return (
    <span style={{ fontSize: 11, color, fontWeight: 600 }}>
      {arrow} 近7天平均 {avg} 分（{sign}{Math.abs(delta).toFixed(1)}）
    </span>
  )
}
