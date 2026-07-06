/**
 * Overview — dashboard landing page with radar chart, gauge, suite bars,
 * risk matrix, and execution timeline.
 */
import { theme } from '../theme'
import type { ScanReport, SuiteResult } from '../types'
import { RadarChart } from '../components/RadarChart'
import { ScoreGauge } from '../components/ScoreGauge'
import { SuiteBar } from '../components/SuiteBar'
import { SummaryTiles } from '../components/SummaryTiles'
import { RiskMatrix } from '../components/RiskMatrix'
import { SampleTimeline } from '../components/SampleTimeline'

interface Props {
  report: ScanReport
  /** Called when the user clicks a suite vertex / bar to drill into Findings. */
  onSuiteClick?: (suite: SuiteResult) => void
}

export function Overview({ report, onSuiteClick }: Props) {
  const samples = report.samples || []
  const score = report.overall_score ?? 0

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>
      {/* Hero: gauge + radar */}
      <div style={{
        display: 'flex', gap: 40, alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
        flexWrap: 'wrap',
      }}>
        <div style={{ textAlign: 'center' }}>
          <ScoreGauge score={score} size={180} />
        </div>
        <div>
          <RadarChart suites={report.suites} size={280} onSuiteClick={onSuiteClick} />
        </div>
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
        <Panel title="Execution Timeline" subtitle="按套件顺序的结果流">
          {samples.length > 0
            ? <SampleTimeline samples={samples} />
            : <Hint text="No samples in this report." />}
        </Panel>
      </div>

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

