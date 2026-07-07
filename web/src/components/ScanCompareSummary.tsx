/**
 * ScanCompareSummary — executive decision card comparing two scans/models.
 * Side-by-side overall scores, per-suite winner markers, and a one-line
 * "which to pick" verdict. High density, low reading cost — for reporting.
 */
import { useMemo } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'
import type { SuiteResult } from '../types'

interface ScanSide {
  label: string
  model: string
  overallScore: number
  suites: SuiteResult[]
  totalSamples: number
}

interface ScanCompareSummaryProps {
  /** 左侧扫描 */
  scanA: ScanSide
  /** 右侧扫描 */
  scanB: ScanSide
  /** 可选：点击某行的回调（行=套件维度） */
  onSelectSuite?: (suite: string) => void
}

const TIE_THRESHOLD = 2
const BIG_GAP = 20

/** Pure decision logic — kept out of JSX for testability. */
export function decideWinner(
  a: { overallScore: number; suites: SuiteResult[] },
  b: { overallScore: number; suites: SuiteResult[] },
): {
  winner: 'A' | 'B' | 'tie'
  reason: string
  dimensionWins: { A: number; B: number; ties: number }
} {
  const byNameB = new Map(b.suites.map(s => [s.name, s]))
  const shared = a.suites.filter(s => byNameB.has(s.name))

  let winsA = 0
  let winsB = 0
  let ties = 0
  for (const sa of shared) {
    const sb = byNameB.get(sa.name)!
    const diff = sa.score - sb.score
    if (Math.abs(diff) < TIE_THRESHOLD) ties++
    else if (diff > 0) winsA++
    else winsB++
  }
  const dimensionWins = { A: winsA, B: winsB, ties }

  let winner: 'A' | 'B' | 'tie'
  if (a.overallScore > b.overallScore) winner = 'A'
  else if (b.overallScore > a.overallScore) winner = 'B'
  else if (winsA > winsB) winner = 'A'
  else if (winsB > winsA) winner = 'B'
  else winner = 'tie'

  return { winner, reason: '', dimensionWins }
}

function buildReason(
  scanA: ScanSide, scanB: ScanSide,
  result: ReturnType<typeof decideWinner>,
): string {
  const { winner, dimensionWins: d } = result
  const scoreEqual = scanA.overallScore === scanB.overallScore

  if (winner === 'tie') {
    if (d.A === 0 && d.B === 0) return '两模型在所有测试维度表现一致'
    return '两模型表现相当，建议根据其他因素（成本/延迟）选择'
  }

  const win = winner === 'A' ? scanA : scanB
  const winScore = winner === 'A' ? scanA.overallScore : scanB.overallScore
  const loseScore = winner === 'A' ? scanB.overallScore : scanA.overallScore
  const winDims = winner === 'A' ? d.A : d.B
  const loseDims = winner === 'A' ? d.B : d.A

  if (scoreEqual) {
    return `两模型总分相同，但 ${win.model} 在更多维度领先（${winDims} vs ${loseDims}）`
  }
  return `建议选择 ${win.model}（总分 ${winScore} vs ${loseScore}，${winDims} 个维度领先）`
}

