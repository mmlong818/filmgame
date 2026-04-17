export type AIProvider = 'claude_cli' | 'anthropic' | 'openai' | 'gemini' | 'custom'

export interface AIConfig {
  provider: AIProvider
  apiKey?: string
  model?: string
  baseUrl?: string
}

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  claude_cli: '',
  anthropic: 'claude-opus-4-5',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  custom: 'llama3',
}

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  claude_cli: 'Claude 订阅模式（Claude CLI）',
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  gemini: 'Google Gemini API',
  custom: '自定义端点（OpenAI 兼容）',
}

const SETTINGS_KEY = 'filmgame:ai-settings'

export function loadAIConfig(): AIConfig {
  if (typeof window === 'undefined') return { provider: 'claude_cli' }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : { provider: 'claude_cli' }
  } catch { return { provider: 'claude_cli' } }
}

export function saveAIConfig(config: AIConfig): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(config))
}
