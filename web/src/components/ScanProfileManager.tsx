/**
 * ScanProfileManager — full scan config templates (name/description/tags on top
 * of target/model/suites/workers/limit), shareable across a team as JSON files.
 * One level above ScanPreset, which only snapshots the current form.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel, MonoTag } from './ui'

export interface ScanProfile {
  id: string                // uuid 或 name slug
  name: string               // 如 "生产环境全量扫描"
  description: string        // 一句话描述
  tags: string[]             // 如 ['production', 'critical', 'weekly']
  model: string
  target: 'openai' | 'claude' | 'zai' | 'local'
  suites: string[]
  workers: number
  limit: number
  createdAt: string          // ISO
}

interface ScanProfileManagerProps {
  /** 应用某模板到扫描表单 */
  onApply: (profile: ScanProfile) => void
  /** 可用套件列表（用于显示模板里选了哪些） */
  availableSuites: string[]
}

const STORAGE_KEY = 'agent-redteam:scan-profiles'
const TARGETS: ScanProfile['target'][] = ['openai', 'claude', 'zai', 'local']

export function loadProfiles(): ScanProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(profiles: ScanProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

export function saveProfile(profile: ScanProfile): void {
  // Same name overwrites the existing entry.
  const profiles = loadProfiles().filter(p => p.name !== profile.name)
  profiles.push(profile)
  persist(profiles)
}

export function deleteProfile(id: string): void {
  persist(loadProfiles().filter(p => p.id !== id))
}

export function exportProfiles(profiles: ScanProfile[]): string {
  return JSON.stringify(profiles, null, 2)
}

export function importProfiles(json: string): ScanProfile[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('无效的模板文件')
  }
  const list = Array.isArray(parsed) ? parsed : [parsed]
  return list.map(item => {
    if (
      !item || typeof item !== 'object' ||
      typeof (item as Record<string, unknown>).name !== 'string' ||
      typeof (item as Record<string, unknown>).model !== 'string' ||
      typeof (item as Record<string, unknown>).target !== 'string' ||
      !Array.isArray((item as Record<string, unknown>).suites)
    ) {
      throw new Error('无效的模板文件')
    }
    const raw = item as Partial<ScanProfile>
    return {
      id: raw.id || slugify(raw.name!),
      name: raw.name!,
      description: raw.description || '',
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      model: raw.model!,
      target: raw.target as ScanProfile['target'],
      suites: raw.suites as string[],
      workers: typeof raw.workers === 'number' ? raw.workers : 4,
      limit: typeof raw.limit === 'number' ? raw.limit : 30,
      createdAt: raw.createdAt || new Date().toISOString(),
    }
  })
}

function slugify(name: string): string {
  return `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`
}

interface DraftForm {
  id?: string
  name: string
  description: string
  tags: string
  model: string
  target: ScanProfile['target']
  workers: number
  limit: number
  suites: string[]
}

const EMPTY_DRAFT: DraftForm = { name: '', description: '', tags: '', model: '', target: 'openai', workers: 4, limit: 30, suites: [] }

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', background: theme.bg, border: `1px solid ${theme.border}`,
  borderRadius: theme.radiusSm, color: theme.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
}

