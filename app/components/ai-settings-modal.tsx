'use client'
import { useState, useEffect } from 'react'
import type { AIConfig, AIProvider } from '@/lib/ai/config'
import { PROVIDER_LABELS, DEFAULT_MODELS, saveAIConfig, loadAIConfig } from '@/lib/ai/config'

interface Props {
  open: boolean
  onClose: () => void
}

const PROVIDERS: AIProvider[] = ['claude_cli', 'anthropic', 'openai', 'gemini', 'custom']

export function AISettingsModal({ open, onClose }: Props) {
  const [config, setConfig] = useState<AIConfig>({ provider: 'claude_cli' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (open) setConfig(loadAIConfig())
  }, [open])

  function handleSave() {
    saveAIConfig(config)
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).catch(() => {})
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 800)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(26,31,62,0.92)' }} onClick={onClose}>
      <div
        className="relative w-full max-w-lg p-8 shadow-2xl"
        style={{ background: 'var(--shell-mid)', border: '2px solid var(--gold-dim)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold tracking-widest uppercase mb-1" style={{ color: 'var(--shell-fg)' }}>
          AI 设置
        </h2>
        <div className="deco-rule mb-6" />

        <div className="mb-5">
          <label className="text-xs uppercase tracking-[0.3em] mb-2 block" style={{ color: 'var(--shell-fg-3)' }}>
            AI 提供商
          </label>
          <div className="flex flex-col gap-2">
            {PROVIDERS.map(p => (
              <button
                key={p}
                onClick={() => setConfig(c => ({ ...c, provider: p, model: DEFAULT_MODELS[p] || '' }))}
                className="text-left px-4 py-3 text-sm transition-all"
                style={{
                  background: config.provider === p ? 'var(--gold-trace)' : 'var(--shell-raised)',
                  border: `1px solid ${config.provider === p ? 'var(--gold-mid)' : 'var(--shell-border)'}`,
                  color: config.provider === p ? 'var(--gold-bright)' : 'var(--shell-fg-2)',
                }}
              >
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {config.provider !== 'claude_cli' && (
          <>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-[0.3em] mb-2 block" style={{ color: 'var(--shell-fg-3)' }}>
                API Key
              </label>
              <input
                type="password"
                value={config.apiKey || ''}
                onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))}
                placeholder={config.provider === 'gemini' ? 'AIza...' : 'sk-...'}
                className="w-full px-4 py-3 text-sm focus:outline-none"
                style={{ background: 'var(--shell-raised)', border: '1px solid var(--shell-border)', color: 'var(--shell-fg)' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--gold-mid)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--shell-border)' }}
              />
            </div>

            <div className="mb-4">
              <label className="text-xs uppercase tracking-[0.3em] mb-2 block" style={{ color: 'var(--shell-fg-3)' }}>
                模型
              </label>
              <input
                type="text"
                value={config.model || DEFAULT_MODELS[config.provider]}
                onChange={e => setConfig(c => ({ ...c, model: e.target.value }))}
                className="w-full px-4 py-3 text-sm focus:outline-none"
                style={{ background: 'var(--shell-raised)', border: '1px solid var(--shell-border)', color: 'var(--shell-fg)' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--gold-mid)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--shell-border)' }}
              />
            </div>

            {config.provider === 'custom' && (
              <div className="mb-4">
                <label className="text-xs uppercase tracking-[0.3em] mb-2 block" style={{ color: 'var(--shell-fg-3)' }}>
                  API Base URL
                </label>
                <input
                  type="text"
                  value={config.baseUrl || ''}
                  onChange={e => setConfig(c => ({ ...c, baseUrl: e.target.value }))}
                  placeholder="http://localhost:11434/v1"
                  className="w-full px-4 py-3 text-sm focus:outline-none"
                  style={{ background: 'var(--shell-raised)', border: '1px solid var(--shell-border)', color: 'var(--shell-fg)' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--gold-mid)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--shell-border)' }}
                />
              </div>
            )}
          </>
        )}

        {config.provider === 'claude_cli' && (
          <div className="mb-6 px-4 py-3 text-sm" style={{ background: 'var(--shell-raised)', border: '1px solid var(--shell-border)', color: 'var(--shell-fg-2)' }}>
            使用 Claude CLI 调用，需要安装 <code className="text-xs" style={{ color: 'var(--gold-mid)' }}>@anthropic-ai/claude-code</code> 并登录 Claude 订阅账号。无需 API Key。
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-medium tracking-wider transition-all"
            style={{ border: '1px solid var(--shell-border)', color: 'var(--shell-fg-2)', background: 'transparent' }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 text-sm font-medium tracking-wider transition-all"
            style={{ background: saved ? 'var(--gold-dim)' : 'var(--gold-mid)', color: 'var(--shell)' }}
          >
            {saved ? '已保存 ✓' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
