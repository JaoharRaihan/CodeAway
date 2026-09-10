export interface ToolDeclaration {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, any>
}

export interface AIRequestOptions {
  model: string
  systemInstruction: string
  messages: any[]
  tools: ToolDeclaration[]
}

export interface AIResponse {
  text?: string
  toolCalls?: ToolCall[]
  rawContent?: any
}

export interface AIProvider {
  id: string
  name: string
  supportsToolCalling(): boolean
  isConfigured(): boolean
  createMessage(options: AIRequestOptions): Promise<AIResponse>
}
