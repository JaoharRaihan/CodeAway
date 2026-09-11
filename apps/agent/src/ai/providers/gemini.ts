import { AIProvider, AIRequestOptions, AIResponse, ToolCall } from './base'

export class GeminiProvider implements AIProvider {
  id = 'gemini'
  name = 'Google Gemini'

  constructor(private apiKey?: string) {}

  supportsToolCalling(): boolean {
    return true
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  async createMessage(options: AIRequestOptions): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new Error('Gemini API key is not configured')
    }

    const modelName = options.model || 'gemini-3.5-flash-lite'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`

    const functionDeclarations = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))

    const body = {
      contents: options.messages,
      systemInstruction: { parts: [{ text: options.systemInstruction }] },
      tools: [{ functionDeclarations }],
    }

    const maxRetries = 4
    let attempt = 0
    let lastError = ''

    while (attempt < maxRetries) {
      attempt++
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data: any = await res.json()
      if (res.status === 429 || data.error?.code === 429 || data.error?.status === 'RESOURCE_EXHAUSTED') {
        const errorMsg = data.error?.message || ''
        const match = errorMsg.match(/retry in\s+([\d.]+)\s*s/i)
        const delaySeconds = match ? Math.ceil(parseFloat(match[1])) + 2 : 15 * attempt
        console.log(`\n⏳ Gemini 15 RPM free-tier rate limit reached. Waiting ${delaySeconds}s before auto-retrying (attempt ${attempt}/${maxRetries})...`)
        await new Promise((r) => setTimeout(r, delaySeconds * 1000))
        continue
      }

      if (!res.ok) {
        throw new Error(data.error?.message || `Gemini API error: ${res.statusText}`)
      }

      const candidate = data.candidates?.[0]
      if (!candidate || !candidate.content) {
        return { text: '' }
      }

      const parts = candidate.content.parts || []
      const toolCalls: ToolCall[] = []
      const texts: string[] = []

      for (const part of parts) {
        if (part.text) texts.push(part.text)
        if (part.functionCall) {
          toolCalls.push({
            id: part.functionCall.name + '_' + Date.now(),
            name: part.functionCall.name,
            args: part.functionCall.args || {},
          })
        }
      }

      return {
        text: texts.join('\n'),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        rawContent: candidate.content,
      }
    }

    throw new Error(`Gemini rate limit exceeded after ${maxRetries} retries: ${lastError}`)
  }
}
