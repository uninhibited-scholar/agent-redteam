/**
 * FilterBar — search box + multi-select dropdown + clear button.
 * Generic filter row used across Findings/History pages.
 */
import { useState, useRef, useEffect } from 'react'
import { theme } from '../theme'

export interface FilterOption {
  key: string
  label: string
  count?: number
}

interface Props {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filterOptions: FilterOption[]
  selected: string[]
  onFilterChange: (selected: string[]) => void
  filterLabel?: string
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filterOptions,
  selected,
  onFilterChange,
  filterLabel = 'Filter',
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function toggle(key: string) {
    if (selected.includes(key)) {
      onFilterChange(selected.filter(k => k !== key))
    } else {
      onFilterChange([...selected, key])
    }
  }

  const hasFilters = searchValue.length > 0 || selected.length > 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <input
        value={searchValue}
        onChange={e => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        style={{
          flex: '1 1 200px',
          minWidth: 160,
          padding: '8px 12px',
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: theme.radius,
          color: theme.text,
          fontSize: 13,
          outline: 'none',
        }}
      />

      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            background: selected.length > 0 ? theme.primary + '15' : theme.surface,
            border: `1px solid ${selected.length > 0 ? theme.primary : theme.border}`,
            borderRadius: theme.radius,
            color: selected.length > 0 ? theme.primary : theme.textDim,
            fontSize: 13,
            cursor: 'pointer',
            transition: theme.transition,
          }}
        >
          {filterLabel}
          {selected.length > 0 && (
            <span style={{
              background: theme.primary,
              color: theme.bg,
              borderRadius: 10,
              padding: '1px 6px',
              fontSize: 10,
              fontWeight: 700,
            }}>
              {selected.length}
            </span>
          )}
          <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 20,
            minWidth: 200, maxHeight: 260, overflowY: 'auto',
            background: theme.surface,
            border: `1px solid ${theme.borderActive}`,
            borderRadius: theme.radius,
            padding: 6,
            animation: 'slideIn 150ms ease',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            {filterOptions.map(opt => {
              const checked = selected.includes(opt.key)
              return (
                <div
                  key={opt.key}
                  onClick={() => toggle(opt.key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, padding: '6px 8px', borderRadius: theme.radiusSm,
                    cursor: 'pointer',
                    background: checked ? theme.primary + '15' : 'transparent',
                    fontSize: 12,
                    color: checked ? theme.primary : theme.text,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 12, height: 12, borderRadius: 3,
                      border: `1px solid ${checked ? theme.primary : theme.textFaint}`,
                      background: checked ? theme.primary : 'transparent',
                    }} />
                    {opt.label}
                  </span>
                  {opt.count !== undefined && (
                    <span style={{ color: theme.textFaint, fontSize: 11 }}>{opt.count}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {hasFilters && (
        <button
          onClick={() => { onSearchChange(''); onFilterChange([]) }}
          style={{
            padding: '8px 12px',
            background: 'transparent',
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radius,
            color: theme.textDim,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}
