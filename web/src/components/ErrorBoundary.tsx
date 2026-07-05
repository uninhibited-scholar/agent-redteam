/**
 * ErrorBoundary — catch render errors and show fallback UI.
 * Without this, any component crash = white screen.
 */
import { Component, ReactNode } from 'react'
import { theme } from '../theme'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: 40, textAlign: 'center',
          background: theme.bg, color: theme.text,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: theme.danger }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 13, color: theme.textDim, maxWidth: 400, marginBottom: 20 }}>
            {this.state.error?.message || 'An unexpected error occurred while rendering the dashboard.'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            style={{
              padding: '10px 24px',
              background: theme.primary + '20',
              border: `1px solid ${theme.primary}`,
              borderRadius: theme.radius,
              color: theme.primary,
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              transition: theme.transition,
            }}
          >
            Reload Dashboard
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
