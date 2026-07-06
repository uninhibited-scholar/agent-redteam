/**
 * DataTable — column-config-driven generic table.
 *
 * Supports two sort modes:
 *   1. Server-side (controlled): pass `sortKey` + `sortDir` + `onSortChange`.
 *      The SortHeader clicks call onSortChange and the parent refetches.
 *   2. Client-side (uncontrolled): omit those props; the table sorts the rows
 *      it currently holds using each sortable column's `sortValue`.
 *
 * Also handles row selection, empty/loading states, sticky header, and row
 * hover highlight.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { SortHeader, type SortDirection } from './SortHeader'
import { EmptyState, LoadingState } from './EmptyState'

export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  render: (row: T) => React.ReactNode
  /** Used only in uncontrolled (client-side) sort mode. */
  sortValue?: (row: T) => string | number
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  maxHeight?: number
  /** Controlled sort: the active column key. Enables server-side sort mode. */
  sortKey?: string | null
  /** Controlled sort: the active direction. */
  sortDir?: SortDirection
  /** Controlled sort: called when a sortable header is clicked. */
  onSortChange?: (key: string, dir: SortDirection) => void
}

export function DataTable<T>({
  columns, rows, rowKey, onRowClick, loading,
  emptyTitle = 'No data', emptyDescription, maxHeight = 560,
  sortKey, sortDir, onSortChange,
}: Props<T>) {
  // Internal (uncontrolled) sort state — only used when sortKey is undefined.
  const [clientSortKey, setClientSortKey] = useState<string | null>(null)
  const [clientSortDir, setClientSortDir] = useState<SortDirection>('desc')
  const [hoverRow, setHoverRow] = useState<string | null>(null)

  const controlled = sortKey !== undefined && onSortChange !== undefined

  if (loading) return <LoadingState message="Loading data..." />
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />

  function handleSort(col: Column<T>) {
    if (!col.sortable) return
    if (controlled) {
      // Controlled: cycle asc→desc, or switch column
      const activeKey = sortKey
      if (activeKey === col.key) {
        onSortChange!(col.key, sortDir === 'asc' ? 'desc' : 'asc')
      } else {
        onSortChange!(col.key, sortDir || 'desc')
      }
      return
    }
    // Uncontrolled client-side sort
    if (clientSortKey === col.key) {
      setClientSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setClientSortKey(col.key)
      setClientSortDir('desc')
    }
  }

  // Only sort rows in uncontrolled mode
  let sortedRows = rows
  if (!controlled) {
    const activeKey = clientSortKey
    const activeDir = clientSortDir
    if (activeKey) {
      const col = columns.find(c => c.key === activeKey)
      if (col?.sortValue) {
        sortedRows = [...rows].sort((a, b) => {
          const av = col.sortValue!(a)
          const bv = col.sortValue!(b)
          const cmp = av < bv ? -1 : av > bv ? 1 : 0
          return activeDir === 'asc' ? cmp : -cmp
        })
      }
    }
  }

  const activeKey = controlled ? sortKey : clientSortKey
  const activeDir = controlled ? (sortDir || 'desc') : clientSortDir

  return (
    <div style={{
      border: `1px solid ${theme.border}`,
      borderRadius: theme.radius,
      overflow: 'hidden',
    }}>
      <div style={{ maxHeight, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{
              position: 'sticky', top: 0, zIndex: 1,
              background: theme.surface,
            }}>
              {columns.map(col => {
                const sortable = col.sortable
                if (!sortable) {
                  return (
                    <th key={col.key} style={{
                      padding: '10px 14px', textAlign: col.align || 'left',
                      fontSize: 11, fontWeight: 600, color: theme.textDim,
                      textTransform: 'uppercase', letterSpacing: 0.5,
                      whiteSpace: 'nowrap',
                    }}>
                      {col.label}
                    </th>
                  )
                }
                return (
                  <SortHeader
                    key={col.key}
                    label={col.label}
                    active={activeKey === col.key}
                    direction={activeKey === col.key ? activeDir : 'asc'}
                    onClick={() => handleSort(col)}
                    align={col.align}
                  />
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => {
              const key = rowKey(row)
              const hovered = hoverRow === key
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  onMouseEnter={() => setHoverRow(key)}
                  onMouseLeave={() => setHoverRow(null)}
                  style={{
                    background: hovered ? theme.surfaceHover : 'transparent',
                    cursor: onRowClick ? 'pointer' : 'default',
                    borderTop: `1px solid ${theme.border}`,
                    transition: theme.transition,
                  }}
                >
                  {columns.map(col => (
                    <td key={col.key} style={{
                      padding: '10px 14px',
                      textAlign: col.align || 'left',
                      fontSize: 13,
                      color: theme.text,
                    }}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
