import type { IntentType } from '@codeaway/shared'
import { AIProvider } from './providers/base'

export interface IntentClassificationResult {
  intent: IntentType
  reason: string
  suggestedOpening?: string
}

/**
 * Fast intent classification combining fast heuristics with optional model verification
 */
export async function classifyIntent(
  message: string,
  options: {
    hasActiveTask?: boolean
    provider?: AIProvider
    model?: string
  } = {}
): Promise<IntentClassificationResult> {
  const trimmed = message.trim().toLowerCase()

  // 1. Instant Control Heuristics
  const controlPatterns = [
    /^(stop|halt|abort|cancel|emergency stop)(\s*!*)?$/i,
    /^(pause|wait a sec|freeze)(\s*!*)?$/i,
    /^(resume|continue|keep going|unpause)(\s*!*)?$/i,
  ]
  if (controlPatterns.some((pattern) => pattern.test(trimmed))) {
    return {
      intent: 'control',
      reason: 'Detected execution control command',
    }
  }

  // 2. Clear Follow-up Heuristics if task is active or in progress
  if (options.hasActiveTask) {
    const followUpPatterns = [
      /^why did you (change|edit|delete|modify)/i,
      /^what did you (find|do|change|test)/i,
      /^can you explain why/i,
      /^(ok|okay|got it|sounds good),?\s*(continue|proceed|keep going)?$/i,
      /^(continue|proceed|keep going)$/i,
    ]
    if (followUpPatterns.some((p) => p.test(trimmed))) {
      return {
        intent: 'follow_up',
        reason: 'User is inquiring about or continuing the active task',
      }
    }
  }

  // 3. Clear Chat / Informational Heuristics
  const pureChatPatterns = [
    /^(what is|what are|explain|who is|how does)\s+.+\??$/i,
    /^what('s| is) the difference between\s+.+and\s+.+\??$/i,
    /^(hi|hello|hey|greetings|how are you|who are you)(\s*!*)?$/i,
  ]
  if (
    pureChatPatterns.some((p) => p.test(trimmed)) &&
    !trimmed.includes('fix') &&
    !trimmed.includes('change') &&
    !trimmed.includes('in this project') &&
    !trimmed.includes('our app') &&
    !trimmed.includes('codeaway')
  ) {
    return {
      intent: 'chat',
      reason: 'Conceptual explanation or general query',
    }
  }

  // 4. Clear Discussion Heuristics
  const discussionPatterns = [
    /^(should we|what do you think about|do you recommend|would it be better to)\s+/i,
    /^(which is better|is it better to use)\s+/i,
  ]
  if (discussionPatterns.some((p) => p.test(trimmed)) && !trimmed.includes('fix') && !trimmed.includes('implement')) {
    return {
      intent: 'discussion',
      reason: 'Architectural or design advice requested',
    }
  }

  // 5. Clear Action Heuristics (Fix, Add, Update, Remove, Run, Check, Test, Refactor, Implement)
  const actionVerbs = [
    'fix', 'add', 'create', 'update', 'modify', 'delete', 'remove', 'refactor',
    'implement', 'test', 'run', 'build', 'lint', 'change', 'install', 'setup', 'inspect', 'debug'
  ]
  const startsWithAction = actionVerbs.some((verb) =>
    trimmed.startsWith(verb + ' ') || trimmed.startsWith('please ' + verb + ' ') || trimmed.startsWith('can you ' + verb + ' ')
  )
  if (startsWithAction) {
    return {
      intent: 'action',
      reason: 'Action verb detected requiring workspace inspection or modification',
    }
  }

  // 6. Fast LLM Classification if ambiguous and provider available
  if (options.provider && options.provider.isConfigured()) {
    try {
      const prompt = `Classify this developer message sent from a phone to their Mac AI engineer:
"${message}"

Options:
- CHAT: General technical question or concept explanation (e.g. "What is MobX?").
- DISCUSSION: Architectural advice, design options, or trade-offs (e.g. "Should we use Mongo or Postgres?").
- FOLLOW_UP: Question about previous edits/findings or asking to continue.
- ACTION: Instruction to inspect project, edit code, fix bugs, run commands, or tests (e.g. "Fix the login button").
- CONTROL: Stop, pause, resume.

Respond ONLY with a JSON object in this exact format:
{"intent": "chat" | "discussion" | "follow_up" | "action" | "control", "reason": "short explanation"}`

      const res = await options.provider.createMessage({
        model: options.model || 'gemini-2.5-flash',
        systemInstruction: 'You are an intent classifier for a mobile-controlled coding agent. Return only JSON.',
        messages: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [],
      })

      const text = res.text?.trim() || ''
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (['chat', 'discussion', 'follow_up', 'action', 'control'].includes(parsed.intent)) {
          return {
            intent: parsed.intent as IntentType,
            reason: parsed.reason || 'Classified by model',
          }
        }
      }
    } catch {
      // fallback to default
    }
  }

  // Default fallback: if nothing else, treat as action so user's task gets handled
  return {
    intent: 'action',
    reason: 'Defaulting to action to inspect and address user request',
  }
}
