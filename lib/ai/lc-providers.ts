import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ClaudeCLIModel } from './lc-cli-model'
import type { AIConfig } from './config'
import type { AiMode } from '../types/project'

export interface ProviderOptions {
  timeoutMs?: number
  /** AI 双模式：fast（快速搭骨架）/ thinking（深度精修，缺省）。仅影响模型选择/思考开关，不影响 schema。 */
  mode?: AiMode
}

const BIGMODEL_HOST_PATTERN = /bigmodel\.cn/i

function isBigmodelEndpoint(baseUrl?: string): boolean {
  return !!baseUrl && BIGMODEL_HOST_PATTERN.test(baseUrl)
}

// glm-5 系（不含 turbo 变体）是推理模型；bigmodel 的 OpenAI 兼容端点支持 thinking:{type:'disabled'} 关闭思考。
function isReasoningGlmModel(model?: string): boolean {
  return !!model && /^glm-5(?!-turbo)/i.test(model)
}

/** 按 mode 解析实际使用的模型 ID：优先 config.modelFast/modelThinking 显式覆盖，否则按 provider 给默认，都没有则沿用 config.model。 */
function resolveModel(config: AIConfig, mode?: AiMode): string | undefined {
  if (mode === 'fast' && config.modelFast) return config.modelFast
  if (mode === 'thinking' && config.modelThinking) return config.modelThinking
  if (mode === 'fast') {
    if (config.provider === 'custom' && isBigmodelEndpoint(config.baseUrl)) return 'glm-5-turbo'
    if (config.provider === 'anthropic') return 'claude-haiku-4-5'
  }
  return config.model
}

export function createModel(config: AIConfig, opts: ProviderOptions = {}): BaseChatModel {
  const timeout = opts.timeoutMs ?? 120000
  const model = resolveModel(config, opts.mode)

  switch (config.provider) {
    case 'claude_cli':
      if (process.env.DEPLOY_MODE === 'deploy') {
        throw new Error('no_cli: claude_cli disabled in deploy mode')
      }
      return new ClaudeCLIModel({ timeoutMs: timeout })

    case 'anthropic':
      return new ChatAnthropic({
        model: model ?? 'claude-opus-4-8',
        apiKey: config.apiKey,
        maxTokens: 8192,
        clientOptions: { timeout },
      })

    case 'openai':
      return new ChatOpenAI({
        model: model ?? 'gpt-5.4',
        apiKey: config.apiKey,
        temperature: 0.7,
        timeout: timeout,
      })

    case 'gemini':
      // ChatGoogleGenerativeAI 构造函数不接受 timeout 字段（@langchain/google-genai 未透传该参数），
      // 调用方（lc-chains.ts/lg-structure.ts）通过 invoke(..., { timeout }) 借助
      // LangChain 通用的 RunnableConfig.timeout 机制施加超时
      return new ChatGoogleGenerativeAI({
        model: model ?? 'gemini-3.5-flash',
        apiKey: config.apiKey,
        maxOutputTokens: 8192,
        temperature: 0.7,
      })

    case 'custom': {
      const effectiveModel = model ?? 'llama3'
      // fast 模式下若解析出的模型仍是 glm-5 推理系（例如用户把 modelFast 显式设成 glm-5.2），
      // 透传 thinking:disabled 关闭思考以提速；glm-5-turbo 等非推理模型不需要也不发送该参数。
      const disableThinking = opts.mode === 'fast'
        && isBigmodelEndpoint(config.baseUrl)
        && isReasoningGlmModel(effectiveModel)

      return new ChatOpenAI({
        model: effectiveModel,
        apiKey: config.apiKey ?? 'none',
        configuration: { baseURL: config.baseUrl ?? 'http://localhost:11434/v1' },
        temperature: 0.7,
        timeout: timeout,
        ...(disableThinking ? { modelKwargs: { thinking: { type: 'disabled' } } } : {}),
      })
    }

    default:
      throw new Error(`Unknown provider: ${(config as AIConfig).provider}`)
  }
}
