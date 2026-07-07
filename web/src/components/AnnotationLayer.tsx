/**
 * AnnotationLayer — analyst notes on a single sample ("this is a false
 * positive", "known issue, fixed in v1.3", "needs re-review"), persisted to
 * localStorage. Meant to be embedded inside DetailDrawer, not wrapped in a
 * Panel of its own.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { MonoTag } from './ui'

type AnnotationType = 'note' | 'false-positive' | 'fixed' | 'needs-review'

interface Annotation {
  sampleId: string
  type: AnnotationType
  text: string
  author: string
  createdAt: string
  updatedAt: string
}

interface AnnotationLayerProps {
  sampleId: string
  onChange?: (annotations: Annotation[]) => void
}

const STORAGE_KEY = 'agent-redteam:annotations'

const TYPE_META: Record<AnnotationType, { label: string; icon: string; color: string }> = {
  'note': { label: '备注', icon: '📝', color: theme.primary },
  'false-positive': { label: '误判', icon: '⚠️', color: theme.warning },
  'fixed': { label: '已修复', icon: '✓', color: theme.success },
  'needs-review': { label: '待复查', icon: '●', color: theme.danger },
}

function readStore(): Record<string, Annotation[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, Annotation[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // localStorage unavailable — caller keeps working from in-memory state
  }
}

export function loadAllAnnotations(): Record<string, Annotation[]> {
  return readStore()
}

export function loadAnnotations(sampleId: string): Annotation[] {
  return readStore()[sampleId] ?? []
}

export function saveAnnotation(sampleId: string, annotation: Annotation): void {
  const store = readStore()
  const existing = store[sampleId] ?? []
  const idx = existing.findIndex(a => a.createdAt === annotation.createdAt)
  if (idx >= 0) {
    existing[idx] = annotation
  } else {
    existing.push(annotation)
  }
  store[sampleId] = existing
  writeStore(store)
}

export function deleteAnnotation(sampleId: string, createdAt: string): void {
  const store = readStore()
  store[sampleId] = (store[sampleId] ?? []).filter(a => a.createdAt !== createdAt)
  writeStore(store)
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) return '刚刚'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}分钟前`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}小时前`
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}天前`
  return new Date(iso).toISOString().slice(0, 10)
}

const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: theme.bg,
  border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
  color: theme.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
  resize: 'vertical',
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', background: theme.bg,
  border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
  color: theme.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
}

export function AnnotationLayer({ sampleId, onChange }: AnnotationLayerProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>(() => loadAnnotations(sampleId))
  const [editing, setEditing] = useState<string | null>(null)
  const [formType, setFormType] = useState<AnnotationType>('note')
  const [formText, setFormText] = useState('')
  const [formAuthor, setFormAuthor] = useState('me')
  const [showForm, setShowForm] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)

  function refresh(next: Annotation[]) {
    setAnnotations(next)
    onChange?.(next)
  }

  function openAddForm() {
    setEditing(null)
    setFormType('note')
    setFormText('')
    setFormAuthor('me')
    setShowForm(true)
  }

  function openEditForm(a: Annotation) {
    setEditing(a.createdAt)
    setFormType(a.type)
    setFormText(a.text)
    setFormAuthor(a.author)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
  }

  function handleSave() {
    const trimmed = formText.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    const existing = editing ? annotations.find(a => a.createdAt === editing) : undefined
    const annotation: Annotation = {
      sampleId,
      type: formType,
      text: trimmed,
      author: formAuthor.trim() || 'me',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    saveAnnotation(sampleId, annotation)
    refresh(loadAnnotations(sampleId))
    closeForm()
  }

  function handleDelete(createdAt: string) {
    deleteAnnotation(sampleId, createdAt)
    refresh(loadAnnotations(sampleId))
  }

  const counts = annotations.reduce<Record<AnnotationType, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1
    return acc
  }, { note: 0, 'false-positive': 0, fixed: 0, 'needs-review': 0 })

  return (
    <div>
      <style>{`@keyframes annotationPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: theme.textDim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          标注
        </span>
        <span style={{ marginLeft: 6, fontSize: 11, color: theme.textFaint }}>{annotations.length}</span>
        <div style={{ flex: 1 }} />
        {!showForm && (
          <button
            onClick={openAddForm}
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600,
              background: theme.primary + '18', border: `1px solid ${theme.primary}`,
              borderRadius: theme.radiusSm, color: theme.primary, cursor: 'pointer',
            }}
          >
            + 添加标注
          </button>
        )}
      </div>

      {annotations.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {(Object.keys(TYPE_META) as AnnotationType[]).map(t => (
            counts[t] > 0 && (
              <span key={t} style={{ fontSize: 10, color: TYPE_META[t].color, fontFamily: theme.monoFamily }}>
                {counts[t]} {TYPE_META[t].label}
              </span>
            )
          ))}
        </div>
      )}

      {showForm && (
        <div style={{
          background: theme.surface, border: `1px solid ${theme.borderActive}`,
          borderRadius: theme.radius, padding: 12, marginBottom: 12,
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {(Object.keys(TYPE_META) as AnnotationType[]).map(t => {
              const meta = TYPE_META[t]
              const active = formType === t
              return (
                <button
                  key={t}
                  onClick={() => setFormType(t)}
                  style={{
                    padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap',
                    background: active ? meta.color + '18' : 'transparent',
                    border: `1px solid ${active ? meta.color : theme.border}`,
                    borderRadius: theme.radiusSm,
                    color: active ? meta.color : theme.textDim, cursor: 'pointer',
                    transition: theme.transition,
                  }}
                >
                  {meta.icon} {meta.label}
                </button>
              )
            })}
          </div>

          <textarea
            value={formText}
            onChange={e => setFormText(e.target.value)}
            rows={3}
            placeholder="记录你的分析判断..."
            style={{ ...textareaStyle, marginBottom: 8 }}
          />

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: theme.textFaint }}>标注者</span>
            <input
              value={formAuthor}
              onChange={e => setFormAuthor(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={!formText.trim()}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                background: formText.trim() ? theme.primary : theme.surfaceHover,
                border: 'none', borderRadius: theme.radiusSm,
                color: formText.trim() ? theme.bg : theme.textFaint,
                cursor: formText.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              保存
            </button>
            <button
              onClick={closeForm}
              style={{
                padding: '6px 14px', fontSize: 12, background: 'transparent',
                border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
                color: theme.textDim, cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {annotations.length === 0 && !showForm && (
        <div style={{ padding: '16px 0', textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
          暂无标注，点击"添加标注"记录分析
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {annotations.map(a => {
          const meta = TYPE_META[a.type]
          const isFixed = a.type === 'fixed'
          const isHover = hoverId === a.createdAt
          return (
            <div
              key={a.createdAt}
              onMouseEnter={() => setHoverId(a.createdAt)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                background: theme.bg, borderRadius: theme.radiusSm,
                borderLeft: `3px solid ${meta.color}`,
                border: `1px solid ${theme.border}`,
                borderLeftWidth: 3, borderLeftColor: meta.color,
                padding: '8px 10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <MonoTag tone="dim">{meta.icon} {meta.label}</MonoTag>
                {a.type === 'needs-review' && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: theme.danger,
                    animation: 'annotationPulse 1.4s infinite',
                  }} />
                )}
                <span style={{ fontSize: 11, color: theme.textFaint }}>{a.author}</span>
                <span style={{ fontSize: 11, color: theme.textFaint }}>· {formatRelativeTime(a.updatedAt)}</span>
                <div style={{ flex: 1 }} />
                {isHover && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => openEditForm(a)}
                      style={{ background: 'transparent', border: 'none', color: theme.primary, fontSize: 11, cursor: 'pointer' }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(a.createdAt)}
                      style={{ background: 'transparent', border: 'none', color: theme.danger, fontSize: 11, cursor: 'pointer' }}
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
              <div style={{
                fontSize: 12.5, color: theme.text, lineHeight: 1.5,
                textDecoration: isFixed ? 'line-through' : 'none',
                opacity: isFixed ? 0.7 : 1,
              }}>
                {a.text}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
