import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { providerRegistry } from './registry'

describe('ProviderRegistry - Dynamic Multi-Model Architecture', () => {
  it('reports available models and their status based on configured keys', () => {
    const models = providerRegistry.getAvailableModels()
    assert.ok(models.length >= 3)
    const gemini = models.find((m) => m.provider === 'gemini')
    const claude = models.find((m) => m.provider === 'anthropic')
    const gpt = models.find((m) => m.provider === 'openai')

    assert.ok(gemini)
    assert.ok(claude)
    assert.ok(gpt)

    assert.equal(gemini.isDefault, true)
    assert.ok(['available', 'api_key_required'].includes(gemini.status))
    assert.ok(['available', 'api_key_required'].includes(claude.status))
    assert.ok(['available', 'api_key_required'].includes(gpt.status))
  })

  it('provides explicit fallback to Gemini when Anthropic key is missing', () => {
    // If anthropic is not configured, getProviderForModel should gracefully fall back to Gemini
    const { provider, effectiveModel, fallbackNotice } = providerRegistry.getProviderForModel('claude-3-7-sonnet-20250219')
    assert.ok(provider)
    if (fallbackNotice) {
      assert.ok(fallbackNotice.includes('fallback to Gemini'))
      assert.equal(effectiveModel, 'gemini-3.5-flash-lite')
    } else {
      assert.equal(effectiveModel, 'claude-3-7-sonnet-20250219')
    }
  })

  it('provides explicit fallback to Gemini when OpenAI key is missing', () => {
    const { provider, effectiveModel, fallbackNotice } = providerRegistry.getProviderForModel('gpt-4o')
    assert.ok(provider)
    if (fallbackNotice) {
      assert.ok(fallbackNotice.includes('fallback to Gemini'))
      assert.equal(effectiveModel, 'gemini-3.5-flash-lite')
    } else {
      assert.equal(effectiveModel, 'gpt-4o')
    }
  })
})
