// 预览播放页专用主题变量。
// 亮色 = 编剧房间纸面语言，暗色（影院模式）= 深色沉浸放映厅。
// 页面内一律通过 --pv-* 变量取色，禁止再依赖会被 globals.css 覆写的 Tailwind 字面色类。

export type PvTheme = 'light' | 'dark'

export const PV_VARS: Record<PvTheme, Record<string, string>> = {
  light: {
    '--pv-bg': '#e8ddc2',
    '--pv-panel': '#fdfaf1',
    '--pv-panel-alt': '#f6efdd',
    '--pv-line': '#d9caa4',
    '--pv-line-soft': '#e8ddc4',
    '--pv-text': '#33291c',
    '--pv-text-soft': '#5c5140',
    '--pv-dim': '#8f8368',
    '--pv-accent': '#c23a2b',
    '--pv-accent-deep': '#9e2c20',
    '--pv-accent-soft': 'rgba(194,58,43,0.09)',
    '--pv-choice-hover': '#f6efdd',
    '--pv-danger': '#c23a2b',
    '--pv-danger-soft': 'rgba(194,58,43,0.08)',
    '--pv-success': '#2c4a68',
    '--pv-success-soft': 'rgba(44,74,104,0.08)',
    '--pv-highlight': '#8a5a24',
    '--pv-highlight-soft': 'rgba(138,90,36,0.1)',
    '--pv-shadow': '0 1px 3px rgba(80,60,30,0.18)',
    '--pv-shadow-lift': '0 3px 9px rgba(80,60,30,0.26)',
  },
  dark: {
    '--pv-bg': '#0a0a0f',
    '--pv-panel': '#141419',
    '--pv-panel-alt': '#18181e',
    '--pv-line': 'rgba(255,255,255,0.09)',
    '--pv-line-soft': 'rgba(255,255,255,0.05)',
    '--pv-text': '#f2f0ea',
    '--pv-text-soft': '#c7c2b6',
    '--pv-dim': '#8a8578',
    '--pv-accent': '#e8c97a',
    '--pv-accent-deep': '#c9a84c',
    '--pv-accent-soft': 'rgba(232,201,122,0.12)',
    '--pv-choice-hover': '#1c1c22',
    '--pv-danger': '#e0685f',
    '--pv-danger-soft': 'rgba(224,104,95,0.12)',
    '--pv-success': '#6fa3c9',
    '--pv-success-soft': 'rgba(111,163,201,0.12)',
    '--pv-highlight': '#d9a24a',
    '--pv-highlight-soft': 'rgba(217,162,74,0.14)',
    '--pv-shadow': '0 1px 4px rgba(0,0,0,0.5)',
    '--pv-shadow-lift': '0 4px 14px rgba(0,0,0,0.6)',
  },
}

export type EndingKind = 'good' | 'bad' | 'neutral' | 'secret'

export const ENDING_ACCENTS: Record<EndingKind, { hex: string; icon: string; label: string; pulse: boolean }> = {
  good: { hex: '#c9a84c', icon: '🌅', label: '完美结局', pulse: true },
  bad: { hex: '#8f8368', icon: '🌑', label: '悲剧结局', pulse: false },
  neutral: { hex: '#5c8a9e', icon: '🎭', label: '中性结局', pulse: false },
  secret: { hex: '#8a6bb0', icon: '🔮', label: '隐藏结局', pulse: true },
}
