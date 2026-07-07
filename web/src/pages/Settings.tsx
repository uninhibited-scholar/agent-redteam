/**
 * Settings — app configuration + data export page.
 * Wraps SettingsPanel (which talks to /api/settings) and ExportCenter.
 */
import { theme } from '../theme'
import { useState } from 'react'
import type { ScanReport } from '../types'
import { SettingsPanel } from '../components/SettingsPanel'
import { ExportCenter } from '../components/ExportCenter'
import { ScanScheduler } from '../components/ScanScheduler'
import { ScanProfileManager } from '../components/ScanProfileManager'
import { AlertRules } from '../components/AlertRules'
import { ReportBuilder } from '../components/ReportBuilder'
import { KeyboardShortcutManager } from '../components/KeyboardShortcutManager'
import { ThemeCustomizer, PRESET_THEMES, type CustomTheme, loadCustomTheme, saveCustomTheme } from '../components/ThemeCustomizer'
import {
  AccessibilityPanel,
  type A11ySettings,
  loadA11y,
  saveA11y,
  DEFAULT_A11Y,
} from '../components/AccessibilityPanel'

interface Props {
  version?: string
  report?: ScanReport | null
}

export function Settings({ version = '0.1.0', report }: Props) {
  const [a11y, setA11y] = useState<A11ySettings>(() => {
    try { return loadA11y() } catch { return DEFAULT_A11Y }
  })
  const [customTheme, setCustomTheme] = useState<CustomTheme>(() => {
    try { return loadCustomTheme() ?? PRESET_THEMES[0].theme } catch { return PRESET_THEMES[0].theme }
  })
  return (
    <div style={{ animation: 'fadeIn 300ms ease', maxWidth: 640 }}>
      {/* Alert rules — CI/CD release gate */}
      {report && (
        <div style={{ marginBottom: 24 }}>
          <AlertRules
            report={{
              overallScore: report.overall_score ?? 0,
              suites: report.suites ?? [],
              samples: report.samples ?? [],
            }}
          />
        </div>
      )}

      {/* Custom report builder */}
      {report && (
        <div style={{ marginBottom: 24 }}>
          <ReportBuilder report={report} />
        </div>
      )}

      {/* Theme customizer */}
      <div style={{ marginBottom: 24 }}>
        <ThemeCustomizer
          theme={customTheme}
          onChange={(t) => { setCustomTheme(t); saveCustomTheme(t) }}
        />
      </div>

      {/* Keyboard shortcut manager */}
      <div style={{ marginBottom: 24 }}>
        <KeyboardShortcutManager
          defaults={[
            { action: 'nav.dashboard', label: 'Dashboard', keys: '1', group: '导航' },
            { action: 'nav.overview', label: 'Overview', keys: '2', group: '导航' },
            { action: 'nav.metrics', label: 'Metrics', keys: '3', group: '导航' },
            { action: 'nav.findings', label: 'Findings', keys: '4', group: '导航' },
            { action: 'nav.scan', label: 'Scan', keys: '5', group: '导航' },
            { action: 'palette', label: '命令面板', keys: 'meta+k', group: '操作', readonly: true },
            { action: 'help', label: '帮助', keys: 'shift+/', group: '操作' },
            { action: 'refresh', label: '刷新报告', keys: 'r', group: '操作' },
          ]}
        />
      </div>
      <div style={{
        background: theme.surface,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        padding: 28,
        marginBottom: 24,
      }}>
        <SettingsPanel version={version} />
      </div>

      {/* Accessibility settings */}
      <div style={{ marginBottom: 24 }}>
        <AccessibilityPanel
          settings={a11y}
          onChange={(s) => { setA11y(s); saveA11y(s) }}
        />
      </div>

      {/* Export center — only if a report is loaded */}
      {report && (
        <div style={{ marginBottom: 24 }}>
          <ExportCenter report={report} />
        </div>
      )}

      {/* Scan profile manager — team-level config templates */}
      {report && (
        <div style={{ marginBottom: 24 }}>
          <ScanProfileManager
            onApply={() => {}}
            availableSuites={(report.suites ?? []).map(s => s.name)}
          />
        </div>
      )}

      {/* Recurring scan schedules — front-end config only, drives an external crontab */}
      <div style={{ marginBottom: 24 }}>
        <ScanScheduler
          defaultModel={report?.target_model ?? ''}
          availableSuites={(report?.suites ?? []).map(s => s.name)}
        />
      </div>

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
