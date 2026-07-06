/**
 * SortHeader — clickable table header cell with sort direction indicator.
 */
import { theme } from '../theme'

export type SortDirection = 'asc' | 'desc'

interface Props {
  label: string
  active: boolean
  direction: SortDirection
  onClick: () => void
  align?: 'left' | 'right' | 'center'
}

export function SortHeader({ label, active, direction, onClick, align = 'left' }: Props) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: '10px 14px',
        textAlign: align,
        fontSize: 11,
        fontWeight: 600,
        color: active ? theme.primary : theme.textDim,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        transition: theme.transition,
      }}
    >
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
      }}>
        {label}
        <span style={{
          display: 'inline-block',
          width: 10,
          fontSize: 10,
          color: active ? theme.primary : theme.textFaint,
          opacity: active ? 1 : 0.4,
        }}>
          {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  )
}