export function ScanProfileManager({ onApply, availableSuites }: ScanProfileManagerProps) {
  const [profiles, setProfiles] = useState<ScanProfile[]>(() => loadProfiles())
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftForm>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)

  function refresh() {
    setProfiles(loadProfiles())
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? profiles.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q)))
    : profiles

  function startCreate() {
    setEditingId('__new__')
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  function startEdit(p: ScanProfile) {
    setEditingId(p.id)
    setDraft({ id: p.id, name: p.name, description: p.description, tags: p.tags.join(', '), model: p.model, target: p.target, workers: p.workers, limit: p.limit, suites: p.suites })
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  function saveDraft() {
    if (!draft.name.trim()) { setError('模板名称必填'); return }
    const profile: ScanProfile = {
      id: draft.id || slugify(draft.name),
      name: draft.name.trim(),
      description: draft.description.trim(),
      tags: draft.tags.split(',').map(t => t.trim()).filter(Boolean),
      model: draft.model.trim(),
      target: draft.target,
      suites: draft.suites,
      workers: draft.workers,
      limit: draft.limit,
      createdAt: new Date().toISOString(),
    }
    saveProfile(profile)
    refresh()
    cancelEdit()
  }

  function toggleDraftSuite(suite: string) {
    setDraft(d => ({ ...d, suites: d.suites.includes(suite) ? d.suites.filter(s => s !== suite) : [...d.suites, suite] }))
  }

  function handleDelete(id: string) {
    deleteProfile(id)
    refresh()
    setConfirmDeleteId(null)
  }

  function copyJson(p: ScanProfile) {
    navigator.clipboard?.writeText(JSON.stringify(p, null, 2))
    setCopiedId(p.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function downloadJson(filename: string, content: string) {
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportOne(p: ScanProfile) {
    downloadJson(`${p.id}.json`, exportProfiles([p]))
  }

  function exportAll() {
    downloadJson('scan-profiles.json', exportProfiles(profiles))
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = importProfiles(String(reader.result))
        for (const p of imported) saveProfile(p)
        refresh()
        setError(null)
      } catch {
        setError('无效的模板文件')
      }
    }
    reader.readAsText(file)
    setFileInputKey(k => k + 1) // reset input so re-selecting the same file re-fires onChange
  }

  return (
    <Panel title="扫描模板管理" subtitle="保存、共享、导入团队扫描标准">
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="按名称 / 描述 / 标签搜索…"
          style={{ ...inputStyle, flex: 1, minWidth: 180 }}
        />
        <button onClick={startCreate} style={btnStyle(theme.primary, true)}>+ 新建模板</button>
        <label style={{ ...btnStyle(theme.border, false), cursor: 'pointer' }}>
          导入 JSON
          <input key={fileInputKey} type="file" accept="application/json" onChange={handleImportFile} style={{ display: 'none' }} />
        </label>
        <button onClick={exportAll} disabled={profiles.length === 0} style={btnStyle(theme.border, false)}>导出全部</button>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: theme.danger + '15', border: `1px solid ${theme.danger}40`, borderRadius: theme.radiusSm, fontSize: 12, color: theme.danger }}>
          {error}
        </div>
      )}

      {/* New profile inline form */}
      {editingId === '__new__' && (
        <ProfileForm draft={draft} setDraft={setDraft} availableSuites={availableSuites} onToggleSuite={toggleDraftSuite} onSave={saveDraft} onCancel={cancelEdit} />
      )}

      {/* Profile list */}
      {profiles.length === 0 ? (
        <Hint text="还没有保存的模板，点击“新建”创建" />
      ) : filtered.length === 0 ? (
        <Hint text="未匹配到模板" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(p => (
            <div key={p.id}>
              <ProfileRow
                profile={p}
                copied={copiedId === p.id}
                confirmDelete={confirmDeleteId === p.id}
                onApply={() => onApply(p)}
                onEdit={() => startEdit(p)}
                onCopy={() => copyJson(p)}
                onExport={() => exportOne(p)}
                onDeleteRequest={() => setConfirmDeleteId(p.id)}
                onDeleteCancel={() => setConfirmDeleteId(null)}
                onDeleteConfirm={() => handleDelete(p.id)}
              />
              {editingId === p.id && (
                <ProfileForm draft={draft} setDraft={setDraft} availableSuites={availableSuites} onToggleSuite={toggleDraftSuite} onSave={saveDraft} onCancel={cancelEdit} />
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function btnStyle(color: string, solid: boolean): React.CSSProperties {
  return {
    padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: solid ? color + '18' : 'transparent',
    border: `1px solid ${solid ? color : theme.border}`,
    borderRadius: theme.radiusSm, color: solid ? color : theme.textDim,
    transition: theme.transition, whiteSpace: 'nowrap',
  }
}

function Hint({ text }: { text: string }) {
  return <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: theme.textFaint }}>{text}</div>
}

function ProfileRow({ profile, copied, confirmDelete, onApply, onEdit, onCopy, onExport, onDeleteRequest, onDeleteCancel, onDeleteConfirm }: {
  profile: ScanProfile
  copied: boolean
  confirmDelete: boolean
  onApply: () => void
  onEdit: () => void
  onCopy: () => void
  onExport: () => void
  onDeleteRequest: () => void
  onDeleteCancel: () => void
  onDeleteConfirm: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px',
        borderRadius: theme.radius, border: `1px solid ${theme.border}`,
        background: hover ? theme.surfaceHover : 'transparent', transition: theme.transition,
      }}
    >
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{profile.name}</div>
        {profile.description && <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{profile.description}</div>}
        {profile.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            {profile.tags.map(t => <MonoTag key={t} tone="dim">{t}</MonoTag>)}
          </div>
        )}
      </div>
      <div style={{ flex: '1 1 220px', fontSize: 11.5, color: theme.textFaint, fontFamily: theme.monoFamily }}>
        {profile.model} · {profile.target} · {profile.suites.length} 套件 · w{profile.workers} · limit{profile.limit}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={onApply} style={btnStyle(theme.primary, true)}>应用</button>
        <button onClick={onEdit} style={btnStyle(theme.border, false)}>编辑</button>
        <button onClick={onCopy} style={btnStyle(theme.border, false)}>{copied ? '已复制 ✓' : '复制 JSON'}</button>
        <button onClick={onExport} style={btnStyle(theme.border, false)}>导出</button>
        {confirmDelete ? (
          <>
            <button onClick={onDeleteConfirm} style={btnStyle(theme.danger, true)}>确认删除</button>
            <button onClick={onDeleteCancel} style={btnStyle(theme.border, false)}>取消</button>
          </>
        ) : (
          <button onClick={onDeleteRequest} style={{ ...btnStyle(theme.danger, false), color: theme.danger }}>✕</button>
        )}
      </div>
    </div>
  )
}

function ProfileForm({ draft, setDraft, availableSuites, onToggleSuite, onSave, onCancel }: {
  draft: DraftForm
  setDraft: React.Dispatch<React.SetStateAction<DraftForm>>
  availableSuites: string[]
  onToggleSuite: (suite: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ marginTop: 8, padding: 14, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radius }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <FormField label="名称 *">
          <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={{ ...inputStyle, width: 200 }} />
        </FormField>
        <FormField label="描述">
          <input value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} style={{ ...inputStyle, width: 240 }} />
        </FormField>
        <FormField label="标签（逗号分隔）">
          <input value={draft.tags} onChange={e => setDraft(d => ({ ...d, tags: e.target.value }))} placeholder="production, weekly" style={{ ...inputStyle, width: 200 }} />
        </FormField>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <FormField label="模型">
          <input value={draft.model} onChange={e => setDraft(d => ({ ...d, model: e.target.value }))} style={{ ...inputStyle, width: 180 }} />
        </FormField>
        <FormField label="Target">
          <div style={{ display: 'flex', gap: 4 }}>
            {TARGETS.map(t => (
              <button
                key={t}
                onClick={() => setDraft(d => ({ ...d, target: t }))}
                style={btnStyle(theme.primary, draft.target === t)}
              >
                {t}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Workers">
          <input type="number" value={draft.workers} onChange={e => setDraft(d => ({ ...d, workers: Number(e.target.value) }))} style={{ ...inputStyle, width: 80 }} />
        </FormField>
        <FormField label="Limit">
          <input type="number" value={draft.limit} onChange={e => setDraft(d => ({ ...d, limit: Number(e.target.value) }))} style={{ ...inputStyle, width: 80 }} />
        </FormField>
      </div>
      <FormField label="套件">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 120, overflowY: 'auto', padding: 8, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm }}>
          {availableSuites.map(suite => (
            <label key={suite} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: theme.textDim }}>
              <input type="checkbox" checked={draft.suites.includes(suite)} onChange={() => onToggleSuite(suite)} />
              {suite}
            </label>
          ))}
        </div>
      </FormField>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onSave} style={btnStyle(theme.success, true)}>保存</button>
        <button onClick={onCancel} style={btnStyle(theme.border, false)}>取消</button>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: theme.textFaint, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      {children}
    </div>
  )
}
