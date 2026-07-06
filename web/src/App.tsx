/**
 * App — main layout with navigation, global command palette, toast
 * notifications, and keyboard shortcuts.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { theme, globalStyles } from './theme'
import type { ScanReport } from './types'
import { Overview } from './pages/Overview'
import { Findings } from './pages/Findings'
import { LiveScan } from './pages/LiveScan'
import { ScanLauncher } from './pages/ScanLauncher'
import { History } from './pages/History'
import { Compare } from './pages/Compare'
import { Settings } from './pages/Settings'
import { Metrics } from './pages/Metrics'
import { SuiteDetail } from './pages/SuiteDetail'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingState } from './components/EmptyState'
import { CommandPalette, type Command } from './components/CommandPalette'
import { HelpOverlay } from './components/HelpOverlay'
import { DetailDrawer } from './components/DetailDrawer'
import { NotificationProvider, useNotification } from './components/NotificationToast'
import type { SampleResult } from './types'

type Page = 'overview' | 'findings' | 'live' | 'launcher' | 'history' | 'compare' | 'settings' | 'metrics' | 'suite-detail'

const PAGE_ORDER: Page[] = ['overview', 'metrics', 'findings', 'launcher', 'live', 'history', 'compare', 'settings']

function AppInner() {
  const [page, setPage] = useState<Page>('overview')
  const [report, setReport] = useState<ScanReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // Pending suite filter applied when drilling from Overview → Findings
  const [pendingSuite, setPendingSuite] = useState<string | null>(null)
  // Pending severity/verdict filter for drilldowns
  const [pendingSeverity, setPendingSeverity] = useState<string | null>(null)
  const [pendingVerdict, setPendingVerdict] = useState<string | null>(null)
  // Suite being viewed in SuiteDetail page
  const [activeSuite, setActiveSuite] = useState<string | null>(null)
  // Sample shown in the global DetailDrawer
  const [drawerSample, setDrawerSample] = useState<SampleResult | null>(null)
  const { notify } = useNotification()

  // Drill from a chart into Findings with optional filters
  const drillToFindings = useCallback((suite?: string | null, severity?: string | null, verdict?: string | null) => {
    setPendingSuite(suite ?? null)
    setPendingSeverity(severity ?? null)
    setPendingVerdict(verdict ?? null)
    setPage('findings')
    const parts = [suite, severity, verdict].filter(Boolean).map(x => String(x).replace(/_/g, ' '))
    if (parts.length) notify(`筛选：${parts.join(' · ')}`, 'info')
  }, [notify])

  // Drill into the SuiteDetail deep-dive page
  const drillToSuite = useCallback((suiteName: string) => {
    setActiveSuite(suiteName)
    setPage('suite-detail')
  }, [])

  useEffect(() => {
    // Inject global styles
    const style = document.createElement('style')
    style.textContent = globalStyles
    document.head.appendChild(style)

    loadLatestReport()
  }, [])

  const loadLatestReport = useCallback(() => {
    setLoading(true)
    fetch('/api/report')
      .then(r => r.json())
      .then(data => { setReport(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const loadReport = (runId: string) => {
    setLoading(true)
    fetch(`/api/report/${encodeURIComponent(runId)}`)
      .then(r => r.json())
      .then(data => { setReport(data); setLoading(false); setPage('overview') })
      .catch(() => setLoading(false))
  }

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd/Ctrl+K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
        return
      }
      // Don't intercept shortcuts when typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable
      if (typing) return

      // ? → help
      if (e.key === '?') {
        e.preventDefault()
        setHelpOpen(o => !o)
        return
      }
      // R → refresh report
      if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        loadLatestReport()
        notify('已刷新报告数据', 'info')
        return
      }
      // 1-7 → switch page
      const num = parseInt(e.key, 10)
      if (!isNaN(num) && num >= 1 && num <= PAGE_ORDER.length) {
        e.preventDefault()
        setPage(PAGE_ORDER[num - 1])
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [loadLatestReport, notify])

  const navItems: { id: Page; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '◈' },
    { id: 'metrics', label: 'Metrics', icon: '⊞' },
    { id: 'findings', label: 'Findings', icon: '◉' },
    { id: 'launcher', label: 'Scan', icon: '⚡' },
    { id: 'live', label: 'Live Scan', icon: '◐' },
    { id: 'history', label: 'History', icon: '▤' },
    { id: 'compare', label: 'Compare', icon: '⇄' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ]

  const subtitles: Record<Page, string> = {
    overview: 'Security posture overview',
    metrics: 'Deep analytics across all suites',
    findings: 'Detailed vulnerability findings',
    'suite-detail': 'Single suite deep dive',
    launcher: 'Launch a new red team scan',
    live: 'Real-time scan telemetry',
    history: 'Past scan records',
    compare: 'Compare two scans side by side',
    settings: 'Scan defaults and preferences',
  }

  // Command palette commands
  const commands: Command[] = useMemo(() => {
    const navCmds: Command[] = navItems.map((item, i) => ({
      id: `nav-${item.id}`,
      label: `前往 ${item.label}`,
      hint: `按 ${i + 1}`,
      icon: item.icon,
      group: 'Navigate' as const,
      keywords: [item.id, 'go', 'navigate', 'page', '页面'],
      run: () => setPage(item.id),
    }))
    const actionCmds: Command[] = [
      {
        id: 'action-refresh',
        label: '刷新当前报告',
        icon: '↻',
        group: 'Action',
        keywords: ['refresh', 'reload', '更新', '刷新'],
        run: () => { loadLatestReport(); notify('已刷新报告数据', 'success') },
      },
      {
        id: 'action-export-json',
        label: '导出报告为 JSON',
        icon: '⬇',
        group: 'Action',
        keywords: ['export', 'download', 'json', '导出', '下载'],
        run: () => { window.open('/api/export/json', '_blank'); notify('正在导出 JSON…', 'info') },
      },
      {
        id: 'action-export-md',
        label: '导出报告为 Markdown',
        icon: '⬇',
        group: 'Action',
        keywords: ['export', 'download', 'markdown', 'md', '导出'],
        run: () => { window.open('/api/export/markdown', '_blank'); notify('正在导出 Markdown…', 'info') },
      },
      {
        id: 'action-copy-link',
        label: '复制分享链接',
        icon: '⧉',
        group: 'Action',
        keywords: ['copy', 'share', 'link', 'url', '复制', '分享'],
        run: () => {
          navigator.clipboard?.writeText(window.location.href)
            .then(() => notify('已复制链接到剪贴板', 'success'))
            .catch(() => notify('复制失败', 'error'))
        },
      },
      {
        id: 'action-new-scan',
        label: '发起新扫描',
        icon: '⚡',
        group: 'Action',
        keywords: ['scan', 'new', 'start', 'launch', '扫描', '开始'],
        run: () => setPage('launcher'),
      },
    ]
    // One command per suite for quick drill-down
    const suiteCmds: Command[] = (report?.suites || []).map(s => ({
      id: `suite-${s.name}`,
      label: `分析套件 ${s.name.replace(/_/g, ' ')}`,
      icon: '◉',
      group: 'Suite',
      keywords: [s.name, 'suite', 'detail', 'analyze', '套件', '分析', s.name.replace(/_/g, ' ')],
      run: () => drillToSuite(s.name),
    }))
    const helpCmds: Command[] = [
      {
        id: 'help-shortcuts',
        label: '查看快捷键与帮助',
        icon: '?',
        group: 'Help',
        keywords: ['help', 'shortcuts', 'faq', '帮助', '快捷键'],
        run: () => setHelpOpen(true),
      },
    ]
    return [...navCmds, ...suiteCmds, ...actionCmds, ...helpCmds]
  }, [loadLatestReport, notify, report, drillToSuite])

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

        {/* Spacer pushes help to bottom */}
        <div style={{ flex: 1 }} />
        <HelpTrigger onToggle={() => setHelpOpen(o => !o)} />
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
        <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
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
          {/* Command palette trigger button */}
          <button
            onClick={() => setPaletteOpen(true)}
            title="命令面板 (⌘K)"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px 6px 12px',
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: theme.radius,
              color: theme.textFaint,
              fontSize: 12,
              cursor: 'pointer',
              transition: theme.transition,
            }}
          >
            <span>⌕</span>
            <span>搜索…</span>
            <kbd style={{
              fontSize: 10, fontFamily: theme.monoFamily,
              border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
              padding: '1px 5px', color: theme.textDim,
            }}>
              ⌘K
            </kbd>
          </button>
        </div>

        {page === 'launcher' ? (
          <ScanLauncher onScanStarted={() => setPage('live')} />
        ) : page === 'history' ? (
          <History onLoad={loadReport} />
        ) : page === 'compare' ? (
          <Compare />
        ) : page === 'live' ? (
          <LiveScan />
        ) : page === 'settings' ? (
          <Settings />
        ) : page === 'suite-detail' && report && activeSuite ? (
          <SuiteDetail
            suiteName={activeSuite}
            report={report}
            onBack={() => setPage('overview')}
            onOpenSample={setDrawerSample}
          />
        ) : loading ? (
          <LoadingState message="Loading scan report..." />
        ) : report ? (
          page === 'overview' ? (
            <Overview report={report} onSuiteClick={s => drillToSuite(s.name)} />
          ) : page === 'metrics' ? (
            <Metrics report={report} onDrill={drillToFindings} />
          ) : (
            <Findings
              initialSuite={pendingSuite}
              initialSeverity={pendingSeverity}
              initialVerdict={pendingVerdict}
              onConsumedFilter={() => { setPendingSuite(null); setPendingSeverity(null); setPendingVerdict(null) }}
            />
          )
        ) : (
          <NoReportState onLaunch={() => setPage('launcher')} />
        )}
      </main>

      {/* Global overlays */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />
      {helpOpen && (
        <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      )}
      <DetailDrawer sample={drawerSample} onClose={() => setDrawerSample(null)} />
    </div>
    </ErrorBoundary>
  )
}

export function App() {
  return (
    <NotificationProvider>
      <AppInner />
    </NotificationProvider>
  )
}

function HelpTrigger({ onToggle }: { onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label="Help (?)"
      title="帮助 (?)"
      style={{
        width: 32, height: 32, borderRadius: '50%',
        background: theme.surface, border: `1px solid ${theme.border}`,
        color: theme.textDim, fontSize: 14, fontWeight: 700,
        cursor: 'pointer', transition: theme.transition,
      }}
    >
      ?
    </button>
  )
}

/** Controlled wrapper that renders HelpOverlay's panel content. */

function NoReportState({ onLaunch }: { onLaunch: () => void }) {
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


