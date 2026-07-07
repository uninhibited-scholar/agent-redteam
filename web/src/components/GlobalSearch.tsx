/** GlobalSearch — full-text search across samples, suites, scan history, and annotations. "Google for your security data". */
import { useEffect, useMemo, useRef, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'
import { useApi } from '../hooks/useApi'
import { loadAllAnnotations } from './AnnotationLayer'
import type { SampleResult, SamplesResponse, HistoryItem } from '../types'

interface GlobalSearchProps {
  placeholder?: string
  onSelectSample?: (sampleId: string) => void
  onSelectSuite?: (suite: string) => void
  onSelectScan?: (runId: string) => void
}

export interface SearchResult {
  type: 'sample' | 'suite' | 'scan' | 'annotation'
  id: string
  primary: string
  secondary: string
  matchField: string
}

const MIN_QUERY_LEN = 2
const TOO_BROAD_THRESHOLD = 200
const GROUP_LIMIT = 5

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

export function searchAll(
  query: string,
  samples: SampleResult[],
  scans: HistoryItem[],
  annotations: Record<string, unknown[]>,
): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (q.length < MIN_QUERY_LEN) return []

  const results: SearchResult[] = []

  for (const s of samples) {
    if (s.sample_id.toLowerCase().includes(q)) {
      results.push({ type: 'sample', id: s.sample_id, primary: s.sample_id, secondary: truncate(s.question, 80), matchField: 'sample_id' })
    } else if (s.question.toLowerCase().includes(q)) {
      results.push({ type: 'sample', id: s.sample_id, primary: s.sample_id, secondary: truncate(s.question, 80), matchField: 'question' })
    } else if (s.response.toLowerCase().includes(q)) {
      results.push({ type: 'sample', id: s.sample_id, primary: s.sample_id, secondary: truncate(s.response, 80), matchField: 'response' })
    }
  }

  const suiteNames = new Set<string>()
  for (const s of samples) {
    if (s.suite.toLowerCase().includes(q)) suiteNames.add(s.suite)
  }
  for (const name of suiteNames) {
    const count = samples.filter(s => s.suite === name).length
    results.push({ type: 'suite', id: name, primary: name, secondary: `${count} 个样本`, matchField: 'suite' })
  }

  for (const scan of scans) {
    if (scan.run_id.toLowerCase().includes(q)) {
      results.push({ type: 'scan', id: scan.run_id, primary: scan.target_model, secondary: scan.created_at, matchField: 'runId' })
    } else if (scan.target_model.toLowerCase().includes(q)) {
      results.push({ type: 'scan', id: scan.run_id, primary: scan.target_model, secondary: scan.created_at, matchField: 'model' })
    }
  }

  for (const [sampleId, list] of Object.entries(annotations)) {
    for (const raw of list) {
      const a = raw as { text?: string; type?: string }
      if (typeof a.text === 'string' && a.text.toLowerCase().includes(q)) {
        results.push({ type: 'annotation', id: sampleId, primary: sampleId, secondary: truncate(a.text, 80), matchField: 'text' })
      }
    }
  }

  return results
}

