/**
 * ScanScheduler — configure recurring scan schedules. This is front-end
 * config-only: no real timer runs here. The user copies the generated cron
 * command into their own system crontab to actually trigger scans.
 */
import { useState } from 'react'
import { theme } from '../theme'
import { Panel, Field } from './ui'

export interface ScheduleConfig {
  name: string
  frequency: 'daily' | 'weekly' | 'custom'
  dayOfWeek?: number
  hour: number
  minute: number
  model: string
  suites: string[]
  limit: number
  /** Raw 5-field cron expression, only used/required when frequency === 'custom'. */
  cron?: string
}

interface ScanSchedulerProps {
  defaultModel: string
  availableSuites: string[]
}

type StoredSchedule = ScheduleConfig & { enabled: boolean }

const STORAGE_KEY = 'agent-redteam:schedules'
const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export function loadSchedules(): StoredSchedule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(schedules: StoredSchedule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules))
}

export function saveSchedule(config: ScheduleConfig): void {
  const schedules = loadSchedules().filter(s => s.name !== config.name)
  schedules.push({ ...config, enabled: true })
  persist(schedules)
}

export function deleteSchedule(name: string): void {
  persist(loadSchedules().filter(s => s.name !== name))
}

export function toggleSchedule(name: string): void {
  persist(loadSchedules().map(s => s.name === name ? { ...s, enabled: !s.enabled } : s))
}

export function toCronExpression(config: ScheduleConfig): string {
  const suites = config.suites.join(',')
  const action = `agent-redteam scan --model ${config.model} --suites ${suites} --limit ${config.limit} >> /tmp/redteam.log 2>&1`

  if (config.frequency === 'daily') {
    return `${config.minute} ${config.hour} * * * ${action}`
  }
  if (config.frequency === 'weekly') {
    return `${config.minute} ${config.hour} * * ${config.dayOfWeek ?? 0} ${action}`
  }
  return `${config.cron ?? ''} ${action}`
}

function frequencySummary(s: StoredSchedule): string {
  const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
  if (s.frequency === 'daily') return `每天 ${time}`
  if (s.frequency === 'weekly') return `每周${DAY_LABELS[s.dayOfWeek ?? 0]} ${time}`
  return '自定义 cron'
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', background: theme.bg,
  border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
  color: theme.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
}

const segButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px', fontSize: 12, fontWeight: 600,
  background: active ? theme.primary + '18' : 'transparent',
  border: `1px solid ${active ? theme.primary : theme.border}`,
  borderRadius: theme.radiusSm,
  color: active ? theme.primary : theme.textDim,
  cursor: 'pointer', transition: theme.transition,
})

