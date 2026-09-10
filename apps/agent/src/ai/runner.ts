import chalk from 'chalk'
import { WorkspaceManager } from '../core/workspace'
import { classifyCommand, runCommand } from '../core/terminal'
import { GitManager } from '../core/git'
import type { TaskEventPayload, FileAction } from '@codeaway/shared'

export interface AgentRunOptions {
  taskId: string
  userId: string
  prompt: string
  model?: string
  workspace: WorkspaceManager
  git: GitManager
  geminiApiKey: string
  anthropicApiKey?: string
  openaiApiKey?: string
  onEvent: (event: TaskEventPayload) => void
  onApprovalNeeded: (command: string, reason: string) => Promise<boolean>
}

export interface AgentRunResult {
  result: string
  files: Array<{ file_path: string; action: FileAction; diff?: string }>
}

export interface TaskSession {
  taskId: string
  userId: string
  model: string
  workspace: WorkspaceManager
  git: GitManager
  geminiApiKey: string
  anthropicApiKey?: string
  openaiApiKey?: string
  geminiContents: Array<{ role: 'user' | 'model'; parts: any[] }>
  anthropicMessages: Array<{ role: 'user' | 'assistant'; content: any }>
  openaiMessages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content?: any; tool_calls?: any; tool_call_id?: string }>
  changedFiles: AgentRunResult['files']
  isRunning: boolean
  followUpQueue: Array<{ message: string; model?: string }>
}

// Tool definitions (Gemini format)
const toolDeclarations = [
  {
    name: 'list_files',
    description: 'List all files in the project workspace',
    parameters: {
      type: 'object',
      properties: {
        subdir: { type: 'string', description: 'Subdirectory to list (optional)' },
      },
    },
  },
  {
    name: 'read_file',
    description: 'Read the content of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file with new content',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        content: { type: 'string', description: 'Full file content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_command',
    description: 'Run a terminal command in the project directory',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
      required: ['command'],
    },
  },
  {
    name: 'git_status',
    description: 'Get the current git status of the project',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'git_diff',
    description: 'Get the git diff of changed files',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'finish',
    description: 'Mark the task as complete and return the final result summary',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of everything done' },
      },
      required: ['summary'],
    },
  },
]

const anthropicTools = toolDeclarations.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}))

const openAiTools = toolDeclarations.map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}))

const SYSTEM_INSTRUCTION = `You are CodeAway, an expert autonomous AI coding agent running directly on a developer's machine.
You have been delegated a coding task to complete. Follow this workflow:
1. First INSPECT the project structure and relevant files using list_files and read_file.
2. Formulate a plan before making changes.
3. IMPLEMENT changes carefully with write_file, preserving existing code style.
4. RUN tests or validation commands if appropriate using run_command.
5. Call finish() when done with a clear summary of all changes made.

Always follow existing code patterns, naming conventions, and architecture.
Never modify files unrelated to the task.
Be precise, professional, and thorough.`

export function detectProvider(model?: string): 'gemini' | 'anthropic' | 'openai' {
  if (!model) return 'gemini'
  const m = model.toLowerCase()
  if (m.includes('claude') || m.includes('anthropic') || m.includes('sonnet') || m.includes('opus')) {
    return 'anthropic'
  }
  if (m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('openai')) {
    return 'openai'
  }
  return 'gemini'
}

export function createTaskSession(opts: {
  taskId: string
  userId: string
  workspace: WorkspaceManager
  git: GitManager
  geminiApiKey: string
  anthropicApiKey?: string
  openaiApiKey?: string
  model?: string
}): TaskSession {
  return {
    taskId: opts.taskId,
    userId: opts.userId,
    model: opts.model || 'gemini-3.5-flash-lite',
    workspace: opts.workspace,
    git: opts.git,
    geminiApiKey: opts.geminiApiKey,
    anthropicApiKey: opts.anthropicApiKey,
    openaiApiKey: opts.openaiApiKey,
    geminiContents: [],
    anthropicMessages: [],
    openaiMessages: [{ role: 'system', content: SYSTEM_INSTRUCTION }],
    changedFiles: [],
    isRunning: false,
    followUpQueue: [],
  }
}

