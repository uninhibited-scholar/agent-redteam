/**
 * Overview — dashboard landing page with radar chart, gauge, and suite bars.
 */
import { theme } from '../theme'
import type { ScanReport } from '../types'
import { RadarChart } from '../components/RadarChart'
import { ScoreGauge } from '../components/ScoreGauge'
import { SuiteBar } from '../components/SuiteBar'

interface Props {
  report: ScanReport
}

export function Overview({ report }: Props) {
  const samples = report.samples || []

  return (
    <div>
      {/* Hero: gauge + radar */}
      <div style={{
        display: 'flex', gap: 40, alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
        flexWrap: 'wrap',
      }}>
        <div style={{ textAlign: 'center' }}>
          <ScoreGauge score={report.overall_score} size={180} />
        </div>
        <div>
          <RadarChart suites={report.suites} size={280} />
        </div>
      </div>

      {/* Summary tiles */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 32,
      }}>
        <StatTile label="Total Samples" value={report.total_samples} color={theme.primary} />
        <StatTile label="Passed" value={report.total_passed} color={theme.success} />
        <StatTile label="Failed" value={report.total_failed} color={theme.danger} />
        <StatTile label="Target" value={report.target_model} color={theme.textDim} mono />
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
          Suite Breakdown
        </h2>
        {report.suites.map(suite => {
          const owasp = samples.find(s => s.suite === suite.name)?.owasp || ''
          return <SuiteBar key={suite.name} suite={{...suite, owasp}} />
        })}
      </div>
    </div>
  )
}

function StatTile({ label, value, color, mono }: { label: string; value: string | number; color: string; mono?: boolean }) {
  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: theme.radius,
      padding: '16px 20px',
    }}>
      <div style={{
        fontSize: 11, color: theme.textFaint,
        textTransform: 'uppercase', letterSpacing: 0.5,
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: mono ? 14 : 28,
        fontWeight: 700,
        color,
        fontFamily: mono ? theme.monoFamily : theme.fontFamily,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {value}
      </div>
    </div>
  )
}