/** Renders text with the matched substring highlighted in primary color. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: theme.primary, fontWeight: 700 }}>{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  )
}

const TYPE_META: Record<SearchResult['type'], { icon: string; label: string }> = {
  sample: { icon: '◉', label: '样本' },
  suite: { icon: '▦', label: '套件' },
  scan: { icon: '🕐', label: '扫描历史' },
  annotation: { icon: '✎', label: '标注' },
}

const GROUP_ORDER: SearchResult['type'][] = ['sample', 'suite', 'scan', 'annotation']

export function GlobalSearch({ placeholder = '搜索样本、套件、扫描历史、标注…', onSelectSample, onSelectSuite, onSelectScan }: GlobalSearchProps) {
  const [rawQuery, setRawQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: samplesData } = useApi<SamplesResponse>('/api/samples?page=1&page_size=500')
  const { data: historyData } = useApi<{ scans: HistoryItem[] }>('/api/history?limit=50')

  useEffect(() => {
    const id = setTimeout(() => setDebounced(rawQuery), 200)
    return () => clearTimeout(id)
  }, [rawQuery])

  const samples = samplesData?.items ?? []
  const scans = historyData?.scans ?? []
  const annotations = useMemo(() => loadAllAnnotations(), [debounced])

  const hasDataSource = samples.length > 0 || scans.length > 0 || Object.keys(annotations).length > 0
  const allResults = useMemo(
    () => searchAll(debounced, samples, scans, annotations as Record<string, unknown[]>),
    [debounced, samples, scans, annotations],
  )

  const tooBroad = debounced.trim().length > 0 && debounced.trim().length < 3 && allResults.length > TOO_BROAD_THRESHOLD

  const grouped = GROUP_ORDER.map(type => ({
    type,
    items: allResults.filter(r => r.type === type).slice(0, GROUP_LIMIT),
    total: allResults.filter(r => r.type === type).length,
  })).filter(g => g.total > 0)

  const flatItems = grouped.flatMap(g => g.items)

  function handleSelect(result: SearchResult) {
    if (result.type === 'sample' || result.type === 'annotation') onSelectSample?.(result.id)
    else if (result.type === 'suite') onSelectSuite?.(result.id)
    else if (result.type === 'scan') onSelectScan?.(result.id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = flatItems[highlightIdx]
      if (target) handleSelect(target)
    } else if (e.key === 'Escape') {
      setRawQuery('')
      setDebounced('')
      setHighlightIdx(0)
    } else if (e.key === 'Tab' && groupStarts.length > 1) {
      e.preventDefault()
      const currentGroup = groupStarts.filter(start => start <= highlightIdx).length - 1
      const nextGroup = e.shiftKey
        ? (currentGroup - 1 + groupStarts.length) % groupStarts.length
        : (currentGroup + 1) % groupStarts.length
      setHighlightIdx(groupStarts[nextGroup])
    }
  }

  useEffect(() => { setHighlightIdx(0) }, [debounced])

  const groupStarts: number[] = []
  let cursor = 0
  for (const g of grouped) {
    groupStarts.push(cursor)
    cursor += g.items.length
  }
  cursor = 0

  return (
    <Panel title="全局搜索">
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: theme.textFaint, fontSize: 16 }}>
          🔍
        </span>
        <input
          ref={inputRef}
          value={rawQuery}
          onChange={e => setRawQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '12px 90px 12px 40px', fontSize: 14,
            background: theme.bg, border: `1px solid ${theme.borderActive}`,
            borderRadius: theme.radius, color: theme.text, outline: 'none', fontFamily: 'inherit',
          }}
        />
        {debounced.trim().length >= MIN_QUERY_LEN && (
          <span style={{
            position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
            fontSize: 12, color: theme.textFaint,
          }}>
            {allResults.length} 个结果
          </span>
        )}
      </div>

      {!hasDataSource && (
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: theme.textFaint }}>
          暂无可搜索的数据
        </div>
      )}

      {hasDataSource && debounced.trim().length > 0 && debounced.trim().length < MIN_QUERY_LEN && (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: theme.textFaint }}>
          请输入至少 {MIN_QUERY_LEN} 个字符
        </div>
      )}

      {tooBroad && (
        <div style={{ padding: '8px 12px', marginBottom: 8, fontSize: 12, color: theme.warning, background: theme.warning + '10', borderRadius: theme.radius }}>
          结果过多，请输入更多字符
        </div>
      )}

      {hasDataSource && debounced.trim().length >= MIN_QUERY_LEN && allResults.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: theme.textFaint }}>
          未找到匹配的 '{debounced}'
        </div>
      )}

      {grouped.map(g => (
        <div key={g.type} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: theme.textFaint, marginBottom: 6, textTransform: 'uppercase' }}>
            {TYPE_META[g.type].label} ({g.total})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {g.items.map(item => {
              const myIdx = cursor++
              const active = myIdx === highlightIdx
              return (
                <div
                  key={`${item.type}:${item.id}:${item.matchField}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightIdx(myIdx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer',
                    background: active ? theme.surfaceHover : 'transparent',
                    border: `1px solid ${active ? theme.borderActive : 'transparent'}`,
                    borderRadius: theme.radius, transition: theme.transition,
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{TYPE_META[item.type].icon}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                    <span style={{ fontFamily: theme.monoFamily, fontSize: 13, color: theme.text }}>
                      <Highlighted text={item.primary} query={debounced} />
                    </span>
                    <span style={{ fontSize: 11, color: theme.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Highlighted text={item.secondary} query={debounced} />
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </Panel>
  )
}
