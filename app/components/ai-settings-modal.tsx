'use client'
import { useState, useEffect } from 'react'
import type { AIConfig, AIProvider } from '@/lib/ai/config'
import { PROVIDER_LABELS, DEFAULT_MODELS, saveAIConfig, loadAIConfig } from '@/lib/ai/config'
import { Modal } from '@/app/components/ui/modal'
import { Input, Field } from '@/app/components/ui/input'
import { Button } from '@/app/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
}

const PROVIDERS: AIProvider[] = ['claude_cli', 'anthropic', 'openai', 'gemini', 'custom']

export function AISettingsModal({ open, onClose }: Props) {
  const [config, setConfig] = useState<AIConfig>({ provider: 'claude_cli' })
  const [saved, setSaved] = useState(false)
  const [deployMode, setDeployMode] = useState<'local' | 'deploy'>('local')

  useEffect(() => {
    if (!open) return
    const local = loadAIConfig()
    setConfig(local)
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data?.deployMode === 'deploy') {
          setDeployMode('deploy')
          // deploy 模式禁用 claude_cli，之前本地记录的选择若为 claude_cli 则回退到需要 BYOK 的默认项
          setConfig(c => c.provider === 'claude_cli' ? { ...c, provider: 'anthropic', model: DEFAULT_MODELS.anthropic } : c)
        } else {
          setDeployMode('local')
        }
      })
      .catch(() => {})
  }, [open])

  const visibleProviders = deployMode === 'deploy'
    ? PROVIDERS.filter(p => p !== 'claude_cli')
    : PROVIDERS

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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 设置"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={handleSave}>{saved ? '已保存 ✓' : '保存'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="AI 提供商">
          {deployMode === 'deploy' && (
            <p className="mb-2 text-xs text-pencil bg-paper-dim border border-line px-3 py-2">
              当前为部署模式，Claude 订阅模式（CLI）不可用，请填写 API Key（BYOK）。
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {visibleProviders.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setConfig(c => ({ ...c, provider: p, model: DEFAULT_MODELS[p] || '' }))}
                className={`text-left px-3 py-2 text-sm border transition-colors cursor-pointer ${
                  config.provider === p
                    ? 'bg-paper-dim border-ink text-ink font-medium'
                    : 'bg-paper border-line text-ink-soft hover:bg-paper-dim'
                }`}
              >
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>
        </Field>

        {config.provider !== 'claude_cli' && (
          <>
            <Field label="API Key">
              <Input
                type="password"
                value={config.apiKey || ''}
                onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))}
                placeholder={config.provider === 'gemini' ? 'AIza...' : 'sk-...'}
              />
            </Field>

            <Field label="模型">
              <Input
                type="text"
                value={config.model || DEFAULT_MODELS[config.provider]}
                onChange={e => setConfig(c => ({ ...c, model: e.target.value }))}
              />
            </Field>

            {config.provider === 'custom' && (
              <Field label="API Base URL">
                <Input
                  type="text"
                  value={config.baseUrl || ''}
                  onChange={e => setConfig(c => ({ ...c, baseUrl: e.target.value }))}
                  placeholder="http://localhost:11434/v1"
                />
              </Field>
            )}

            <Field label="快速模式模型（可选）">
              <Input
                type="text"
                value={config.modelFast || ''}
                onChange={e => setConfig(c => ({ ...c, modelFast: e.target.value }))}
                placeholder="留空使用默认（如 glm-5-turbo / claude-haiku-4-5）"
              />
            </Field>

            <Field label="思考模式模型（可选）">
              <Input
                type="text"
                value={config.modelThinking || ''}
                onChange={e => setConfig(c => ({ ...c, modelThinking: e.target.value }))}
                placeholder="留空则沿用上方「模型」"
              />
            </Field>
          </>
        )}

        {config.provider === 'claude_cli' && (
          <p className="text-sm text-pencil bg-paper-dim border border-line px-4 py-3">
            使用 Claude CLI 调用，需要安装 <code className="text-xs text-inkblue">@anthropic-ai/claude-code</code> 并登录 Claude 订阅账号。无需 API Key。
          </p>
        )}
      </div>
    </Modal>
  )
}
