/**
 * History — list of past scans with trend analysis.
 *
 * Enhanced: score trend sparkline at the top, sortable table, per-row
 * pass/fail mini-bar, and relative-time formatting.
 */
import { useState, useEffect, useMemo } from 'react'
import { theme } from '../theme'
import type { HistoryItem } from '../types'
import { TrendChart, TrendLegend, type TrendSeries, type TrendPoint } from '../components/TrendChart'
import { ScoreBadge } from '../components/ScoreBadge'
import { StatCard } from '../components/StatCard'
import { Panel } from '../components/ui'

interface Props {
  onLoad: (runId: string) => void
}

type SortKey = 'date' | 'score' | 'samples' | 'model'

export function History({ onLoad }: Props) {
  const [scans, setScans] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetch('/api/history?limit=100')
      .then(r => r.json())
      .then(d => { setScans(d.scans || []); setLoading(false) })
      .catch(() => { setError('Failed to load history'); setLoading(false) })
  }, [])

  const sorted = useMemo(() => {
    const arr = [...scans]
    const reverse = sortDir === 'desc'
    arr.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'date') cmp = (a.created_at || '').localeCompare(b.created_at || '')
      else if (sortBy === 'score') cmp = a.overall_score - b.overall_score
      else if (sortBy === 'samples') cmp = a.total_samples - b.total_samples
      else if (sortBy === 'model') cmp = (a.target_model || '').localeCompare(b.target_model || '')
      return reverse ? -cmp : cmp
    })
    return arr
  }, [scans, sortBy, sortDir])

  // Build trend chart data (chronological)
  const trendSeries: TrendSeries[] = useMemo(() => [
    {
      id: 'score', label: '总分', color: theme.primary,
      points: [...scans].reverse().map(s => s.overall_score),
    },
    {
      id: 'passrate', label: '通过率 %', color: theme.success,
      points: [...scans].reverse().map(s => s.total_samples ? 100 * s.total_passed / s.total_samples : null),
    },
  ], [scans])

  const trendPoints: TrendPoint[] = useMemo(() =>
    [...scans].reverse().map(s => ({
      label: (s.created_at || '').slice(5, 16).replace('T', ' '),
      values: [s.overall_score, s.total_samples ? 100 * s.total_passed / s.total_samples : null],
    }))
  , [scans])

  const scoreColor = (s: number) => s >= 80 ? theme.success : s >= 50 ? theme.warning : theme.danger

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('desc') }
  }

  if (loading) {
    return <div style={{ padding: 80, textAlign: 'center', color: theme.textFaint }}>Loading...</div>
  }
  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: theme.danger }}>{error}</div>
  }

  return (
    <div>
      {/* Trend chart */}
      {scans.length >= 2 && (
        <Panel title="评分趋势" subtitle={`${scans.length} 次扫描的历史走向`} padding={24}>
          <div style={{ marginTop: 8 }}>
            <TrendLegend series={trendSeries} />
            <TrendChart
              series={trendSeries}
              points={trendPoints}
              width={720}
              height={200}
              yMin={0}
              yMax={100}
              yLabel="分数 / %"
              onPointClick={i => { const s = [...scans].reverse()[i]; if (s) onLoad(s.run_id) }}
            />
          </div>
        </Panel>
      )}

      {/* Summary tiles */}
      {scans.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '20px 0' }}>
          <StatCard
            label="平均分"
            value={Number((scans.reduce((s, x) => s + x.overall_score, 0) / scans.length).toFixed(1))}
            previousValue={scans.length > 1 ? scans[1].overall_score : undefined}
            sparkline={[...scans].reverse().map(s => s.overall_score)}
            icon="◎"
            color={theme.primary}
            trendDirection="higher-is-better"
          />
          <StatCard
            label="最高分"
            value={Number(Math.max(...scans.map(s => s.overall_score)).toFixed(1))}
            icon="★"
            color={theme.success}
          />
          <StatCard
            label="最低分"
            value={Number(Math.min(...scans.map(s => s.overall_score)).toFixed(1))}
            icon="▼"
            color={theme.danger}
            trendDirection="higher-is-better"
          />
          <StatCard label="总扫描" value={scans.length} icon="▤" color={theme.textDim} />
          <StatCard label="总样本" value={scans.reduce((s, x) => s + x.total_samples, 0)} icon="◉" color={theme.textDim} />
          <StatCard label="模型数" value={new Set(scans.map(s => s.target_model)).size} icon="⬡" color={theme.info} />
        </div>
      )}

      {/* Table */}
      {scans.length === 0 ? (
        <div style={{ textAlign: 'center', color: theme.textFaint, padding: 80 }}>
          <p style={{ fontSize: 16, marginBottom: 8, color: theme.textDim }}>还没有扫描记录</p>
          <p style={{ fontSize: 13 }}>
            去 <span style={{ color: theme.primary }}>⚡ Scan</span> 标签页发起第一次扫描。
          </p>
        </div>
      ) : (
        <Panel padding={0}>
          {/* Sortable header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2.2fr 1.4fr 0.8fr 1.4fr 1.2fr',
            padding: '12px 20px',
            background: theme.surfaceActive,
            fontSize: 10, fontWeight: 700,
            color: theme.textFaint,
            textTransform: 'uppercase', letterSpacing: 1,
            borderBottom: `1px solid ${theme.border}`,
          }}>
            <SortCol label="Run ID" active={sortBy === 'date'} dir={sortDir} onClick={() => toggleSort('date')} />
            <SortCol label="Model" active={sortBy === 'model'} dir={sortDir} onClick={() => toggleSort('model')} />
            <SortCol label="Score" align="right" active={sortBy === 'score'} dir={sortDir} onClick={() => toggleSort('score')} />
            <SortCol label="Pass / Fail" active={sortBy === 'samples'} dir={sortDir} onClick={() => toggleSort('samples')} />
            <span>Date</span>
          </div>
          {/* Rows */}
          {sorted.map((s, i) => {
            const passRate = s.total_samples ? (s.total_passed / s.total_samples) * 100 : 0
            return (
              <button
                key={s.run_id}
                onClick={() => onLoad(s.run_id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2.2fr 1.4fr 0.8fr 1.4fr 1.2fr',
                  alignItems: 'center',
                  padding: '12px 20px',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: i < sorted.length - 1 ? `1px solid ${theme.border}` : 'none',
                  color: theme.text,
                  fontSize: 12,
                  fontFamily: theme.monoFamily,
                  cursor: 'pointer',
                  transition: theme.transition,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = theme.surfaceHover)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ color: theme.primary, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.run_id}
                </span>
                <span style={{ color: theme.textDim }}>{s.target_model}</span>
                <span style={{ textAlign: 'right' }}>
                  <ScoreBadge score={s.overall_score} size="sm" showGrade={false} />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flexShrink: 0 }}>
                    <span style={{ color: theme.success }}>{s.total_passed}</span>
                    <span style={{ color: theme.textFaint }}> / </span>
                    <span style={{ color: theme.danger }}>{s.total_failed}</span>
                  </span>
                  {/* mini bar */}
                  <span style={{ flex: 1, height: 4, background: theme.bg, borderRadius: 2, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${passRate}%`, background: scoreColor(passRate) }} />
                  </span>
                </span>
                <span style={{ color: theme.textFaint }}>{formatRelative(s.created_at)}</span>
              </button>
            )
          })}
        </Panel>
      )}
    </div>
  )
}

function SortCol({ label, active, dir, onClick, align }: {
  label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; align?: 'right'
}) {
  return (
    <span
      onClick={onClick}
      style={{
        textAlign: align, cursor: 'pointer',
        color: active ? theme.primary : theme.textFaint,
        display: 'flex', alignItems: 'center', gap: 4,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      {label}
      <span style={{ fontSize: 9, opacity: active ? 1 : 0.4 }}>
        {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </span>
  )
}

function formatRelative(iso: string): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (isNaN(then)) return iso
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}天前`
  return iso.slice(0, 10)
}