export function ScanScheduler({ defaultModel, availableSuites }: ScanSchedulerProps) {
  const [schedules, setSchedules] = useState<StoredSchedule[]>(() => loadSchedules())
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState<ScheduleConfig['frequency']>('daily')
  const [dayOfWeek, setDayOfWeek] = useState<number | undefined>(undefined)
  const [cronExpr, setCronExpr] = useState('')
  const [hour, setHour] = useState(2)
  const [minute, setMinute] = useState(0)
  const [model, setModel] = useState(defaultModel)
  const [suites, setSuites] = useState<string[]>([])
  const [limit, setLimit] = useState(30)
  const [copiedName, setCopiedName] = useState<string | null>(null)

  const weeklyMissingDay = frequency === 'weekly' && dayOfWeek === undefined
  const customMissingCron = frequency === 'custom' && !cronExpr.trim()
  const canSave = name.trim().length > 0 && !weeklyMissingDay && !customMissingCron

  function refresh() {
    setSchedules(loadSchedules())
  }

  function resetForm() {
    setName('')
    setFrequency('daily')
    setDayOfWeek(undefined)
    setCronExpr('')
    setHour(2)
    setMinute(0)
    setModel(defaultModel)
    setSuites([])
    setLimit(30)
  }

  function handleSave() {
    if (!canSave) return
    const config: ScheduleConfig = {
      name: name.trim(),
      frequency,
      dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
      hour,
      minute,
      model: model.trim() || defaultModel,
      suites,
      limit,
      cron: frequency === 'custom' ? cronExpr.trim() : undefined,
    }
    saveSchedule(config)
    refresh()
    resetForm()
  }

  function copyCron(schedule: StoredSchedule) {
    const cron = toCronExpression(schedule)
    navigator.clipboard?.writeText(cron)
    setCopiedName(schedule.name)
    setTimeout(() => setCopiedName(null), 2000)
  }

  function toggleAllSuites() {
    setSuites(suites.length === availableSuites.length ? [] : [...availableSuites])
  }

  function toggleSuite(suite: string) {
    setSuites(s => s.includes(suite) ? s.filter(x => x !== suite) : [...s, suite])
  }

  return (
    <Panel title="定时扫描调度">
      <Field label="调度名">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="如：每日全量扫描"
          style={{ ...inputStyle, width: '100%' }}
        />
      </Field>

      <Field label="频率">
        <div style={{ display: 'flex', gap: 8 }}>
          {(['daily', 'weekly', 'custom'] as const).map(f => (
            <button key={f} onClick={() => setFrequency(f)} style={segButtonStyle(frequency === f)}>
              {f === 'daily' ? '每天' : f === 'weekly' ? '每周' : '自定义'}
            </button>
          ))}
        </div>
      </Field>

      {frequency === 'weekly' && (
        <Field label="星期" hint={weeklyMissingDay ? '请选择星期' : undefined}>
          <div style={{ display: 'flex', gap: 6 }}>
            {DAY_LABELS.map((label, idx) => (
              <button
                key={idx}
                onClick={() => setDayOfWeek(idx)}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: dayOfWeek === idx ? theme.primary + '18' : theme.bg,
                  border: `1px solid ${dayOfWeek === idx ? theme.primary : theme.border}`,
                  color: dayOfWeek === idx ? theme.primary : theme.textDim,
                  fontSize: 11, cursor: 'pointer', transition: theme.transition,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {frequency === 'custom' && (
        <Field label="Cron 表达式" hint={customMissingCron ? '请输入 cron 表达式' : '分 时 日 月 星期'}>
          <input
            value={cronExpr}
            onChange={e => setCronExpr(e.target.value)}
            placeholder="0 2 * * *"
            style={{ ...inputStyle, width: '100%', fontFamily: theme.monoFamily }}
          />
        </Field>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
        <Field label="时">
          <select value={hour} onChange={e => setHour(Number(e.target.value))} style={inputStyle}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
            ))}
          </select>
        </Field>
        <Field label="分">
          <select value={minute} onChange={e => setMinute(Number(e.target.value))} style={inputStyle}>
            {[0, 15, 30, 45].map(m => (
              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="模型">
        <input
          value={model}
          onChange={e => setModel(e.target.value)}
          style={{ ...inputStyle, width: '100%' }}
        />
      </Field>

      <Field label="套件">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={toggleAllSuites} style={segButtonStyle(false)}>
            {suites.length === availableSuites.length ? '清空' : '全选'}
          </button>
        </div>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 120,
          overflowY: 'auto', padding: 8, background: theme.bg,
          border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
        }}>
          {availableSuites.map(suite => (
            <label key={suite} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: theme.textDim }}>
              <input
                type="checkbox"
                checked={suites.includes(suite)}
                onChange={() => toggleSuite(suite)}
              />
              {suite}
            </label>
          ))}
        </div>
      </Field>

      <Field label="样本上限">
        <input
          type="number"
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          style={{ ...inputStyle, width: 100 }}
        />
      </Field>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={!canSave}
          style={{
            padding: '8px 16px', fontSize: 12, fontWeight: 600,
            background: canSave ? theme.primary : theme.surfaceHover,
            border: 'none', borderRadius: theme.radiusSm,
            color: canSave ? theme.bg : theme.textFaint,
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          保存
        </button>
        <button
          onClick={resetForm}
          style={{
            padding: '8px 16px', fontSize: 12,
            background: 'transparent', border: `1px solid ${theme.border}`,
            borderRadius: theme.radiusSm, color: theme.textDim, cursor: 'pointer',
          }}
        >
          取消
        </button>
      </div>

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {schedules.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: theme.textFaint, fontSize: 12 }}>
            还没有定时扫描任务
          </div>
        ) : (
          schedules.map(s => (
            <ScheduleRow
              key={s.name}
              schedule={s}
              copied={copiedName === s.name}
              onCopy={() => copyCron(s)}
              onToggle={() => { toggleSchedule(s.name); refresh() }}
              onDelete={() => { deleteSchedule(s.name); refresh() }}
            />
          ))
        )}
      </div>

      <div style={{
        marginTop: 20, padding: 12, fontSize: 11.5, color: theme.textDim, lineHeight: 1.7,
        background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
      }}>
        调度配置保存在浏览器本地。将上述 cron 命令添加到系统 crontab 即可启用定时扫描：<br />
        <code style={{ fontFamily: theme.monoFamily, color: theme.primary }}>crontab -e</code> → 粘贴命令 → <code style={{ fontFamily: theme.monoFamily, color: theme.primary }}>:wq</code><br />
        每次扫描结果会出现在 History 页。
      </div>
    </Panel>
  )
}

function ScheduleRow({ schedule, copied, onCopy, onToggle, onDelete }: {
  schedule: StoredSchedule
  copied: boolean
  onCopy: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 10px', borderRadius: theme.radiusSm,
        background: hover ? theme.surfaceHover : 'transparent',
        transition: theme.transition,
      }}
    >
      <div style={{ minWidth: 140 }}>
        <div style={{ fontSize: 12.5, color: theme.text, fontWeight: 600 }}>{schedule.name}</div>
        <div style={{ fontSize: 11, color: theme.textFaint }}>{frequencySummary(schedule)}</div>
      </div>
      <button
        onClick={onCopy}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: theme.monoFamily, fontSize: 11, color: theme.textDim, padding: '4px 8px',
        }}
        title="点击复制"
      >
        {copied ? '已复制 ✓' : toCronExpression(schedule)}
      </button>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: theme.textDim }}>
        <input type="checkbox" checked={schedule.enabled} onChange={onToggle} />
        启用
      </label>
      <button
        onClick={onDelete}
        style={{
          background: 'transparent', border: `1px solid ${theme.border}`,
          borderRadius: theme.radiusSm, color: theme.danger, fontSize: 11,
          padding: '4px 8px', cursor: 'pointer',
        }}
      >
        ✕
      </button>
    </div>
  )
}
