/** ScanLogViewer — structured scan log viewer with level filtering, search, and autoscroll, for debugging scan runs. */
import { useEffect, useRef, useState } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'

export interface LogEntry {
  timestamp: number | string
  level: 'error' | 'warn' | 'info' | 'debug'
  source: string
  message: string
  sampleId?: string
}

interface ScanLogViewerProps {
  entries: LogEntry[]
  maxEntries?: number
  defaultExpanded?: boolean
}

const LEVELS: LogEntry['level'][] = ['error', 'warn', 'info', 'debug']

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  error: theme.danger,
  warn: theme.warning,
  info: theme.primary,
  debug: theme.textFaint,
}

const LEVEL_TAG: Record<LogEntry['level'], string> = {
  error: 'ERR ',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DBG ',
}

export function filterLogs(
  entries: LogEntry[],
  levels: Set<LogEntry['level']>,
  query: string,
): LogEntry[] {
  const q = query.trim().toLowerCase()
  return entries.filter(e => {
    if (!levels.has(e.level)) return false
    if (!q) return true
    return (
      e.message.toLowerCase().includes(q) ||
      e.source.toLowerCase().includes(q) ||
      (e.sampleId ?? '').toLowerCase().includes(q)
    )
  })
}

export function formatTimestamp(ts: number | string): string {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts)
  if (isNaN(d.getTime())) return '--:--:--.---'
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

export function ScanLogViewer({ entries, maxEntries = 500, defaultExpanded = true }: ScanLogViewerProps) {
  const [levels, setLevels] = useState<Set<LogEntry['level']>>(new Set(LEVELS))
  const [query, setQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [cleared, setCleared] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [bodyExpanded, setBodyExpanded] = useState(defaultExpanded)
  const listRef = useRef<HTMLDivElement>(null)

  const effective = cleared ? [] : entries
  const truncatedCount = Math.max(0, effective.length - maxEntries)
  const visible = showAll ? effective : effective.slice(-maxEntries)

  const errorCount = effective.filter(e => e.level === 'error').length
  const warnCount = effective.filter(e => e.level === 'warn').length
  const infoCount = effective.filter(e => e.level === 'info').length
  const debugCount = effective.filter(e => e.level === 'debug').length
  const counts: Record<LogEntry['level'], number> = { error: errorCount, warn: warnCount, info: infoCount, debug: debugCount }

  const filtered = filterLogs(visible, levels, query)

  useEffect(() => {
    if (!autoScroll || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [filtered.length, autoScroll])

  function toggleLevel(level: LogEntry['level']) {
    const next = new Set(levels)
    if (next.has(level)) next.delete(level)
    else next.add(level)
    setLevels(next)
  }

  function handleScroll() {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    setAutoScroll(atBottom)
  }

  function copyMessage(msg: string) {
    navigator.clipboard?.writeText(msg)
  }

  return (
    <Panel
      title="扫描日志"
      subtitle={`${effective.length} 条 · ${errorCount} error · ${warnCount} warn`}
      action={
        <button
          onClick={() => setBodyExpanded(v => !v)}
          style={{
            padding: '4px 10px', fontSize: 11, cursor: 'pointer',
            background: theme.bg, border: `1px solid ${theme.border}`,
            borderRadius: theme.radiusSm, color: theme.textDim, transition: theme.transition,
          }}
        >
          {bodyExpanded ? '收起 ▲' : '展开 ▼'}
        </button>
      }
    >
      {!bodyExpanded ? null : (
      <>
      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {LEVELS.map(level => {
          const active = levels.has(level)
          const flagged = level === 'error' && errorCount > 0
          return (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              style={{
                padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: theme.monoFamily, letterSpacing: 0.5,
                background: active ? LEVEL_COLOR[level] + '18' : theme.bg,
                border: `1px solid ${active ? LEVEL_COLOR[level] : theme.border}`,
                borderRadius: theme.radiusSm,
                color: active ? LEVEL_COLOR[level] : theme.textFaint,
                boxShadow: flagged ? `0 0 0 1px ${theme.danger}` : 'none',
                transition: theme.transition,
              }}
            >
              {level.toUpperCase()} {counts[level]}
            </button>
          )
        })}

        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索 message / source / sample_id"
          style={{
            flex: 1, minWidth: 160, padding: '6px 10px', fontSize: 12,
            background: theme.bg, border: `1px solid ${theme.border}`,
            borderRadius: theme.radiusSm, color: theme.text, outline: 'none', fontFamily: 'inherit',
          }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: theme.textDim, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          自动滚动
        </label>

        <button
          onClick={() => setCleared(true)}
          style={{
            padding: '5px 10px', fontSize: 11, cursor: 'pointer',
            background: theme.bg, border: `1px solid ${theme.border}`,
            borderRadius: theme.radiusSm, color: theme.textDim, transition: theme.transition,
          }}
        >
          清空
        </button>
      </div>

      {/* Log list */}
      {effective.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: theme.textFaint }}>暂无日志</div>
      ) : levels.size === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: theme.textFaint }}>所有级别已被过滤</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: theme.textFaint }}>未匹配到日志</div>
      ) : (
        <>
          {!showAll && truncatedCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              style={{
                width: '100%', marginBottom: 6, padding: '6px', fontSize: 11, cursor: 'pointer',
                background: theme.bg, border: `1px solid ${theme.border}`,
                borderRadius: theme.radiusSm, color: theme.primary,
              }}
            >
              加载更多（已截断 {truncatedCount} 条）
            </button>
          )}
          <div
            ref={listRef}
            onScroll={handleScroll}
            style={{
              maxHeight: 400, overflowY: 'auto',
              background: theme.bg, border: `1px solid ${theme.border}`,
              borderRadius: theme.radiusSm, fontFamily: theme.monoFamily, fontSize: 12,
            }}
          >
            {filtered.map((e, i) => {
              const color = LEVEL_COLOR[e.level]
              const rowBg = e.level === 'error' ? theme.danger + '08' : e.level === 'warn' ? theme.warning + '06' : 'transparent'
              const expanded = expandedIdx === i
              return (
                <div key={i}>
                  <div
                    onClick={() => setExpandedIdx(expanded ? null : i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
                      background: rowBg, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = theme.surfaceHover)}
                    onMouseLeave={ev => (ev.currentTarget.style.background = rowBg)}
                  >
                    <span style={{ color: theme.textFaint, minWidth: 96, flexShrink: 0 }}>{formatTimestamp(e.timestamp)}</span>
                    <span style={{ color, minWidth: 36, flexShrink: 0, fontWeight: 700 }}>{LEVEL_TAG[e.level]}</span>
                    <span style={{ color: theme.textDim, flexShrink: 0 }}>{e.source}</span>
                    <span style={{ color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{e.message}</span>
                    {e.sampleId && <MonoTag tone="dim">{e.sampleId}</MonoTag>}
                  </div>
                  {expanded && (
                    <div style={{
                      padding: '8px 10px 12px 104px', background: theme.surface,
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      <div style={{ whiteSpace: 'pre-wrap', color: theme.text, fontSize: 12 }}>{e.message}</div>
                      <div>
                        <button
                          onClick={ev => { ev.stopPropagation(); copyMessage(e.message) }}
                          style={{
                            padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                            background: theme.bg, border: `1px solid ${theme.border}`,
                            borderRadius: theme.radiusSm, color: theme.textDim,
                          }}
                        >
                          复制
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
      </>
      )}
    </Panel>
  )
}
