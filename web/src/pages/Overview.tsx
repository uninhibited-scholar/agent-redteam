/**
 * Overview — dashboard landing page with gauge, radar, verdict donut,
 * suite bars, risk matrix, and execution timeline.
 */
import { useMemo } from 'react'
import { theme } from '../theme'
import type { ScanReport, SuiteResult } from '../types'
import { RadarChart } from '../components/RadarChart'
import { ScoreGauge } from '../components/ScoreGauge'
import { SuiteBar } from '../components/SuiteBar'
import { SummaryTiles } from '../components/SummaryTiles'
import { RiskMatrix } from '../components/RiskMatrix'
import { AttackTimeline } from '../components/AttackTimeline'
import { SeverityDistribution } from '../components/SeverityDistribution'
import { DonutChart, type DonutSegment } from '../components/DonutChart'
import { ModelProfile } from '../components/ModelProfile'

interface Props {
  report: ScanReport
  /** Called when the user clicks a suite vertex / bar to drill into Findings. */
  onSuiteClick?: (suite: SuiteResult) => void
}

export function Overview({ report, onSuiteClick }: Props) {
  const samples = report.samples || []
  const score = report.overall_score ?? 0

  const verdictSegs: DonutSegment[] = useMemo(() => {
    const p = samples.filter(s => s.verdict === 'pass').length
    const f = samples.filter(s => s.verdict === 'fail').length
    const e = samples.filter(s => s.verdict === 'error').length
    return [
      { label: '通过', value: p, color: theme.success },
      { label: '失败', value: f, color: theme.danger },
      { label: '错误', value: e, color: theme.warning },
    ].filter(s => s.value > 0)
  }, [samples])

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>
      {/* Hero: gauge + radar + donut */}
      <div style={{
        display: 'flex', gap: 40, alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
        flexWrap: 'wrap',
      }}>
        <div style={{ textAlign: 'center' }}>
          <ScoreGauge score={score} size={180} />
          <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            总评分
          </div>
        </div>
        <div>
          <RadarChart suites={report.suites} size={280} onSuiteClick={onSuiteClick} />
        </div>
        {verdictSegs.length > 0 && (
          <div style={{ textAlign: 'center' }}>
            <DonutChart
              segments={verdictSegs}
              size={160}
              centerValue={samples.length}
              centerLabel="样本"
            />
            <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              判定分布
            </div>
          </div>
        )}
      </div>

      {/* Shareable model security card */}
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}>
        <ModelProfile
          model={report.target_model ?? '—'}
          overallScore={score}
          totalSamples={report.total_samples ?? 0}
          totalPassed={report.total_passed ?? 0}
          totalFailed={report.total_failed ?? 0}
          suites={report.suites}
          scannedAt={report.finished_at}
        />
      </div>

      {/* Summary tiles */}
      <div style={{ marginBottom: 32 }}>
        <SummaryTiles tiles={[
          { label: 'Total Samples', value: report.total_samples ?? 0, color: theme.primary },
          { label: 'Passed', value: report.total_passed ?? 0, color: theme.success },
          { label: 'Failed', value: report.total_failed ?? 0, color: theme.danger },
          { label: 'Target', value: report.target_model ?? '—', color: theme.textDim, mono: true, subtitle: 'Model' },
          { label: 'Date', value: report.finished_at?.slice(0, 10) ?? '—', color: theme.textDim, mono: true },
        ]} />
      </div>

      {/* Risk matrix + timeline side by side */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 20,
        marginBottom: 24,
      }}>
        <Panel title="Risk Matrix" subtitle="失败密度 × 严重性">
          {samples.length > 0
            ? <RiskMatrix samples={samples} />
            : <Hint text="No samples in this report." />}
        </Panel>
        <Panel title="Execution Timeline" subtitle="按执行顺序的结果流 · 连续失败高亮">
          {samples.length > 0
            ? <AttackTimeline entries={samples.map((s, i) => ({ index: i, sample: s }))} maxEntries={60} />
            : <Hint text="No samples in this report." />}
        </Panel>
      </div>

      {/* Severity distribution — where do failures concentrate? */}
      {samples.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SeverityDistribution samples={samples} />
        </div>
      )}

      {/* Suite bars */}
      <div style={{
        background: theme.surface,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        padding: 24,
      }}>
        <h2 style={{
          fontSize: 14, fontWeight: 600, color: theme.primary,
          marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1,
        }}>
          Suite Breakdown ({report.suites.length} suites)
        </h2>
        {report.suites.map(suite => {
          const owasp = samples.find(s => s.suite === suite.name)?.owasp || suite.owasp || ''
          return <SuiteBar key={suite.name} suite={{...suite, owasp}} />
        })}
      </div>
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: theme.surface,
      borderRadius: theme.radius,
      border: `1px solid ${theme.border}`,
      padding: 20,
    }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{
          fontSize: 13, fontWeight: 600, color: theme.primary,
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2,
        }}>
          {title}
        </h2>
        {subtitle && <span style={{ fontSize: 11, color: theme.textFaint }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

function Hint({ text }: { text: string }) {
  return <div style={{ color: theme.textFaint, fontSize: 12, padding: 20, textAlign: 'center' }}>{text}</div>
}


