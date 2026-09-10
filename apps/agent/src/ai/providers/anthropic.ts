import { AIProvider, AIRequestOptions, AIResponse, ToolCall } from './base'

export class AnthropicProvider implements AIProvider {
  id = 'anthropic'
  name = 'Anthropic Claude'

  constructor(private apiKey?: string) {}

  supportsToolCalling(): boolean {
    return true
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  async createMessage(options: AIRequestOptions): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key is not configured')
    }

    const modelName = options.model.includes('3-7')
      ? 'claude-3-7-sonnet-20250219'
      : 'claude-3-5-sonnet-20241022'

    const tools = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }))

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 4096,
        system: options.systemInstruction,
        messages: options.messages,
        tools,
      }),
    })

    const data: any = await res.json()
    if (!res.ok) {
      throw new Error(data.error?.message || `Claude API error: ${res.statusText}`)
    }

    const toolCalls: ToolCall[] = []
    const texts: string[] = []

    for (const block of data.content || []) {
      if (block.type === 'text') texts.push(block.text)
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          args: block.input || {},
        })
      }
    }

    return {
      text: texts.join('\n'),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      rawContent: data.content,
    }
  }
}
