import { AIProvider, AIRequestOptions, AIResponse, ToolCall } from './base'

export class OpenAIProvider implements AIProvider {
  id = 'openai'
  name = 'OpenAI'

  constructor(private apiKey?: string) {}

  supportsToolCalling(): boolean {
    return true
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  async createMessage(options: AIRequestOptions): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is not configured')
    }

    const modelName = options.model.includes('o3') ? 'o3-mini' : 'gpt-4o'
    const tools = options.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: options.messages,
        tools,
      }),
    })

    const data: any = await res.json()
    if (!res.ok) {
      throw new Error(data.error?.message || `OpenAI API error: ${res.statusText}`)
    }

    const choice = data.choices?.[0]?.message
    if (!choice) return { text: '' }

    const toolCalls: ToolCall[] = []
    for (const tc of choice.tool_calls || []) {
      let parsedArgs = {}
      try { parsedArgs = JSON.parse(tc.function.arguments) } catch { /* ignore */ }
      toolCalls.push({
        id: tc.id,
        name: tc.function.name,
        args: parsedArgs,
      })
    }

    return {
      text: choice.content || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      rawContent: choice,
    }
  }
}
