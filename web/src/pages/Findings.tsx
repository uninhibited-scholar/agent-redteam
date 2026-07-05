/**
 * Findings — vulnerability card wall + heatmap.
 */
import { useState } from 'react'
import { theme } from '../theme'
import type { SampleResult } from '../types'
import { VulnerabilityCard } from '../components/VulnerabilityCard'
import { HeatMap } from '../components/HeatMap'
import { SeverityBadge } from '../components/SeverityBadge'
import { EmptyState } from '../components/EmptyState'

interface Props {
  samples: SampleResult[]
}

export function Findings({ samples }: Props) {
  const [filter, setFilter] = useState<'all' | 'fail' | 'pass'>('fail')
  const [suiteFilter, setSuiteFilter] = useState<string>('all')

  const suites = [...new Set(samples.map(s => s.suite))].sort()
  const filtered = samples.filter(s => {
    if (filter === 'fail' && s.verdict !== 'fail') return false
    if (filter === 'pass' && s.verdict !== 'pass') return false
    if (suiteFilter !== 'all' && s.suite !== suiteFilter) return false
    return true
  })

  return (
    <div>
      {/* Heatmap */}
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
        <HeatMap samples={samples} />
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 20,
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, color: theme.textDim, marginRight: 4 }}>Filter:</span>
        {(['all', 'fail', 'pass'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              background: filter === f ? theme.primary + '20' : theme.surface,
              border: `1px solid ${filter === f ? theme.primary : theme.border}`,
              borderRadius: 20,
              color: filter === f ? theme.primary : theme.textDim,
              fontSize: 12, fontWeight: 500,
              cursor: 'pointer',
              transition: theme.transition,
            }}
          >
            {f === 'fail' ? 'Vulnerabilities' : f === 'pass' ? 'Passed' : 'All'}
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: theme.border, margin: '0 8px' }} />
        <select
          value={suiteFilter}
          onChange={e => setSuiteFilter(e.target.value)}
          style={{
            padding: '6px 12px',
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 20,
            color: theme.textDim,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <option value="all">All Suites</option>
          {suites.map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: theme.textFaint }}>
          {filtered.length} samples
        </span>
      </div>

      {/* Card wall */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
        gap: 12,
      }}>
        {filtered.map((s, i) => (
          <VulnerabilityCard key={i} sample={s} />
        ))}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon="🔍"
          title="No samples match the filter"
          description="Try changing the filter settings above."
        />
      )}
    </div>
  )
}