async function executeSingleTool(
  name: string,
  args: any,
  session: TaskSession,
  logAndEmit: (event: TaskEventPayload) => void,
  onApprovalNeeded: (command: string, reason: string) => Promise<boolean>
): Promise<{ toolResult: string; isFinished: boolean; summary?: string }> {
  const { workspace, git } = session
  const a = args || {}
  let toolResult = ''

  try {
    if (name === 'list_files') {
      const files = workspace.listFiles(a.subdir)
      toolResult = files.join('\n')
      logAndEmit({ type: 'file_read', message: `📁 Listed ${files.length} files in workspace` })

    } else if (name === 'read_file') {
      toolResult = workspace.readFile(a.path)
      logAndEmit({ type: 'file_read', message: `📄 Reading ${a.path}` })

    } else if (name === 'write_file') {
      const isNew = !workspace.fileExists(a.path)
      workspace.writeFile(a.path, a.content)
      const action: FileAction = isNew ? 'created' : 'modified'
      session.changedFiles.push({ file_path: a.path, action })
      toolResult = `File ${action}: ${a.path}`
      logAndEmit({
        type: 'file_modified',
        message: `✏️  ${action === 'created' ? 'Created' : 'Modified'} ${a.path}`,
      })

    } else if (name === 'run_command') {
      const cmd = a.command as string
      const level = classifyCommand(cmd)

      if (level === 'BLOCKED') {
        toolResult = `BLOCKED: "${cmd}" is not allowed for security reasons.`
        logAndEmit({ type: 'error', message: `🚫 Blocked command: ${cmd}` })

      } else if (level === 'APPROVAL') {
        logAndEmit({ type: 'approval_required', message: `⚠️  Approval required for: ${cmd}` })
        const approved = await onApprovalNeeded(cmd, `AI agent wants to execute: ${cmd}`)

        if (!approved) {
          toolResult = `REJECTED: User rejected permission to run "${cmd}".`
          logAndEmit({ type: 'error', message: `❌ User rejected command: ${cmd}` })
        } else {
          logAndEmit({ type: 'command_started', message: `▶️  Running: ${cmd}` })
          const r = await runCommand(cmd, workspace.root)
          toolResult = `exit=${r.exitCode}\n${r.stdout}\n${r.stderr}`
          logAndEmit({ type: 'command_finished', message: `✅ Done: ${cmd}` })
        }
      } else {
        logAndEmit({ type: 'command_started', message: `▶️  Running: ${cmd}` })
        const r = await runCommand(cmd, workspace.root)
        toolResult = `exit=${r.exitCode}\n${r.stdout}\n${r.stderr}`
        logAndEmit({
          type: r.exitCode === 0 ? 'command_finished' : 'error',
          message: r.exitCode === 0 ? `✅ Done: ${cmd}` : `❌ Failed: ${cmd}\n${r.stderr.slice(0, 200)}`,
        })
      }

    } else if (name === 'git_status') {
      toolResult = await git.status()
      logAndEmit({ type: 'command_finished', message: `🌿 Checked git status` })

    } else if (name === 'git_diff') {
      toolResult = await git.diff()
      logAndEmit({ type: 'command_finished', message: `🔍 Checked git diff` })

    } else if (name === 'finish') {
      const summary = a.summary || 'Task completed'
      logAndEmit({ type: 'task_completed', message: `🎉 ${summary}` })

      for (const f of session.changedFiles) {
        try { f.diff = await git.diff([f.file_path]) } catch { /* no diff */ }
      }
      return { toolResult: 'Finished', isFinished: true, summary }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    toolResult = `ERROR: ${msg}`
    logAndEmit({ type: 'error', message: `❌ Error in ${name}: ${msg}` })
  }

  return { toolResult, isFinished: false }
}

export async function runSessionTurn(
  session: TaskSession,
  userMessage: string,
  isFollowUp: boolean,
  onEvent: (event: TaskEventPayload) => void,
  onApprovalNeeded: (command: string, reason: string) => Promise<boolean>
): Promise<AgentRunResult> {
  const { workspace, git } = session
  session.isRunning = true

  const logAndEmit = (event: TaskEventPayload) => {
    console.log(chalk.cyan(`  ${event.message}`))
    onEvent(event)
  }

  let provider = detectProvider(session.model)

  // Fallbacks if keys are missing
  if (provider === 'anthropic' && !session.anthropicApiKey) {
    logAndEmit({
      type: 'task_started',
      message: '⚠️ Anthropic API key not configured. Falling back to Gemini 3.5 Flash.',
    })
    provider = 'gemini'
  } else if (provider === 'openai' && !session.openaiApiKey) {
    logAndEmit({
      type: 'task_started',
      message: '⚠️ OpenAI API key not configured. Falling back to Gemini 3.5 Flash.',
    })
    provider = 'gemini'
  }

  const fileList = workspace.listFiles().slice(0, 80).join('\n')
  const gitStatus = (await git.isRepo()) ? await git.status() : 'Not a git repo'

  const promptText = !isFollowUp
    ? `TASK: ${userMessage}

PROJECT FILES:
${fileList}

GIT STATUS:
${gitStatus}

Begin by inspecting the relevant files, implement the solution, and call finish() when complete.`
    : `FOLLOW-UP USER INSTRUCTION:
${userMessage}

CURRENT GIT STATUS:
${gitStatus}

Please inspect or modify files as requested, run any necessary checks, and call finish() with a clear summary when complete.`

  logAndEmit({
    type: 'task_started',
    message: isFollowUp
      ? `🤖 [${session.model}] Follow-up instruction: "${userMessage.slice(0, 70)}..."`
      : `🤖 [${session.model}] Started inspecting project...`,
  })

  let maxIterations = 30
  let finalSummary = ''

  try {
    if (provider === 'anthropic') {
      // Anthropic Claude 3.7 / 3.5 Sonnet
      const modelName = session.model.includes('3-7') ? 'claude-3-7-sonnet-20250219' : 'claude-3-5-sonnet-20241022'
      session.anthropicMessages.push({ role: 'user', content: promptText })

      while (maxIterations-- > 0) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': session.anthropicApiKey!,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            max_tokens: 4096,
            system: SYSTEM_INSTRUCTION,
            messages: session.anthropicMessages,
            tools: anthropicTools,
          }),
        })

        const data: any = await res.json()
        if (!res.ok) {
          throw new Error(data.error?.message || `Claude API error: ${res.statusText}`)
        }

        session.anthropicMessages.push({ role: 'assistant', content: data.content })

        const toolCalls = data.content?.filter((b: any) => b.type === 'tool_use') || []
        const textBlocks = data.content?.filter((b: any) => b.type === 'text') || []

        for (const tb of textBlocks) {
          if (tb.text) logAndEmit({ type: 'task_started', message: `🧠 ${tb.text.slice(0, 160)}...` })
        }

        if (toolCalls.length === 0) {
          finalSummary = textBlocks.map((t: any) => t.text).join('\n')
          break
        }

        const toolResults: any[] = []
        for (const tc of toolCalls) {
          const { toolResult, isFinished, summary } = await executeSingleTool(
            tc.name,
            tc.input,
            session,
            logAndEmit,
            onApprovalNeeded
          )
          if (isFinished) {
            return { result: summary || 'Task completed', files: session.changedFiles }
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: toolResult,
          })
        }

        session.anthropicMessages.push({ role: 'user', content: toolResults })
      }

    } else if (provider === 'openai') {
      // OpenAI GPT-4o / o3-mini
      const modelName = session.model.includes('o3') ? 'o3-mini' : 'gpt-4o'
      session.openaiMessages.push({ role: 'user', content: promptText })

      while (maxIterations-- > 0) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.openaiApiKey!}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            messages: session.openaiMessages,
            tools: openAiTools,
          }),
        })

        const data: any = await res.json()
        if (!res.ok) {
          throw new Error(data.error?.message || `OpenAI API error: ${res.statusText}`)
        }

        const choice = data.choices?.[0]?.message
        if (!choice) break

        session.openaiMessages.push(choice)

        if (choice.content) {
          logAndEmit({ type: 'task_started', message: `🧠 ${choice.content.slice(0, 160)}...` })
        }

        const toolCalls = choice.tool_calls || []
        if (toolCalls.length === 0) {
          finalSummary = choice.content || 'Task completed'
          break
        }

        for (const tc of toolCalls) {
          let parsedArgs = {}
          try { parsedArgs = JSON.parse(tc.function.arguments) } catch { /* ignore */ }

          const { toolResult, isFinished, summary } = await executeSingleTool(
            tc.function.name,
            parsedArgs,
            session,
            logAndEmit,
            onApprovalNeeded
          )

          if (isFinished) {
            return { result: summary || 'Task completed', files: session.changedFiles }
          }

          session.openaiMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolResult,
          })
        }
      }

    } else {
      // Google Gemini
      const modelName = 'gemini-3.5-flash-lite'
      session.geminiContents.push({ role: 'user', parts: [{ text: promptText }] })

      while (maxIterations-- > 0) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${session.geminiApiKey}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: session.geminiContents,
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            tools: [{ functionDeclarations: toolDeclarations }],
          }),
        })

        const data: any = await res.json()
        if (!res.ok) {
          throw new Error(data.error?.message || `Gemini API error: ${res.statusText}`)
        }

        const candidate = data.candidates?.[0]
        if (!candidate || !candidate.content) break

        session.geminiContents.push(candidate.content)

        const parts = candidate.content.parts || []
        const functionCalls = parts.filter((p: any) => p.functionCall)

        for (const part of parts) {
          if (part.text && !part.text.startsWith('```json')) {
            logAndEmit({ type: 'task_started', message: `🧠 ${part.text.slice(0, 160)}...` })
          }
        }

        if (functionCalls.length === 0) {
          finalSummary = parts.map((p: any) => p.text).filter(Boolean).join('\n')
          break
        }

        const functionResponses: any[] = []
        for (const fcPart of functionCalls) {
          const { name, args } = fcPart.functionCall
          const { toolResult, isFinished, summary } = await executeSingleTool(
            name,
            args,
            session,
            logAndEmit,
            onApprovalNeeded
          )

          if (isFinished) {
            return { result: summary || 'Task completed', files: session.changedFiles }
          }

          functionResponses.push({
            functionResponse: {
              name,
              response: { result: toolResult },
            },
          })
        }

        session.geminiContents.push({
          role: 'user',
          parts: functionResponses,
        })
      }
    }

    return { result: finalSummary || 'Task completed', files: session.changedFiles }
  } finally {
    session.isRunning = false
  }
}

export async function runAgentLoop(opts: AgentRunOptions): Promise<AgentRunResult> {
  const session = createTaskSession(opts)
  return runSessionTurn(session, opts.prompt, false, opts.onEvent, opts.onApprovalNeeded)
}
