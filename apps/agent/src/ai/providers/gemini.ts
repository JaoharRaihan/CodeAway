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

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data: any = await res.json()
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
}
