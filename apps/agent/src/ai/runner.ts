import chalk from 'chalk'
import { WorkspaceManager } from '../core/workspace'
import { classifyCommand, runCommand, killActiveTaskProcess } from '../core/terminal'
import { GitManager } from '../core/git'
import { providerRegistry } from './providers/registry'
import { ToolDeclaration } from './providers/base'
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
  isAborted: boolean
  followUpQueue: Array<{ message: string; model?: string }>
}

// Tool definitions across all providers
const toolDeclarations: ToolDeclaration[] = [
  {
    name: 'get_project_context',
    description: 'Inspect the project framework, package manager, language, scripts, and key directories',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_files',
    description: 'List files in the authorized project workspace',
    parameters: {
      type: 'object',
      properties: {
        subdir: { type: 'string', description: 'Subdirectory to list (optional)' },
      },
    },
  },
  {
    name: 'search_code',
    description: 'Search code across project files by text or regex pattern',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text or regex search term' },
        subdir: { type: 'string', description: 'Directory to limit search (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the full content of a file in the workspace',
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
    description: 'Create or completely overwrite a file with new content',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        content: { type: 'string', description: 'Complete file content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Surgically replace a specific block of text in an existing file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        target_content: { type: 'string', description: 'Exact lines/text to replace' },
        replacement_content: { type: 'string', description: 'New replacement content' },
      },
      required: ['path', 'target_content', 'replacement_content'],
    },
  },
  {
    name: 'delete_file',
    description: 'Safely delete a file in the workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path to delete' },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command in the project directory (e.g. npm test, npx tsc, npm run build)',
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
    description: 'Get the git diff of changed files in the workspace',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'finish',
    description: 'Mark the task as complete and provide a final summary of all work done',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Clear summary of what was inspected, changed, and verified' },
      },
      required: ['summary'],
    },
  },
]

const SYSTEM_INSTRUCTION = `You are CodeAway, a senior autonomous AI coding agent running on a developer's Mac.
The developer is controlling you remotely from their phone. Follow this disciplined workflow:
1. First UNDERSTAND the project context using get_project_context, list_files, or search_code.
2. FORMULATE a plan before editing files.
3. INSPECT the exact files you intend to edit with read_file.
4. IMPLEMENT changes carefully with edit_file or write_file, strictly preserving existing architecture, naming, and code style.
5. RUN validation commands (tests, typecheck, lint) using run_command to verify changes.
6. If any validation fails, fix the errors before finishing.
7. Call finish() with a concise, professional summary of everything accomplished.

Never modify unrelated files. Never expose secrets or credentials. Never delete files unless explicitly required.`

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
    openaiMessages: [],
    changedFiles: [],
    isRunning: false,
    isAborted: false,
    followUpQueue: [],
  }
}

export function abortTaskSession(session: TaskSession): void {
  session.isAborted = true
  session.isRunning = false
  session.followUpQueue = []
  killActiveTaskProcess(session.taskId)
}

