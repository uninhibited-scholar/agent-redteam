/**
 * EmptyState — reusable empty/loading/error placeholder.
 * Every page needs this when there's no data yet.
 */
import { theme } from '../theme'

interface Props {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon = '📊', title, description, action }: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 80, textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>{icon}</div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 8 }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: 13, color: theme.textDim, maxWidth: 400, marginBottom: 20 }}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: '10px 24px',
            background: theme.primary + '15',
            border: `1px solid ${theme.primary}`,
            borderRadius: theme.radius,
            color: theme.primary,
            fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
            transition: theme.transition,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 80,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 32, height: 32,
          border: `3px solid ${theme.border}`,
          borderTopColor: theme.primary,
          borderRadius: '50%',
          margin: '0 auto 12px',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ fontSize: 13, color: theme.textDim }}>{message}</p>
      </div>
    </div>
  )
}
