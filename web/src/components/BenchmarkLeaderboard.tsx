/**
 * BenchmarkLeaderboard — enhanced local leaderboard, one row per model with
 * a heat-colored column per suite so strengths/weaknesses across the whole
 * suite matrix are visible at a glance. Richer than ModelLeaderboard, which
 * only shows the aggregate score.
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel } from './ui'

interface BenchmarkModel {
  model: string
  overall: number
  suites: Record<string, number>
}

interface BenchmarkLeaderboardProps {
  models: BenchmarkModel[]
}

type SortKey = 'overall' | string

function heatColor(score: number): string {
  if (score >= 80) return theme.success
  if (score >= 50) return theme.warning
  return theme.danger
}

function heatBg(score: number): string {
  const alpha = 0x14 + Math.round((score / 100) * 0x18)
  return heatColor(score) + alpha.toString(16).padStart(2, '0')
}

export function BenchmarkLeaderboard({ models }: BenchmarkLeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('overall')
  const [sortDesc, setSortDesc] = useState(true)

  const suiteNames = useMemo(() => {
    const set = new Set<string>()
    for (const m of models) {
      for (const suite of Object.keys(m.suites)) set.add(suite)
    }
    return [...set].sort()
  }, [models])

  const sorted = useMemo(() => {
    const withScore = models.map(m => ({
      m,
      sortVal: sortKey === 'overall' ? m.overall : (m.suites[sortKey] ?? -1),
    }))
    withScore.sort((a, b) => (sortDesc ? b.sortVal - a.sortVal : a.sortVal - b.sortVal))
    return withScore.map(x => x.m)
  }, [models, sortKey, sortDesc])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc(d => !d)
    } else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  if (models.length === 0) {
    return (
      <Panel title="安全基准排行榜" subtitle="0 个模型">
        <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
          无模型数据
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="安全基准排行榜" subtitle={`${models.length} 个模型 · ${suiteNames.length} 个套件`}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 + suiteNames.length * 76 }}>
          <thead>
            <tr>
              <th style={headerCellStyle('left')}>模型</th>
              <th
                onClick={() => handleSort('overall')}
                style={{ ...headerCellStyle('center'), cursor: 'pointer', color: sortKey === 'overall' ? theme.primary : theme.textDim }}
              >
                总分 {sortKey === 'overall' ? (sortDesc ? '↓' : '↑') : ''}
              </th>
              {suiteNames.map(suite => (
                <th
                  key={suite}
                  onClick={() => handleSort(suite)}
                  style={{ ...headerCellStyle('center'), cursor: 'pointer', color: sortKey === suite ? theme.primary : theme.textDim }}
                  title={suite}
                >
                  {suite.replace(/_/g, ' ')} {sortKey === suite ? (sortDesc ? '↓' : '↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, rank) => (
              <tr key={m.model}>
                <td style={{ ...bodyCellStyle('left'), display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: theme.textFaint, fontFamily: theme.monoFamily, width: 18 }}>
                    #{rank + 1}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, fontFamily: theme.monoFamily }}>
                    {m.model}
                  </span>
                </td>
                <td style={{
                  ...bodyCellStyle('center'),
                  fontWeight: 700, fontFamily: theme.monoFamily,
                  color: heatColor(m.overall),
                }}>
                  {m.overall.toFixed(1)}
                </td>
                {suiteNames.map(suite => {
                  const score = m.suites[suite]
                  return (
                    <td key={suite} style={bodyCellStyle('center')}>
                      {score === undefined ? (
                        <span style={{ fontSize: 11, color: theme.textFaint }}>—</span>
                      ) : (
                        <span style={{
                          display: 'inline-block', minWidth: 40,
                          padding: '3px 8px', borderRadius: theme.radiusSm,
                          background: heatBg(score), color: heatColor(score),
                          fontSize: 11, fontWeight: 700, fontFamily: theme.monoFamily,
                        }}>
                          {score.toFixed(1)}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function headerCellStyle(align: 'left' | 'center'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '8px 12px',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottom: `1px solid ${theme.border}`,
    whiteSpace: 'nowrap',
  }
}

function bodyCellStyle(align: 'left' | 'center'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 12px',
    borderBottom: `1px solid ${theme.border}`,
    whiteSpace: 'nowrap',
  }
}
