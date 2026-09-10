import type { ModelInfo } from '@codeaway/shared'
import { AIProvider } from './base'
import { GeminiProvider } from './gemini'
import { AnthropicProvider } from './anthropic'
import { OpenAIProvider } from './openai'
import { getConfig } from '../../core/config'

export class ProviderRegistry {
  private providers: Map<string, AIProvider> = new Map()

  constructor() {
    this.reload()
  }

  reload(): void {
    const config = getConfig()
    const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY
    const anthropicKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY
    const openaiKey = config.openaiApiKey || process.env.OPENAI_API_KEY

    this.providers.set('gemini', new GeminiProvider(geminiKey))
    this.providers.set('anthropic', new AnthropicProvider(anthropicKey))
    this.providers.set('openai', new OpenAIProvider(openaiKey))
  }

  getProviderForModel(modelId: string): { provider: AIProvider; effectiveModel: string; fallbackNotice?: string } {
    this.reload()
    const lower = (modelId || '').toLowerCase()

    if (lower.includes('claude') || lower.includes('anthropic') || lower.includes('sonnet')) {
      const p = this.providers.get('anthropic')!
      if (p.isConfigured()) return { provider: p, effectiveModel: modelId }
      return {
        provider: this.providers.get('gemini')!,
        effectiveModel: 'gemini-3.5-flash-lite',
        fallbackNotice: '⚠️ Anthropic API key not configured on laptop. Explicit fallback to Gemini 3.5 Flash.',
      }
    }

    if (lower.includes('gpt') || lower.includes('o3') || lower.includes('openai')) {
      const p = this.providers.get('openai')!
      if (p.isConfigured()) return { provider: p, effectiveModel: modelId }
      return {
        provider: this.providers.get('gemini')!,
        effectiveModel: 'gemini-3.5-flash-lite',
        fallbackNotice: '⚠️ OpenAI API key not configured on laptop. Explicit fallback to Gemini 3.5 Flash.',
      }
    }

    return { provider: this.providers.get('gemini')!, effectiveModel: modelId || 'gemini-3.5-flash-lite' }
  }

  getAvailableModels(): ModelInfo[] {
    this.reload()
    const gemini = this.providers.get('gemini')!
    const anthropic = this.providers.get('anthropic')!
    const openai = this.providers.get('openai')!

    return [
      {
        id: 'gemini-3.5-flash-lite',
        name: 'Gemini 3.5 Flash',
        provider: 'gemini',
        status: gemini.isConfigured() ? 'available' : 'api_key_required',
        isDefault: true,
      },
      {
        id: 'claude-3-7-sonnet-20250219',
        name: 'Claude 3.7 Sonnet',
        provider: 'anthropic',
        status: anthropic.isConfigured() ? 'available' : 'api_key_required',
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        status: openai.isConfigured() ? 'available' : 'api_key_required',
      },
    ]
  }
}

export const providerRegistry = new ProviderRegistry()
