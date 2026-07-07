/**
 * Pagination — page control with "showing X-Y of Z" and up to 7 page buttons.
 */
import { theme } from '../theme'

interface Props {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, onPageChange }: Props) {
  const safePageSize = pageSize > 0 ? pageSize : 1
  const totalPages = Math.max(1, Math.ceil(total / safePageSize))
  const start = total === 0 ? 0 : (page - 1) * safePageSize + 1
  const end = Math.min(page * safePageSize, total)

  const pages = pageNumbers(page, totalPages)

  function btnStyle(active: boolean, disabled = false): React.CSSProperties {
    return {
      minWidth: 28, height: 28, padding: '0 6px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? theme.primary : 'transparent',
      color: active ? theme.bg : disabled ? theme.textFaint : theme.textDim,
      border: `1px solid ${active ? theme.primary : theme.border}`,
      borderRadius: theme.radiusSm,
      fontSize: 12, fontWeight: active ? 700 : 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: theme.transition,
      opacity: disabled ? 0.4 : 1,
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap', padding: '10px 0',
    }}>
      <span style={{ fontSize: 12, color: theme.textDim }}>
        {total === 0 ? 'No results' : `第 ${start}-${end} 条 / 共 ${total} 条`}
      </span>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          style={btnStyle(false, page <= 1)}
        >
          «
        </button>
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          style={btnStyle(false, page <= 1)}
        >
          ‹
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} style={{ color: theme.textFaint, padding: '0 4px' }}>…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              style={btnStyle(p === page)}
            >
              {p}
            </button>
          )
        )}

        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          style={btnStyle(false, page >= totalPages)}
        >
          ›
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
          style={btnStyle(false, page >= totalPages)}
        >
          »
        </button>
      </div>
    </div>
  )
}

/** Compute up to 7 page tokens (numbers or '...') around the current page. */
function pageNumbers(page: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const out: (number | '...')[] = [1]
  const left = Math.max(2, page - 1)
  const right = Math.min(totalPages - 1, page + 1)

  if (left > 2) out.push('...')
  for (let p = left; p <= right; p++) out.push(p)
  if (right < totalPages - 1) out.push('...')
  out.push(totalPages)

  return out
}
