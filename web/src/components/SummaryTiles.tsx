/**
 * SummaryTiles — stat cards showing key metrics.
 * Used on Overview page and Compare page.
 */
import { theme } from '../theme'

interface Tile {
  label: string
  value: string | number
  color: string
  mono?: boolean
  subtitle?: string
}

interface Props {
  tiles: Tile[]
}

export function SummaryTiles({ tiles }: Props) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 12,
    }}>
      {tiles.map((tile, i) => (
        <div
          key={i}
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radius,
            padding: '14px 18px',
            transition: theme.transition,
          }}
        >
          <div style={{
            fontSize: 10, color: theme.textFaint,
            textTransform: 'uppercase', letterSpacing: 0.5,
            marginBottom: 4,
          }}>
            {tile.label}
          </div>
          <div style={{
            fontSize: tile.mono ? 13 : 26,
            fontWeight: 700,
            color: tile.color,
            fontFamily: tile.mono ? theme.monoFamily : theme.fontFamily,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {tile.value}
          </div>
          {tile.subtitle && (
            <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 2 }}>
              {tile.subtitle}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
