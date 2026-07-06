/**
 * Settings — app configuration + data export page.
 * Wraps SettingsPanel (which talks to /api/settings) and ExportCenter.
 */
import { theme } from '../theme'
import type { ScanReport } from '../types'
import { SettingsPanel } from '../components/SettingsPanel'
import { ExportCenter } from '../components/ExportCenter'

interface Props {
  version?: string
  report?: ScanReport | null
}

export function Settings({ version = '0.1.0', report }: Props) {
  return (
    <div style={{ animation: 'fadeIn 300ms ease', maxWidth: 640 }}>
      <div style={{
        background: theme.surface,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        padding: 28,
        marginBottom: 24,
      }}>
        <SettingsPanel version={version} />
      </div>

      {/* Export center — only if a report is loaded */}
      {report && (
        <div style={{ marginBottom: 24 }}>
          <ExportCenter report={report} />
        </div>
      )}

      {/* Quick reference card */}
      <div style={{
        background: theme.bg,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        padding: 20,
        fontSize: 12,
        color: theme.textDim,
        lineHeight: 1.8,
        maxWidth: 560,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: theme.primary,
          textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
        }}>
          配置文件位置
        </div>
        <code style={{ color: theme.text, fontFamily: theme.monoFamily }}>
          ~/.agent-redteam/config
        </code>
        <pre style={{
          marginTop: 8, padding: 12, background: theme.surface,
          borderRadius: theme.radiusSm, border: `1px solid ${theme.border}`,
          color: theme.textDim, fontSize: 11.5, lineHeight: 1.6,
          fontFamily: theme.monoFamily, overflowX: 'auto', margin: '8px 0 0 0',
        }}>{`api_key: sk-xxxxxxxxxxxxxxxx
model: glm-4-plus
base_url: https://api.openai.com/v1
workers: 4
max_tokens: 500`}</pre>
        <p style={{ marginTop: 10, fontSize: 11, color: theme.textFaint }}>
          API Key 仅从配置文件读取，永不在前端或任何 HTTP 响应中出现。
          上方表单保存的是扫描默认值与 UI 偏好（settings.json）。
        </p>
      </div>
    </div>
  )
}
