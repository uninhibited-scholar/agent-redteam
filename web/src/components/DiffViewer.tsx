/**
 * DiffViewer — side-by-side comparison of two models' responses to the
 * same attack sample, with line-level diff highlighting.
 */
import { theme } from '../theme'
import { Panel } from './ui'

export interface DiffSide {
  model: string
  verdict: 'pass' | 'fail' | 'error'
  response: string
}

interface DiffViewerProps {
  sampleId: string
  question?: string
  sideA: DiffSide
  sideB: DiffSide
  onClose?: () => void
}

interface DiffLine {
  type: 'common' | 'a-only' | 'b-only'
  aLine?: number
  bLine?: number
  text: string
}

function lineDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'common', aLine: i + 1, bLine: j + 1, text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'a-only', aLine: i + 1, text: a[i] })
      i++
    } else {
      result.push({ type: 'b-only', bLine: j + 1, text: b[j] })
      j++
    }
  }
  while (i < n) {
    result.push({ type: 'a-only', aLine: i + 1, text: a[i] })
    i++
  }
  while (j < m) {
    result.push({ type: 'b-only', bLine: j + 1, text: b[j] })
    j++
  }
  return result
}

function verdictColor(verdict: DiffSide['verdict']): string {
  if (verdict === 'pass') return theme.success
  if (verdict === 'fail') return theme.danger
  return theme.warning
}

function VerdictBadge({ verdict }: { verdict: DiffSide['verdict'] }) {
  const color = verdictColor(verdict)
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
      color, padding: '2px 7px', borderRadius: 10,
      background: color + '18', whiteSpace: 'nowrap',
    }}>
      {verdict}
    </span>
  )
}

function DiffColumn({ side, lines, which }: {
  side: DiffSide
  lines: DiffLine[]
  which: 'a' | 'b'
}) {
  const highlightType = which === 'a' ? 'a-only' : 'b-only'
  const otherOnly = which === 'a' ? 'b-only' : 'a-only'
  const highlightColor = which === 'a' ? theme.danger : theme.success

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{side.model}</span>
        <VerdictBadge verdict={side.verdict} />
      </div>
      <div style={{
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radiusSm,
        maxHeight: 400,
        overflowY: 'auto',
        fontFamily: theme.monoFamily,
        fontSize: 12,
      }}>
        {lines.map((line, idx) => {
          const num = which === 'a' ? line.aLine : line.bLine
          const isHighlighted = line.type === highlightType
          // Lines that belong to the OTHER side are rendered as blank spacers
          // (preserving row alignment) without leaking the other model's text.
          const isSpacer = line.type === otherOnly
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                borderLeft: isHighlighted ? `3px solid ${highlightColor}` : '3px solid transparent',
                background: isHighlighted ? highlightColor + '10' : 'transparent',
                lineHeight: 1.6,
                opacity: isSpacer ? 0.3 : 1,
              }}
            >
              <span style={{
                width: 36, flexShrink: 0, textAlign: 'right', paddingRight: 8,
                color: theme.textFaint, userSelect: 'none',
              }}>
                {num ?? ''}
              </span>
              <span style={{
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: theme.text,
                padding: '0 8px 0 0', flex: 1,
              }}>
                {isSpacer ? '' : (line.text || ' ')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DiffViewer({ sampleId, question, sideA, sideB, onClose }: DiffViewerProps) {
  const linesA = sideA.response.split('\n')
  const linesB = sideB.response.split('\n')
  const diff = lineDiff(linesA, linesB)

  const aOnly = diff.filter(l => l.type === 'a-only').length
  const bOnly = diff.filter(l => l.type === 'b-only').length
  const common = diff.filter(l => l.type === 'common').length

  return (
    <Panel padding="16px 20px">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: question ? 12 : 16 }}>
        <code style={{ fontSize: 12, color: theme.textDim, fontFamily: theme.monoFamily }}>
          {sampleId}
        </code>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: theme.textDim,
              fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {question && (
        <pre style={{
          fontSize: 12.5, color: theme.text, fontFamily: theme.monoFamily,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6,
          background: theme.bg, padding: 12, borderRadius: theme.radiusSm,
          border: `1px solid ${theme.border}`, margin: '0 0 16px 0',
        }}>
          {question}
        </pre>
      )}

      <div style={{ display: 'flex', gap: 16 }}>
        <DiffColumn side={sideA} lines={diff} which="a" />
        <DiffColumn side={sideB} lines={diff} which="b" />
      </div>

      <div style={{
        marginTop: 12, fontSize: 11, color: theme.textFaint,
        fontFamily: theme.monoFamily, textAlign: 'center',
      }}>
        A 独有 {aOnly} 行 · B 独有 {bOnly} 行 · 相同 {common} 行
      </div>
    </Panel>
  )
}
