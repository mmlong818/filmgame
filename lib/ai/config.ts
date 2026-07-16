export type AIProvider = 'claude_cli' | 'anthropic' | 'openai' | 'gemini' | 'custom'

export interface AIConfig {
  provider: AIProvider
  apiKey?: string
  model?: string
  baseUrl?: string
  /** 快速模式使用的模型 ID；留空按 provider 给默认（见 lib/ai/lc-providers.ts resolveModel） */
  modelFast?: string
  /** 思考模式使用的模型 ID；留空则沿用 model */
  modelThinking?: string
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
  // apiKey 不落 localStorage（BYOK 密钥仅经 POST /api/settings 上行，服务端加密存 DB）；
  // 本地仅保留非敏感的 provider/model/baseUrl/modelFast/modelThinking，用于下次打开设置页时的默认选中项。
  const { provider, model, baseUrl, modelFast, modelThinking } = config
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ provider, model, baseUrl, modelFast, modelThinking }))
}
