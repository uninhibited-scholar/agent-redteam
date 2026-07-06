/**
 * ScanProgress — multi-stage scan lifecycle visualization.
 * Shows the phases of a scan (loading suites → executing → judging → persisting)
 * with checkpoint/resume awareness.
 *
 * Pure SVG/HTML, zero deps. Designed for the ScanLauncher and LiveScan pages.
 */
import { theme } from '../theme'
import { Tooltip } from './ui'

export interface ScanStage {
  id: string
  label: string
  /** 'done' | 'active' | 'pending' | 'error' */
  status: 'done' | 'active' | 'pending' | 'error'
  /** Optional detail: item count, duration, etc. */
  detail?: string
}

interface Props {
  stages: ScanStage[]
  /** Orientation: horizontal stepper or vertical timeline. */
  orientation?: 'horizontal' | 'vertical'
}

export function ScanProgress({ stages, orientation = 'horizontal' }: Props) {
  if (orientation === 'vertical') {
    return <VerticalTimeline stages={stages} />
  }
  return <HorizontalStepper stages={stages} />
}

function HorizontalStepper({ stages }: { stages: ScanStage[] }) {
  const statusColor = (s: ScanStage['status']) =>
    s === 'done' ? theme.success
    : s === 'active' ? theme.primary
    : s === 'error' ? theme.danger
    : theme.textFaint

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      overflowX: 'auto', padding: '8px 0',
    }}>
      {stages.map((stage, i) => (
        <div key={stage.id} style={{ display: 'flex', alignItems: 'center', flex: i < stages.length - 1 ? 1 : '0 0 auto' }}>
          {/* Node */}
          <Tooltip content={<><strong>{stage.label}</strong>{stage.detail && '\n' + stage.detail}</>}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, flexShrink: 0,
              background: stage.status === 'pending' ? theme.bg : statusColor(stage.status) + '18',
              border: `2px solid ${statusColor(stage.status)}`,
              color: statusColor(stage.status),
              transition: 'all 300ms ease',
              animation: stage.status === 'active' ? 'pulse 1.5s ease infinite' : 'none',
            }}>
              {stage.status === 'done' ? '✓' : stage.status === 'error' ? '✕' : i + 1}
            </div>
          </Tooltip>
          {/* Label */}
          <div style={{ marginLeft: 8, marginRight: 12, whiteSpace: 'nowrap' }}>
            <div style={{
              fontSize: 11, fontWeight: 600,
              color: stage.status === 'pending' ? theme.textFaint : theme.text,
            }}>
              {stage.label}
            </div>
            {stage.detail && (
              <div style={{ fontSize: 10, color: theme.textFaint }}>{stage.detail}</div>
            )}
          </div>
          {/* Connector */}
          {i < stages.length - 1 && (
            <div style={{
              flex: 1, height: 2, minWidth: 24,
              background: stage.status === 'done' ? theme.success : theme.border,
              borderRadius: 1,
              transition: 'background 300ms ease',
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

function VerticalTimeline({ stages }: { stages: ScanStage[] }) {
  const statusColor = (s: ScanStage['status']) =>
    s === 'done' ? theme.success
    : s === 'active' ? theme.primary
    : s === 'error' ? theme.danger
    : theme.textFaint

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {stages.map((stage, i) => (
        <div key={stage.id} style={{ display: 'flex', gap: 12, paddingBottom: i < stages.length - 1 ? 16 : 0 }}>
          {/* Timeline column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, flexShrink: 0,
              background: stage.status === 'pending' ? theme.bg : statusColor(stage.status) + '18',
              border: `2px solid ${statusColor(stage.status)}`,
              color: statusColor(stage.status),
              animation: stage.status === 'active' ? 'pulse 1.5s ease infinite' : 'none',
            }}>
              {stage.status === 'done' ? '✓' : stage.status === 'error' ? '✕' : i + 1}
            </div>
            {i < stages.length - 1 && (
              <div style={{
                width: 2, flex: 1, minHeight: 20,
                background: stage.status === 'done' ? theme.success : theme.border,
                marginTop: 4,
              }} />
            )}
          </div>
          {/* Content */}
          <div style={{ paddingBottom: i < stages.length - 1 ? 0 : 0, paddingTop: 2 }}>
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: stage.status === 'pending' ? theme.textFaint : theme.text,
            }}>
              {stage.label}
            </div>
            {stage.detail && (
              <div style={{ fontSize: 11, color: theme.textDim, marginTop: 2 }}>{stage.detail}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
