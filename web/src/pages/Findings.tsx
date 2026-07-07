/**
 * Findings — server-backed sample drill-down.
 *
 * Replaces the old client-side card wall with a paginated, filterable,
 * sortable DataTable fed by /api/samples. The HeatMap stays as an at-a-glance
 * summary. Row click opens a DetailDrawer with the full attack/response.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { theme } from '../theme'
import type { SampleResult, SamplesResponse } from '../types'
import { HeatMap } from '../components/HeatMap'
import { EmptyState, LoadingState } from '../components/EmptyState'
import { DataTable, type Column } from '../components/DataTable'
import { FilterBar, type FilterOption } from '../components/FilterBar'
import { Pagination } from '../components/Pagination'
import { DetailDrawer } from '../components/DetailDrawer'
import { BatchActions } from '../components/BatchActions'
import { IgnoreRules } from '../components/IgnoreRules'
import { TagExplorer } from '../components/TagExplorer'
import { SeverityBadge as SharedSeverityBadge } from '../components/ui'
import { useNotification } from '../components/NotificationToast'

const PAGE_SIZE = 25
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const
const VERDICTS = ['fail', 'pass', 'error'] as const

interface FindingsProps {
  /** Initial suite filter applied on mount (e.g. when drilling from Overview). */
  initialSuite?: string | null
  /** Initial severity filter applied on mount. */
  initialSeverity?: string | null
  /** Initial verdict filter applied on mount. */
  initialVerdict?: string | null
  /** Called once the initial filter has been consumed, so the parent can clear it. */
  onConsumedFilter?: () => void
}

