/**
 * BarChart — horizontal bar list for ranked comparisons.
 * Pure SVG/HTML, zero deps. Each bar shows label + value + optional delta.
 *
 * Use cases: suite score ranking, model comparison by suite, top-N failures.
 */
import { theme } from '../theme'
import { Tooltip } from './ui'

export interface BarItem {
  label: string
  value: number
  color?: string
  /** Optional secondary value shown as a faded reference bar (e.g. baseline). */
  reference?: number
  /** Optional detail for tooltip. */
  detail?: string
  /** Click handler for drill-down. */
  onClick?: () => void
}

interface Props {
  items: BarItem[]
  /** Max value for the scale; defaults to max of item values. */
  maxValue?: number
  /** Value suffix (e.g. '%', 'ms'). */
  suffix?: string
  /** Whether to show the numeric value at the bar end. */
  showValues?: boolean
}

export function BarChart({ items, maxValue, suffix = '', showValues = true }: Props) {
  const max = maxValue ?? Math.max(1, ...items.map(i => Math.max(i.value, i.reference ?? 0)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => {
        const color = item.color ?? theme.primary
        const pct = (item.value / max) * 100
        const refPct = item.reference !== undefined ? (item.reference / max) * 100 : null
        return (
          <Tooltip key={i} content={item.detail || `${item.label}: ${item.value}${suffix}`}>
            <div
              onClick={item.onClick}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 56px',
                alignItems: 'center',
                gap: 10,
                cursor: item.onClick ? 'pointer' : 'default',
                padding: '3px 4px',
                borderRadius: theme.radiusSm,
                transition: theme.transition,
              }}
              onMouseEnter={e => { if (item.onClick) e.currentTarget.style.background = theme.surfaceHover }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {/* Label */}
              <span style={{
                fontSize: 11.5, color: theme.textDim,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.label}
              </span>
              {/* Bar track */}
              <div style={{ position: 'relative', height: 18, background: theme.bg, borderRadius: theme.radiusSm, overflow: 'hidden' }}>
                {/* Reference bar (faded) */}
                {refPct !== null && (
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${refPct}%`,
                    background: theme.textFaint,
                    opacity: 0.25,
                  }} />
                )}
                {/* Value bar */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                  borderRadius: theme.radiusSm,
                  transition: 'width 500ms ease',
                }} />
              </div>
              {/* Value */}
              {showValues && (
                <span style={{
                  fontSize: 11, fontFamily: theme.monoFamily, color: theme.text,
                  textAlign: 'right',
                }}>
                  {item.value.toFixed(item.value % 1 === 0 ? 0 : 1)}{suffix}
                </span>
              )}
            </div>
          </Tooltip>
        )
      })}
    </div>
  )
}

/** Vertical column variant — good for a small fixed set of categories. */
export function ColumnChart({ items, height = 160, suffix = '' }: {
  items: BarItem[]
  height?: number
  suffix?: string
}) {
  const max = Math.max(1, ...items.map(i => i.value))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height }}>
      {items.map((item, i) => {
        const color = item.color ?? theme.primary
        const h = (item.value / max) * (height - 28)
        return (
          <Tooltip key={i} content={item.detail || `${item.label}: ${item.value}${suffix}`}>
            <div
              onClick={item.onClick}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 6, cursor: item.onClick ? 'pointer' : 'default',
                height: '100%', justifyContent: 'flex-end',
              }}
            >
              <span style={{ fontSize: 10, fontFamily: theme.monoFamily, color: theme.textDim }}>
                {item.value.toFixed(item.value % 1 === 0 ? 0 : 1)}
              </span>
              <div style={{
                width: '100%', maxWidth: 48,
                height: Math.max(2, h),
                background: `linear-gradient(180deg, ${color}, ${color}99)`,
                borderRadius: `${theme.radiusSm} ${theme.radiusSm} 0 0`,
                transition: 'height 500ms ease',
              }} />
              <span style={{
                fontSize: 10, color: theme.textFaint, textAlign: 'center',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                width: '100%',
              }}>
                {item.label}
              </span>
            </div>
          </Tooltip>
        )
      })}
    </div>
  )
}
