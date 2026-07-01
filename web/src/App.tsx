/**
 * App — main layout with navigation.
 */
import { useState, useEffect } from 'react'
import { theme, globalStyles } from './theme'
import type { ScanReport } from './types'
import { Overview } from './pages/Overview'
import { Findings } from './pages/Findings'
import { LiveScan } from './pages/LiveScan'

type Page = 'overview' | 'findings' | 'live'

export function App() {
  const [page, setPage] = useState<Page>('overview')
  const [report, setReport] = useState<ScanReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Inject global styles
    const style = document.createElement('style')
    style.textContent = globalStyles
    document.head.appendChild(style)

    // Load the last scan report
    fetch('/api/report')
      .then(r => r.json())
      .then(data => { setReport(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const navItems: { id: Page; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '◈' },
    { id: 'findings', label: 'Findings', icon: '◉' },
    { id: 'live', label: 'Live Scan', icon: '◐' },
  ]

  return (
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
            }}
          >
            {item.icon}
          </button>
        ))}
      </nav>

      {/* Main content */}
      <main style={{
        flex: 1,
        padding: 32,
        overflowY: 'auto',
        maxWidth: 1200,
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
            {page === 'overview' && 'Security posture overview'}
            {page === 'findings' && 'Detailed vulnerability findings'}
            {page === 'live' && 'Real-time scan telemetry'}
          </p>
        </div>

        {loading ? (
          <div style={{
            textAlign: 'center', color: theme.textFaint,
            padding: 80, fontSize: 14,
          }}>
            Loading report...
          </div>
        ) : page === 'live' ? (
          <LiveScan />
        ) : report ? (
          page === 'overview' ? (
            <Overview report={report} />
          ) : (
            <Findings samples={report.samples || []} />
          )
        ) : (
          <div style={{
            textAlign: 'center', color: theme.textFaint,
            padding: 80,
          }}>
            <p style={{ fontSize: 16, marginBottom: 8, color: theme.textDim }}>
              No scan report found
            </p>
            <p style={{ fontSize: 13 }}>
              Run a scan first: <code style={{ color: theme.primary }}>agent-redteam scan --model ...</code>
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