export function Findings({ initialSuite, initialSeverity, initialVerdict, onConsumedFilter }: FindingsProps = {}) {
  const { notify } = useNotification()
  // Load the current report's samples so HeatMap has something to draw even
  // before the /api/samples round-trip completes.
  const [reportSamples, setReportSamples] = useState<SampleResult[]>([])
  const [data, setData] = useState<SamplesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [verdictSel, setVerdictSel] = useState<string[]>(initialVerdict ? [initialVerdict] : [])
  const [severitySel, setSeveritySel] = useState<string[]>(initialSeverity ? [initialSeverity] : [])
  const [suiteSel, setSuiteSel] = useState<string[]>(initialSuite ? [initialSuite] : [])
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<'severity' | 'suite' | 'verdict' | 'category' | null>('severity')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [selected, setSelected] = useState<SampleResult | null>(null)
  // Multi-select for batch operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Tag explorer state
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [tagCombinator, setTagCombinator] = useState<'AND' | 'OR'>('OR')

  // Debounce search input
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Initial report fetch for the HeatMap
  useEffect(() => {
    fetch('/api/report')
      .then(r => r.json())
      .then(d => { if (d.samples) setReportSamples(d.samples) })
      .catch(() => {})
  }, [])

  // Notify parent once the initial suite filter has been applied so it can
  // clear its pending state (otherwise re-visiting Overview→Findings re-applies it)
  useEffect(() => {
    if (initialSuite && onConsumedFilter) onConsumedFilter()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', String(PAGE_SIZE))
      if (verdictSel.length === 1) params.set('verdict', verdictSel[0])
      if (severitySel.length === 1) params.set('severity', severitySel[0])
      if (suiteSel.length === 1) params.set('suite', suiteSel[0])
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (sortBy) { params.set('sort_by', sortBy); params.set('sort_dir', sortDir) }

      const res = await fetch(`/api/samples?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: SamplesResponse = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [page, verdictSel, severitySel, suiteSel, debouncedSearch, sortBy, sortDir])

  useEffect(() => { fetchData() }, [fetchData])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [verdictSel, severitySel, suiteSel, debouncedSearch, sortBy, sortDir])

  const facets = data?.facets

  const verdictOptions: FilterOption[] = VERDICTS.map(v => ({
    key: v, label: v, count: facets?.verdict[v],
  }))
  const severityOptions: FilterOption[] = SEVERITIES.map(s => ({
    key: s, label: s, count: facets?.severity[s],
  }))
  const suiteOptions: FilterOption[] = Object.keys(facets?.suite || {})
    .sort()
    .map(name => ({ key: name, label: name.replace(/_/g, ' '), count: facets?.suite[name] }))

  // DataTable columns
  const columns: Column<SampleResult>[] = [
    {
      key: 'select', label: '', align: 'center',
      render: s => {
        const id = `${s.suite}:${s.sample_id}`
        const checked = selectedIds.has(id)
        return (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              setSelectedIds(prev => {
                const next = new Set(prev)
                if (e.target.checked) next.add(id)
                else next.delete(id)
                return next
              })
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: 'pointer', accentColor: theme.primary }}
          />
        )
      },
    },
    {
      key: 'severity', label: 'Severity', sortable: true, align: 'left',
      render: s => <SharedSeverityBadge severity={s.severity} />,
    },
    {
      key: 'suite', label: 'Suite', sortable: true,
      render: s => (
        <span style={{ color: theme.primary, fontSize: 12, fontFamily: theme.monoFamily }}>
          {s.suite.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'category', label: 'Category', sortable: true,
      render: s => <span style={{ color: theme.textDim, fontSize: 12 }}>{s.category.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'verdict', label: 'Verdict', sortable: true, align: 'center',
      render: s => {
        const color = s.verdict === 'fail' ? theme.danger : s.verdict === 'pass' ? theme.success : theme.warning
        return (
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color,
            padding: '2px 8px', borderRadius: 10,
            background: color + '18',
          }}>
            {s.verdict}
          </span>
        )
      },
    },
    {
      key: 'attack', label: 'Attack', align: 'left',
      render: s => (
        <span style={{
          fontSize: 12, color: theme.text, fontFamily: theme.monoFamily,
          display: 'inline-block', maxWidth: 320,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {s.question}
        </span>
      ),
    },
    {
      key: 'owasp', label: 'OWASP', align: 'center',
      render: s => s.owasp ? (
        <span style={{
          fontSize: 10, fontWeight: 600, color: theme.primary, fontFamily: theme.monoFamily,
          border: `1px solid ${theme.primary}40`, padding: '1px 5px', borderRadius: 3,
        }}>
          {s.owasp}
        </span>
      ) : <span style={{ color: theme.textFaint }}>—</span>,
    },
  ]

  // Controlled sort callback — drives the server-side /api/samples query.
  function handleSortChange(key: string, dir: 'asc' | 'desc') {
    setSortBy(key as typeof sortBy)
    setSortDir(dir)
  }

  return (
    <div>
      {/* Heatmap overview */}
      <div style={{
        background: theme.surface,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        padding: 24,
        marginBottom: 24,
      }}>
        <h2 style={{
          fontSize: 14, fontWeight: 600, color: theme.primary,
          marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1,
        }}>
          Vulnerability Heat Map
        </h2>
        {reportSamples.length > 0
          ? <HeatMap samples={reportSamples} onCellClick={(suite, sev) => {
              setSuiteSel([suite])
              setSeveritySel([sev])
              setPage(1)
              notify(`已筛选：${suite.replace(/_/g,' ')} · ${sev}`, 'info')
            }} />
          : <div style={{ color: theme.textFaint, fontSize: 12, padding: 12 }}>No report loaded.</div>}
      </div>

      {/* Ignore rules — mark known/acceptable failures to exclude from scoring */}
      {reportSamples.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <IgnoreRules failures={reportSamples.filter(s => s.verdict === 'fail')} />
        </div>
      )}

      {/* Tag explorer — explore samples by attack technique tags */}
      {reportSamples.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <TagExplorer
            samples={reportSamples}
            selectedTags={selectedTags}
            onToggleTag={(t) => {
              setSelectedTags(prev => {
                const next = new Set(prev)
                if (next.has(t)) next.delete(t); else next.add(t)
                return next
              })
            }}
            combinator={tagCombinator}
            onCombinatorChange={setTagCombinator}
          />
        </div>
      )}

      {/* Filter row */}
      <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索攻击文本 / 类别 / 样本 ID…"
          filterOptions={verdictOptions}
          selected={verdictSel}
          onFilterChange={setVerdictSel}
          filterLabel="Verdict"
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <FilterBar
            searchValue=""
            onSearchChange={() => {}}
            filterOptions={severityOptions}
            selected={severitySel}
            onFilterChange={setSeveritySel}
            filterLabel="Severity"
          />
          <FilterBar
            searchValue=""
            onSearchChange={() => {}}
            filterOptions={suiteOptions}
            selected={suiteSel}
            onFilterChange={setSuiteSel}
            filterLabel="Suite"
          />
          {/* Multi-select guard: if more than one, reset to one (backend is single-value) */}
          {verdictSel.length > 1 && <GuardBadge text="verdict" onClear={() => setVerdictSel(verdictSel.slice(-1))} />}
          {severitySel.length > 1 && <GuardBadge text="severity" onClear={() => setSeveritySel(severitySel.slice(-1))} />}
          {suiteSel.length > 1 && <GuardBadge text="suite" onClear={() => setSuiteSel(suiteSel.slice(-1))} />}
        </div>
      </div>

      {/* Result count line */}
      {data && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: theme.textFaint }}>
            {data.total} sample{data.total !== 1 ? 's' : ''} · page {data.page}/{data.total_pages || 1}
            {sortBy && ` · sorted by ${sortBy} ${sortDir}`}
          </span>
        </div>
      )}

      {/* Table (controlled sort via SortHeader clicks → server query) */}
      {error ? (
        <EmptyState icon="⚠️" title="Failed to load samples" description={error} />
      ) : loading ? (
        <LoadingState message="Loading samples…" />
      ) : (
        <DataTable
          columns={columns}
          rows={data?.items || []}
          rowKey={s => `${s.suite}:${s.sample_id}`}
          onRowClick={setSelected}
          loading={loading}
          emptyTitle="No samples match the current filters"
          emptyDescription="Try clearing filters or broadening the search."
          sortKey={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
        />
      )}

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Detail drawer */}
      <DetailDrawer sample={selected} onClose={() => setSelected(null)} />

      {/* Batch actions bar (floating, only when selection non-empty) */}
      <BatchActions
        selected={selectedIds}
        visibleSamples={data?.items || []}
        totalMatched={data?.total || 0}
        onSelectAll={() => {
          const ids = (data?.items || []).map(s => `${s.suite}:${s.sample_id}`)
          setSelectedIds(new Set(ids))
        }}
        onClear={() => setSelectedIds(new Set())}
      />
    </div>
  )
}

function GuardBadge({ text, onClear }: { text: string; onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      style={{
        fontSize: 10, color: theme.warning, background: theme.warning + '18',
        border: `1px solid ${theme.warning}40`, borderRadius: 10, padding: '2px 8px',
        cursor: 'pointer',
      }}
      title="Backend supports single-value filter; keeping the last selection."
    >
      ⚠ {text}: 多选仅生效最后一个
    </button>
  )
}
