/**
 * App — main layout with navigation.
 */
import { useState, useEffect } from 'react'
import { theme, globalStyles } from './theme'
import type { ScanReport } from './types'
import { Overview } from './pages/Overview'
import { Findings } from './pages/Findings'
import { LiveScan } from './pages/LiveScan'
import { ScanLauncher } from './pages/ScanLauncher'
import { History } from './pages/History'
import { Compare } from './pages/Compare'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingState } from './components/EmptyState'

type Page = 'overview' | 'findings' | 'live' | 'launcher' | 'history' | 'compare'

export function App() {
  const [page, setPage] = useState<Page>('overview')
  const [report, setReport] = useState<ScanReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Inject global styles
    const style = document.createElement('style')
    style.textContent = globalStyles
    document.head.appendChild(style)

    loadLatestReport()
  }, [])

  const loadLatestReport = () => {
    setLoading(true)
    fetch('/api/report')
      .then(r => r.json())
      .then(data => { setReport(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  const loadReport = (runId: string) => {
    setLoading(true)
    fetch(`/api/report/${encodeURIComponent(runId)}`)
      .then(r => r.json())
      .then(data => { setReport(data); setLoading(false); setPage('overview') })
      .catch(() => setLoading(false))
  }

  const navItems: { id: Page; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '◈' },
    { id: 'findings', label: 'Findings', icon: '◉' },
    { id: 'launcher', label: 'Scan', icon: '⚡' },
    { id: 'live', label: 'Live Scan', icon: '◐' },
    { id: 'history', label: 'History', icon: '▤' },
    { id: 'compare', label: 'Compare', icon: '⇄' },
  ]

  const subtitles: Record<Page, string> = {
    overview: 'Security posture overview',
    findings: 'Detailed vulnerability findings',
    launcher: 'Launch a new red team scan',
    live: 'Real-time scan telemetry',
    history: 'Past scan records',
    compare: 'Compare two scans side by side',
  }

  return (
    <ErrorBoundary>
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      {/* Sidebar */}
      <nav style={{
        width: 64,
        background: theme.surface,
        borderRight: `1px solid ${theme.border}`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 16, gap: 8,
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{
          width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20,
          marginBottom: 20,
          color: theme.primary,
          border: `1px solid ${theme.primary}40`,
          borderRadius: theme.radius,
        }}>
          ⬡
        </div>

        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            title={item.label}
            style={{
              width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: page === item.id ? theme.primary + '15' : 'transparent',
              border: 'none',
              borderRadius: theme.radius,
              color: page === item.id ? theme.primary : theme.textFaint,
              fontSize: 18,
              cursor: 'pointer',
              transition: theme.transition,
              position: 'relative',
            }}
          >
            {item.icon}
            {page === item.id && (
              <span style={{
                position: 'absolute', left: -8,
                width: 3, height: 24,
                background: theme.primary,
                borderRadius: 2,
              }} />
            )}
          </button>
        ))}
      </nav>

      {/* Main content */}
      <main style={{
        flex: 1,
        padding: 32,
        overflowY: 'auto',
        maxWidth: 1200,
        animation: 'fadeIn 200ms ease',
      }}>
        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontSize: 24, fontWeight: 700,
            color: theme.text,
            marginBottom: 4,
          }}>
            Agent Redteam
          </h1>
          <p style={{ fontSize: 13, color: theme.textDim }}>
            {subtitles[page]}
          </p>
        </div>

        {page === 'launcher' ? (
          <ScanLauncher onScanStarted={() => setPage('live')} />
        ) : page === 'history' ? (
          <History onLoad={loadReport} />
        ) : page === 'compare' ? (
          <Compare />
        ) : page === 'live' ? (
          <LiveScan />
        ) : loading ? (
          <LoadingState message="Loading scan report..." />
        ) : report ? (
          page === 'overview' ? (
            <Overview report={report} />
          ) : (
            <Findings samples={report.samples || []} />
          )
        ) : (
          <EmptyState onLaunch={() => setPage('launcher')} />
        )}
      </main>
    </div>
    </ErrorBoundary>
  )
}

function EmptyState({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div style={{ textAlign: 'center', color: theme.textFaint, padding: 80 }}>
      <p style={{ fontSize: 16, marginBottom: 8, color: theme.textDim }}>
        No scan report found
      </p>
      <p style={{ fontSize: 13, marginBottom: 20 }}>
        Launch your first scan from the dashboard.
      </p>
      <button
        onClick={onLaunch}
        style={{
          padding: '10px 24px',
          background: theme.primary, color: theme.bg,
          border: 'none', borderRadius: theme.radius,
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        ⚡ New Scan
      </button>
    </div>
  )
}
