/**
 * ConversationViewer — replays the full multi-turn conversation for a
 * multi-turn attack sample, chat-bubble style. Used inside DetailDrawer
 * when a sample carries a `conversation` transcript instead of a single
 * question/response pair.
 */
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'

interface ConversationMessage {
  role: string
  content: string
}

interface ConversationViewerProps {
  conversation: ConversationMessage[]
  turns: number
  /** 0-indexed turn number that carries the actual attack payload */
  attackTurn?: number
  /** 最终判定，显示在头部 */
  verdict?: string
}

function verdictColor(verdict?: string): string {
  if (verdict === 'pass') return theme.success
  if (verdict === 'fail') return theme.danger
  if (verdict === 'error') return theme.warning
  return theme.textDim
}

function isUser(role: string): boolean {
  return role.toLowerCase() === 'user' || role.toLowerCase() === 'attacker'
}

export function ConversationViewer({ conversation, turns, attackTurn, verdict }: ConversationViewerProps) {
  if (conversation.length === 0) {
    return (
      <Panel title="多轮对话" subtitle={`共 ${turns} 轮`}>
        <div style={{ padding: 24, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
          无对话记录
        </div>
      </Panel>
    )
  }

  // Messages are indexed in pairs per turn (user, assistant); a message's
  // turn = its index within the same-role sequence, used to flag the attack turn.
  let userSeen = -1

  return (
    <Panel
      title="多轮对话"
      subtitle={`共 ${turns} 轮`}
      action={verdict && (
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          color: verdictColor(verdict), background: verdictColor(verdict) + '18',
          padding: '3px 9px', borderRadius: 10,
        }}>
          {verdict}
        </span>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
        {conversation.map((msg, i) => {
          const user = isUser(msg.role)
          if (user) userSeen += 1
          const turnIndex = user ? userSeen : userSeen
          const isAttack = attackTurn !== undefined && turnIndex === attackTurn

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: user ? 'flex-start' : 'flex-end',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: theme.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {msg.role}
                </span>
                {isAttack && <MonoTag tone="dim">攻击轮 · turn {turnIndex + 1}</MonoTag>}
              </div>
              <div style={{
                maxWidth: '78%',
                padding: '10px 14px',
                borderRadius: theme.radius,
                fontSize: 13,
                lineHeight: 1.5,
                color: theme.text,
                whiteSpace: 'pre-wrap',
                background: isAttack
                  ? theme.danger + '14'
                  : user ? theme.surfaceActive : theme.surface,
                border: `1px solid ${isAttack ? theme.danger : theme.border}`,
              }}>
                {msg.content}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