async function executeSingleTool(
  name: string,
  args: any,
  session: TaskSession,
  logAndEmit: (event: TaskEventPayload) => void,
  onApprovalNeeded: (command: string, reason: string) => Promise<boolean>
): Promise<{ toolResult: string; isFinished: boolean; summary?: string }> {
  if (session.isAborted) {
    return { toolResult: 'Task was aborted by user Emergency Stop', isFinished: true, summary: 'Task aborted' }
  }

  const { workspace, git, taskId } = session
  const a = args || {}
  let toolResult = ''

  try {
    if (name === 'get_project_context') {
      const ctx = workspace.getProjectContext()
      toolResult = JSON.stringify(ctx, null, 2)
      logAndEmit({
        type: 'file_read',
        message: `🧭 Project context: ${ctx.framework} (${ctx.language}), package manager: ${ctx.packageManager}`,
      })

    } else if (name === 'list_files') {
      const files = workspace.listFiles(a.subdir)
      toolResult = files.slice(0, 100).join('\n')
      logAndEmit({ type: 'file_read', message: `📁 Listed ${files.length} files in workspace` })

    } else if (name === 'search_code') {
      const results = workspace.searchCode(a.query, a.subdir)
      toolResult = results.length > 0
        ? results.map((r) => `${r.file}:${r.line}: ${r.text}`).join('\n')
        : `No matches found for "${a.query}"`
      logAndEmit({
        type: 'file_read',
        message: `🔍 Searched code for "${a.query}" (${results.length} matches)`,
      })

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

    } else if (name === 'edit_file') {
      workspace.editFile(a.path, a.target_content, a.replacement_content)
      session.changedFiles.push({ file_path: a.path, action: 'modified' })
      toolResult = `Successfully edited ${a.path}`
      logAndEmit({
        type: 'file_modified',
        message: `✏️  Surgically updated ${a.path}`,
      })

    } else if (name === 'delete_file') {
      workspace.deleteFile(a.path)
      session.changedFiles.push({ file_path: a.path, action: 'deleted' })
      toolResult = `Deleted ${a.path}`
      logAndEmit({
        type: 'file_deleted',
        message: `🗑️  Deleted ${a.path}`,
      })

    } else if (name === 'run_command') {
      const cmd = a.command as string
      const level = classifyCommand(cmd)

      if (level === 'BLOCKED') {
        toolResult = `BLOCKED: "${cmd}" is prohibited by security policy.`
        logAndEmit({ type: 'error', message: `🚫 Blocked dangerous command: ${cmd}` })

      } else if (level === 'APPROVAL') {
        logAndEmit({ type: 'approval_required', message: `⚠️  Approval requested for: ${cmd}` })
        const approved = await onApprovalNeeded(cmd, `Agent wants to execute command: ${cmd}`)

        if (!approved) {
          toolResult = `REJECTED: Developer rejected permission to run "${cmd}".`
          logAndEmit({ type: 'error', message: `❌ Developer rejected command: ${cmd}` })
        } else {
          logAndEmit({ type: 'command_started', message: `$ ${cmd}` })
          const r = await runCommand(cmd, workspace.root, taskId, (chunk, stream) => {
            logAndEmit({ type: 'command_output', message: chunk, metadata: { stream } })
          })
          toolResult = `exit=${r.exitCode}\n${r.stdout}\n${r.stderr}`
          logAndEmit({
            type: r.exitCode === 0 ? 'command_finished' : 'error',
            message: r.exitCode === 0 ? `✓ Finished with exit code 0` : `Process exited with code ${r.exitCode}`,
          })
        }
      } else {
        logAndEmit({ type: 'command_started', message: `$ ${cmd}` })
        const r = await runCommand(cmd, workspace.root, taskId, (chunk, stream) => {
          logAndEmit({ type: 'command_output', message: chunk, metadata: { stream } })
        })
        toolResult = `exit=${r.exitCode}\n${r.stdout}\n${r.stderr}`
        logAndEmit({
          type: r.exitCode === 0 ? 'command_finished' : 'error',
          message: r.exitCode === 0 ? `✓ Finished with exit code 0` : `Process exited with code ${r.exitCode}`,
        })
      }

    } else if (name === 'git_status') {
      toolResult = await git.status()
      logAndEmit({ type: 'command_finished', message: `🌿 Inspected git status` })

    } else if (name === 'git_diff') {
      toolResult = await git.diff()
      logAndEmit({ type: 'command_finished', message: `🔍 Checked git diff` })

    } else if (name === 'finish') {
      const summary = a.summary || 'Task completed successfully'
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
  session.isAborted = false

  const logAndEmit = (event: TaskEventPayload) => {
    console.log(chalk.cyan(`  ${event.message}`))
    onEvent(event)
  }

  const { provider, effectiveModel, fallbackNotice } = providerRegistry.getProviderForModel(session.model)
  if (fallbackNotice) {
    logAndEmit({ type: 'task_started', message: fallbackNotice })
  }

  const initialContext = workspace.getProjectContext()
  const gitStatusBefore = (await git.isRepo()) ? await git.status() : 'Not a git repo'

  const promptText = !isFollowUp
    ? `TASK: ${userMessage}

PROJECT ARCHITECTURE & CONTEXT:
- Framework: ${initialContext.framework}
- Language: ${initialContext.language}
- Package Manager: ${initialContext.packageManager}
- Scripts: ${Object.keys(initialContext.scripts).join(', ') || 'none'}
- Key Directories: ${initialContext.keyDirectories.join(', ') || 'root only'}

GIT STATUS (BEFORE WORK):
${gitStatusBefore}

Begin by inspecting the relevant files, formulate a plan, implement changes, verify with commands if needed, and call finish() with your summary.`
    : `FOLLOW-UP USER INSTRUCTION:
${userMessage}

CURRENT GIT STATUS:
${gitStatusBefore}

Please inspect or modify files as requested, run validation checks, and call finish() when complete.`

  logAndEmit({
    type: 'task_started',
    message: isFollowUp
      ? `🤖 [${effectiveModel}] Follow-up instruction: "${userMessage.slice(0, 70)}..."`
      : `🤖 [${effectiveModel}] Inspecting ${initialContext.framework} project...`,
  })

  let maxIterations = 30
  let finalSummary = ''

  try {
    if (provider.id === 'anthropic') {
      session.anthropicMessages.push({ role: 'user', content: promptText })

      while (maxIterations-- > 0) {
        if (session.isAborted) break

        const res = await provider.createMessage({
          model: effectiveModel,
          systemInstruction: SYSTEM_INSTRUCTION,
          messages: session.anthropicMessages,
          tools: toolDeclarations,
        })

        session.anthropicMessages.push({ role: 'assistant', content: res.rawContent })

        if (res.text) {
          logAndEmit({ type: 'agent_thinking', message: `🧠 ${res.text.slice(0, 160)}...` })
        }

        if (!res.toolCalls || res.toolCalls.length === 0) {
          finalSummary = res.text || 'Task completed'
          break
        }

        const toolResults: any[] = []
        for (const tc of res.toolCalls) {
          const { toolResult, isFinished, summary } = await executeSingleTool(
            tc.name,
            tc.args,
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

    } else if (provider.id === 'openai') {
      if (session.openaiMessages.length === 0) {
        session.openaiMessages.push({ role: 'system', content: SYSTEM_INSTRUCTION })
      }
      session.openaiMessages.push({ role: 'user', content: promptText })

      while (maxIterations-- > 0) {
        if (session.isAborted) break

        const res = await provider.createMessage({
          model: effectiveModel,
          systemInstruction: SYSTEM_INSTRUCTION,
          messages: session.openaiMessages,
          tools: toolDeclarations,
        })

        session.openaiMessages.push(res.rawContent)

        if (res.text) {
          logAndEmit({ type: 'agent_thinking', message: `🧠 ${res.text.slice(0, 160)}...` })
        }

        if (!res.toolCalls || res.toolCalls.length === 0) {
          finalSummary = res.text || 'Task completed'
          break
        }

        for (const tc of res.toolCalls) {
          const { toolResult, isFinished, summary } = await executeSingleTool(
            tc.name,
            tc.args,
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
      // Gemini provider
      session.geminiContents.push({ role: 'user', parts: [{ text: promptText }] })

      while (maxIterations-- > 0) {
        if (session.isAborted) break

        const res = await provider.createMessage({
          model: effectiveModel,
          systemInstruction: SYSTEM_INSTRUCTION,
          messages: session.geminiContents,
          tools: toolDeclarations,
        })

        session.geminiContents.push(res.rawContent)

        if (res.text && !res.text.startsWith('```json')) {
          logAndEmit({ type: 'agent_thinking', message: `🧠 ${res.text.slice(0, 160)}...` })
        }

        if (!res.toolCalls || res.toolCalls.length === 0) {
          finalSummary = res.text || 'Task completed'
          break
        }

        const functionResponses: any[] = []
        for (const tc of res.toolCalls) {
          const { toolResult, isFinished, summary } = await executeSingleTool(
            tc.name,
            tc.args,
            session,
            logAndEmit,
            onApprovalNeeded
          )
          if (isFinished) {
            return { result: summary || 'Task completed', files: session.changedFiles }
          }
          functionResponses.push({
            functionResponse: {
              name: tc.name,
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
