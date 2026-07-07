/**
 * DashboardPage — the "security posture" home screen, one level above Overview.
 * Aggregates every scan in history (not just the latest report) into global
 * KPIs, the newest scan's snapshot, the top dangerous findings, and a recent
 * activity timeline.
 */
import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag, SeverityBadge } from '../components/ui'
import { useApi } from '../hooks/useApi'
import type { HistoryItem, ScanReport } from '../types'

interface DashboardPageProps {
  /** 点击"开始扫描"的回调（跳转到 ScanLauncher） */
  onStartScan: () => void
  /** 点击某条历史的回调 */
  onViewScan: (runId: string) => void
}

export function aggregateDashboard(scans: HistoryItem[]): {
  totalScans: number
  uniqueModels: number
  avgScore: number
  totalSamples: number
  recentTrend: number[]
  monthlyCount: number
} {
  const totalScans = scans.length
  const uniqueModels = new Set(scans.map(s => s.target_model)).size
  const totalSamples = scans.reduce((sum, s) => sum + (s.total_samples || 0), 0)

  const valid = scans.filter(s => s.overall_score >= 0)
  const avgScore = valid.length ? valid.reduce((sum, s) => sum + s.overall_score, 0) / valid.length : 0

  // History arrives newest-first; chart oldest→newest.
  const recentTrend = [...valid].slice(0, 20).reverse().map(s => s.overall_score)

  const now = new Date()
  const monthlyCount = scans.filter(s => {
    const d = new Date(s.created_at)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length

  return { totalScans, uniqueModels, avgScore, totalSamples, recentTrend, monthlyCount }
}

function sparklinePath(points: number[], width: number, height: number): string {
  if (points.length < 2) return ''
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = width / (points.length - 1)
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${i * step},${height - ((p - min) / range) * height}`)
    .join(' ')
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

function scoreColor(score: number): string {
  if (score < 0) return theme.textFaint
  if (score < 50) return theme.danger
  if (score < 80) return theme.warning
  return theme.success
}

function KpiCard({ label, value, suffix, sparkline, color }: {
  label: string
  value: string | number
  suffix?: string
  sparkline?: number[]
  color: string
}) {
  return (
    <div style={{
      flex: 1, minWidth: 160, background: theme.surface, border: `1px solid ${theme.border}`,
      borderRadius: theme.radius, padding: '16px 18px',
    }}>
      <div style={{ fontSize: 10, color: theme.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color, fontFamily: theme.monoFamily }}>{value}</span>
        {suffix && <span style={{ fontSize: 12, color: theme.textFaint }}>{suffix}</span>}
      </div>
      {sparkline && sparkline.length >= 2 && (
        <svg width={100} height={24} style={{ marginTop: 8, display: 'block' }}>
          <path d={sparklinePath(sparkline, 100, 24)} fill="none" stroke={color} strokeWidth={1.5} />
        </svg>
      )}
      {sparkline && sparkline.length === 1 && (
        <svg width={100} height={24} style={{ marginTop: 8, display: 'block' }}>
          <circle cx={4} cy={12} r={3} fill={color} />
        </svg>
      )}
    </div>
  )
}

export function DashboardPage({ onStartScan, onViewScan }: DashboardPageProps) {
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null)
  const { data: historyData } = useApi<{ scans: HistoryItem[] }>('/api/history?limit=100')
  const { data: latestReport } = useApi<ScanReport>('/api/report')

  const scans = historyData?.scans || []
  const agg = useMemo(() => aggregateDashboard(scans), [scans])
  const latestScan = scans[0]

  const topFindings = useMemo(() => {
    const samples = latestReport?.samples || []
    return samples
      .filter(s => s.verdict === 'fail' && (s.severity === 'critical' || s.severity === 'high'))
      .sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1))
      .slice(0, 5)
  }, [latestReport])

  const recentActivity = scans.slice(0, 8)

  // No history at all — pure onboarding state.
  if (scans.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: theme.textFaint }}>
        <p style={{ fontSize: 16, marginBottom: 8, color: theme.textDim }}>还没有扫描记录</p>
        <p style={{ fontSize: 13, marginBottom: 20 }}>发起第一次扫描，开始建立安全态势总览。</p>
        <button
          onClick={onStartScan}
          style={{
            padding: '10px 24px', background: theme.primary, color: theme.bg,
            border: 'none', borderRadius: theme.radius, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          ⚡ 开始第一次扫描
        </button>
      </div>
    )
  }

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>
      {/* Region 1: global KPI matrix */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <KpiCard label="累计扫描次数" value={agg.totalScans} suffix={`本月 +${agg.monthlyCount}`} color={theme.primary} />
        <KpiCard label="覆盖模型数" value={agg.uniqueModels} color={theme.text} />
        <KpiCard label="平均安全分" value={agg.avgScore.toFixed(1)} sparkline={agg.recentTrend} color={scoreColor(agg.avgScore)} />
        <KpiCard label="总测试样本数" value={agg.totalSamples} color={theme.textDim} />
      </div>

      {/* Region 2: latest scan snapshot */}
      <div style={{ marginBottom: 24 }}>
        <Panel title="最新扫描" subtitle={latestScan ? relativeTime(latestScan.created_at) : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: theme.text, fontFamily: theme.monoFamily }}>
                {latestScan.target_model}
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: scoreColor(latestScan.overall_score), fontFamily: theme.monoFamily }}>
                {latestScan.overall_score >= 0 ? latestScan.overall_score.toFixed(1) : 'N/A'}
              </div>
            </div>
            {latestReport?.suites && latestReport.suites.length > 0 && (
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 10, color: theme.textFaint, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  套件通过率
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', border: `1px solid ${theme.border}` }}>
                  {latestReport.suites.slice(0, 10).map(s => (
                    <div
                      key={s.name}
                      title={`${s.name}: ${s.score.toFixed(0)}`}
                      style={{ flex: 1, background: scoreColor(s.score), opacity: 0.85, borderRight: `1px solid ${theme.bg}` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => onViewScan(latestScan.run_id)}
              style={{
                padding: '8px 18px', background: theme.primary + '18', border: `1px solid ${theme.primary}`,
                borderRadius: theme.radius, color: theme.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              查看详情
            </button>
          </div>
        </Panel>
      </div>

      {/* Region 3: top dangerous findings */}
      <div style={{ marginBottom: 24 }}>
        <Panel title="最危险发现 TOP5" subtitle="来自最新报告，critical/high 优先">
          {topFindings.length === 0 ? (
            <div style={{
              padding: '20px 0', textAlign: 'center', color: theme.success, fontSize: 13,
              background: theme.success + '08', borderRadius: theme.radius,
            }}>
              未发现 critical/high 级别漏洞 ✓
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {topFindings.map(f => (
                <div
                  key={f.sample_id}
                  onClick={() => setSelectedFinding(f.sample_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    borderRadius: theme.radiusSm, cursor: 'pointer',
                    background: selectedFinding === f.sample_id ? theme.surfaceHover : 'transparent',
                    transition: theme.transition,
                  }}
                >
                  <SeverityBadge severity={f.severity} />
                  <span style={{ fontSize: 11, color: theme.textDim, fontFamily: theme.monoFamily, whiteSpace: 'nowrap' }}>
                    {f.sample_id}
                  </span>
                  <MonoTag tone="dim">{f.suite}</MonoTag>
                  <span style={{ flex: 1, fontSize: 12, color: theme.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.question.length > 80 ? f.question.slice(0, 80) + '…' : f.question}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Region 4: recent activity timeline */}
      <div style={{ marginBottom: 24 }}>
        <Panel title="最近活动" subtitle={`最近 ${recentActivity.length} 次扫描`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recentActivity.map(scan => {
              const dotColor = scan.overall_score < 0 ? theme.textFaint
                : scan.overall_score < 50 ? theme.danger
                  : scan.overall_score >= 80 ? theme.success : theme.warning
              return (
                <div
                  key={scan.run_id}
                  onClick={() => onViewScan(scan.run_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px',
                    cursor: 'pointer', borderRadius: theme.radiusSm, transition: theme.transition,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = theme.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: theme.textFaint, width: 72, flexShrink: 0 }}>
                    {relativeTime(scan.created_at)}
                  </span>
                  <span style={{ fontSize: 12, color: theme.text, fontFamily: theme.monoFamily, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scan.target_model}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: dotColor, fontFamily: theme.monoFamily }}>
                    {scan.overall_score >= 0 ? scan.overall_score.toFixed(1) : 'N/A'}
                  </span>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      {/* Region 5: quick actions */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={onStartScan}
          style={{
            padding: '12px 28px', background: theme.primary, color: theme.bg,
            border: 'none', borderRadius: theme.radius, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          ⚡ 新建扫描
        </button>
        <button
          onClick={() => onViewScan('')}
          style={{
            padding: '12px 24px', background: 'transparent', border: `1px solid ${theme.border}`,
            borderRadius: theme.radius, color: theme.textDim, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          查看历史
        </button>
        <button
          onClick={() => onViewScan('')}
          style={{
            padding: '12px 24px', background: 'transparent', border: `1px solid ${theme.border}`,
            borderRadius: theme.radius, color: theme.textDim, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          对比模型
        </button>
      </div>
    </div>
  )
}
