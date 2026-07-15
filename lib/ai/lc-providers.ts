import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ClaudeCLIModel } from './lc-cli-model'
import type { AIConfig } from './config'

export interface ProviderOptions {
  timeoutMs?: number
}

export function createModel(config: AIConfig, opts: ProviderOptions = {}): BaseChatModel {
  const timeout = opts.timeoutMs ?? 120000

  switch (config.provider) {
    case 'claude_cli':
      if (process.env.DEPLOY_MODE === 'deploy') {
        throw new Error('no_cli: claude_cli disabled in deploy mode')
      }
      return new ClaudeCLIModel({ timeoutMs: timeout })

    case 'anthropic':
      return new ChatAnthropic({
        model: config.model ?? 'claude-opus-4-5',
        apiKey: config.apiKey,
        maxTokens: 8192,
        clientOptions: { timeout },
      })

    case 'openai':
      return new ChatOpenAI({
        model: config.model ?? 'gpt-4o',
        apiKey: config.apiKey,
        temperature: 0.7,
        timeout: timeout,
      })

    case 'gemini':
      // ChatGoogleGenerativeAI 构造函数不接受 timeout 字段（@langchain/google-genai 未透传该参数），
      // 调用方（lc-chains.ts/lg-structure.ts）通过 invoke(..., { timeout }) 借助
      // LangChain 通用的 RunnableConfig.timeout 机制施加超时
      return new ChatGoogleGenerativeAI({
        model: config.model ?? 'gemini-2.0-flash',
        apiKey: config.apiKey,
        maxOutputTokens: 8192,
        temperature: 0.7,
      })

    case 'custom':
      return new ChatOpenAI({
        model: config.model ?? 'llama3',
        apiKey: config.apiKey ?? 'none',
        configuration: { baseURL: config.baseUrl ?? 'http://localhost:11434/v1' },
        temperature: 0.7,
        timeout: timeout,
      })

    default:
      throw new Error(`Unknown provider: ${(config as AIConfig).provider}`)
  }
}
