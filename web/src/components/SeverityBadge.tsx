/**
 * SeverityBadge — color-coded severity indicator.
 */
import { theme } from '../theme'

interface Props {
  severity: string
  size?: 'sm' | 'md'
}

export function SeverityBadge({ severity, size = 'sm' }: Props) {
  const color = (theme.severity as Record<string, string>)[severity] || theme.warning
  const fontSize = size === 'sm' ? 10 : 12
  const padding = size === 'sm' ? '2px 6px' : '4px 10px'

  return (
    <span style={{
      fontSize, fontWeight: 700,
      color: '#fff',
      background: color,
      padding,
      borderRadius: theme.radiusSm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontFamily: theme.monoFamily,
    }}>
      {severity}
    </span>
  )
}
