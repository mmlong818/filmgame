import type { AIConfig } from './config'
import { callClaudeWithRetry, extractJson, isFallback, RETRY_SUFFIX } from './claude'

async function callOpenAICompat(prompt: string, config: AIConfig, timeoutMs: number): Promise<string> {
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1'
  const model = config.model || 'gpt-4o'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  } finally {
    clearTimeout(timer)
  }
}

async function callAnthropicAPI(prompt: string, config: AIConfig, timeoutMs: number): Promise<string> {
  const model = config.model || 'claude-opus-4-5'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  } finally {
    clearTimeout(timer)
  }
}

async function callGeminiAPI(prompt: string, config: AIConfig, timeoutMs: number): Promise<string> {
  const model = config.model || 'gemini-2.0-flash'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  } finally {
    clearTimeout(timer)
  }
}

export async function callProvider(prompt: string, config: AIConfig, timeoutMs: number): Promise<{ raw: string; json: unknown }> {
  if (config.provider === 'claude_cli') {
    return callClaudeWithRetry(prompt, timeoutMs)
  }

  async function attempt(p: string): Promise<string> {
    switch (config.provider) {
      case 'anthropic':
        return callAnthropicAPI(p, config, timeoutMs)
      case 'openai':
        return callOpenAICompat(p, { ...config, baseUrl: 'https://api.openai.com/v1' }, timeoutMs)
      case 'gemini':
        return callGeminiAPI(p, config, timeoutMs)
      case 'custom':
        return callOpenAICompat(p, config, timeoutMs)
      default:
        throw new Error(`Unknown provider: ${config.provider}`)
    }
  }

  let raw = ''
  let json: unknown
  for (let i = 0; i < 3; i++) {
    raw = await attempt(i === 0 ? prompt : prompt + RETRY_SUFFIX)
    json = extractJson(raw)
    if (!isFallback(json)) break
  }
  return { raw, json }
}