export function ScanCompareSummary({ scanA, scanB, onSelectSuite }: ScanCompareSummaryProps) {
  const { rows, unpaired, result, reason } = useMemo(() => {
    const byNameB = new Map(scanB.suites.map(s => [s.name, s]))
    const shared = scanA.suites
      .filter(s => byNameB.has(s.name))
      .map(sa => ({ name: sa.name, owasp: sa.owasp, a: sa.score, b: byNameB.get(sa.name)!.score }))
      .sort((x, y) => x.name.localeCompare(y.name))

    const totalA = scanA.suites.length
    const totalB = scanB.suites.length
    const unpairedCount = (totalA - shared.length) + (totalB - shared.length)

    const res = decideWinner(scanA, scanB)
    return { rows: shared, unpaired: unpairedCount, result: res, reason: buildReason(scanA, scanB, res) }
  }, [scanA, scanB])

  const scoreTie = scanA.overallScore === scanB.overallScore
  const aWinsScore = scanA.overallScore > scanB.overallScore
  const bWinsScore = scanB.overallScore > scanA.overallScore

  return (
    <Panel title="扫描对比摘要">
      {/* Header: model identity + overall score duel */}
      <div style={{ display: 'flex', alignItems: 'stretch', marginBottom: 18 }}>
        <ScoreColumn side={scanA} tie={scoreTie} winning={aWinsScore} align="right" />
        <div style={{ width: 1, background: theme.border, margin: '0 20px' }} />
        <ScoreColumn side={scanB} tie={scoreTie} winning={bWinsScore} align="left" />
      </div>

      {/* Body: per-dimension duel table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map(row => {
          const diff = row.a - row.b
          const tie = Math.abs(diff) < TIE_THRESHOLD
          const aWins = !tie && diff > 0
          const bWins = !tie && diff < 0
          const bigGap = Math.abs(diff) > BIG_GAP
          const winnerColor = aWins ? theme.success : bWins ? theme.success : theme.warning
          const rowBg = bigGap ? winnerColor + '08' : 'transparent'
          return (
            <div
              key={row.name}
              onClick={onSelectSuite ? () => onSelectSuite(row.name) : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr 60px',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: theme.radiusSm,
                background: rowBg,
                cursor: onSelectSuite ? 'pointer' : 'default',
              }}
            >
              <span style={{
                textAlign: 'right', fontFamily: theme.monoFamily, fontSize: 14, fontWeight: 700,
                color: aWins ? theme.success : theme.textDim,
              }}>
                {aWins && '◀ '}{row.a}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: theme.text }}>{row.name.replace(/_/g, ' ')}</span>
                {row.owasp && <MonoTag tone="dim">{row.owasp}</MonoTag>}
                {tie && <span style={{ color: theme.warning, fontWeight: 700, fontSize: 13 }}>=</span>}
              </div>
              <span style={{
                textAlign: 'left', fontFamily: theme.monoFamily, fontSize: 14, fontWeight: 700,
                color: bWins ? theme.success : theme.textDim,
              }}>
                {row.b}{bWins && ' ▶'}
              </span>
            </div>
          )
        })}
      </div>

      {unpaired > 0 && (
        <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 8, textAlign: 'center' }}>
          {unpaired} 个套件无法对比
        </div>
      )}

      {/* Verdict bar */}
      <VerdictBar winner={result.winner} reason={reason} />

      {/* Footer stats */}
      <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 12, textAlign: 'center' }}>
        {scanA.model}: {result.dimensionWins.A} 维度领先 · {scanB.model}: {result.dimensionWins.B} 维度领先
        {' · '}{result.dimensionWins.ties} 平手 · 共 {rows.length} 维度
      </div>
    </Panel>
  )
}

function ScoreColumn({ side, tie, winning, align }: {
  side: ScanSide
  tie: boolean
  winning: boolean
  align: 'left' | 'right'
}) {
  const scoreColor = tie ? theme.warning : winning ? theme.success : theme.textDim
  return (
    <div style={{ flex: 1, textAlign: align }}>
      <div style={{
        fontSize: 15, fontWeight: 700, color: theme.text, fontFamily: theme.monoFamily,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {side.model}
      </div>
      <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 4 }}>{side.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
        <span style={{ fontSize: 32, fontWeight: 700, fontFamily: theme.monoFamily, color: scoreColor }}>
          {side.overallScore}
        </span>
        {tie ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: theme.warning }}>TIE</span>
        ) : winning ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: theme.success }}>👑 Winner</span>
        ) : null}
      </div>
    </div>
  )
}

function VerdictBar({ winner, reason }: { winner: 'A' | 'B' | 'tie'; reason: string }) {
  const color = winner === 'tie' ? theme.warning : theme.success
  const justify = winner === 'A' ? 'flex-start' : winner === 'B' ? 'flex-end' : 'center'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: justify,
      gap: 10, marginTop: 16, padding: '12px 16px',
      background: theme.surfaceActive, borderRadius: theme.radius,
      borderLeft: winner === 'A' ? `3px solid ${color}` : undefined,
      borderRight: winner === 'B' ? `3px solid ${color}` : undefined,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: winner === 'tie' ? theme.warning : theme.text }}>
        {reason}
      </span>
    </div>
  )
}
