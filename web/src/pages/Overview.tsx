/**
 * Overview — dashboard landing page with radar chart, gauge, and suite bars.
 */
import { theme } from '../theme'
import type { ScanReport } from '../types'
import { RadarChart } from '../components/RadarChart'
import { ScoreGauge } from '../components/ScoreGauge'
import { SuiteBar } from '../components/SuiteBar'
import { SummaryTiles } from '../components/SummaryTiles'

interface Props {
  report: ScanReport
}

export function Overview({ report }: Props) {
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
          <RadarChart suites={report.suites} size={280} />
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
