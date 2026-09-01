'use client'
import { useEffect, useState } from 'react'
import type { AIConfig, AIProvider } from '@/lib/ai/config'
import { PROVIDER_LABELS, DEFAULT_MODELS, saveAIConfig, loadAIConfig } from '@/lib/ai/config'
import { Modal } from '@/app/components/ui/modal'
import { Input, Field, inputClass } from '@/app/components/ui/input'
import { Button } from '@/app/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
}

type ModelField = 'model' | 'modelFast' | 'modelThinking'

interface TestResult {
  ok: boolean
  latencyMs?: number
  error?: string
  hint?: string
}

const PROVIDERS: AIProvider[] = ['claude_cli', 'anthropic', 'openai', 'gemini', 'custom']

export function AISettingsModal({ open, onClose }: Props) {
  const [config, setConfig] = useState<AIConfig>({ provider: 'claude_cli' })
  const [saved, setSaved] = useState(false)
  const [deployMode, setDeployMode] = useState<'local' | 'deploy'>('local')

  const [models, setModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [manualEntry, setManualEntry] = useState(true)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

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

  const hasFetchCreds = config.provider === 'custom' ? !!config.baseUrl : !!config.apiKey

  async function fetchModels() {
    if (config.provider === 'claude_cli') return
    if (!hasFetchCreds) return
    setModelsLoading(true)
    setModelsError(null)
    try {
      const res = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          apiKey: config.apiKey,
          baseUrl: config.provider === 'custom' ? config.baseUrl : undefined,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setModels(data.models)
        setManualEntry(data.models.length === 0)
      } else {
        setModels([])
        setModelsError(data.error || '拉取模型列表失败')
      }
    } catch {
      setModels([])
      setModelsError('网络请求失败')
    } finally {
      setModelsLoading(false)
    }
  }

  // key/baseUrl 输入后防抖 800ms 自动拉取模型列表
  useEffect(() => {
    if (!open || !hasFetchCreds) return
    const t = setTimeout(() => { fetchModels() }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config.provider, config.apiKey, config.baseUrl])

  function handleProviderChange(p: AIProvider) {
    setConfig(c => ({ ...c, provider: p, model: DEFAULT_MODELS[p] || '' }))
    setModels([])
    setModelsError(null)
    setManualEntry(true)
    setTestResult(null)
  }

  const testTargetModel = config.modelThinking || config.model || config.modelFast || ''
  const testDisabled = testing || (config.provider !== 'claude_cli' && !testTargetModel)

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          apiKey: config.apiKey,
          baseUrl: config.provider === 'custom' ? config.baseUrl : undefined,
          model: config.provider === 'claude_cli' ? undefined : testTargetModel,
        }),
      })
      const data = await res.json()
      setTestResult(data)
    } catch {
      setTestResult({ ok: false, error: '网络请求失败' })
    } finally {
      setTesting(false)
    }
  }

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

  function renderModelField(key: ModelField, placeholder?: string) {
    const value = config[key] ?? (key === 'model' ? DEFAULT_MODELS[config.provider] : '')
    if (!manualEntry && models.length > 0) {
      return (
        <select
          value={value}
          onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
          className={`${inputClass} cursor-pointer`}
        >
          <option value="">（未选择）</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      )
    }
    return (
      <Input
        type="text"
        value={value}
        onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
        placeholder={placeholder}
      />
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 设置"
      footer={
        <>
          <div className="mr-auto flex items-center text-xs">
            {testResult?.ok
              ? <span className="text-leaf">✓ 已通过连接测试</span>
              : <span className="text-amberink">未通过连接测试</span>}
          </div>
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
                onClick={() => handleProviderChange(p)}
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

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => fetchModels()} loading={modelsLoading} disabled={!hasFetchCreds}>
                拉取模型
              </Button>
              {modelsLoading && <span className="text-xs text-pencil">正在拉取模型列表…</span>}
              {!modelsLoading && modelsError && <span className="text-xs text-vermilion">{modelsError}</span>}
              {!modelsLoading && !modelsError && models.length > 0 && (
                <span className="text-xs text-leaf">已获取 {models.length} 个模型</span>
              )}
            </div>

            <Field label="模型">
              {renderModelField('model')}
            </Field>

            <Field label="快速模式模型（可选）">
              {renderModelField('modelFast', '留空使用默认（如 glm-5-turbo / claude-haiku-4-5）')}
            </Field>

            <Field label="思考模式模型（可选）">
              {renderModelField('modelThinking', '留空则沿用上方「模型」')}
            </Field>

            {models.length > 0 && (
              <button
                type="button"
                onClick={() => setManualEntry(m => !m)}
                className="self-start text-xs text-inkblue underline underline-offset-2 cursor-pointer hover:text-vermilion"
              >
                {manualEntry ? '切换为下拉选择' : '切换为手动输入'}
              </button>
            )}
          </>
        )}

        {config.provider === 'claude_cli' && (
          <p className="text-sm text-pencil bg-paper-dim border border-line px-4 py-3">
            使用 Claude CLI 调用，需要安装 <code className="text-xs text-inkblue">@anthropic-ai/claude-code</code> 并登录 Claude 订阅账号。无需 API Key。
          </p>
        )}

        <div className="border-t border-line-soft pt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleTest} loading={testing} disabled={testDisabled}>
              {config.provider === 'claude_cli' ? '检测本机 CLI' : '测试连接'}
            </Button>
            {testResult && !testing && (
              testResult.ok
                ? <span className="text-xs text-leaf">✓ 连接成功，延迟 {testResult.latencyMs}ms</span>
                : <span className="text-xs text-vermilion">✗ {testResult.error}{testResult.hint ? `（${testResult.hint}）` : ''}</span>
            )}
          </div>
          {config.provider !== 'claude_cli' && !testTargetModel && (
            <p className="text-xs text-pencil">请先选择或填写一个模型再测试</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
