import * as path from 'path'
import chalk from 'chalk'
import { WorkspaceManager } from '../core/workspace'
import { classifyCommand, runCommand, killActiveTaskProcess } from '../core/terminal'
import { GitManager } from '../core/git'
import { providerRegistry } from './providers/registry'
import { ToolDeclaration } from './providers/base'
import { classifyIntent } from './intent'
import type { TaskEventPayload, FileAction, ActionCardData } from '@codeaway/shared'

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
  inspectedFiles: string[]
  isRunning: boolean
  isAborted: boolean
  isPaused: boolean
  pauseResolver?: () => void
  followUpQueue: Array<{ message: string; model?: string }>
  lastTestResult?: { command: string; exitCode: number; passed: boolean } | null
  consecutiveFailures: Map<string, number>
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
    description: 'Run a shell command or test suite in the project directory',
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
    description: 'Check git status of modified, untracked, and staged files',
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

const SYSTEM_INSTRUCTION = `You are CodeAway, a senior AI software engineer running on the developer's Mac, controlled from their phone.

Your Persona and Communication Standards:
- Senior software engineer: calm, concise, professional, and honest.
- Speak naturally with the developer like a pair-programming partner in Slack.
- NEVER talk like a robotic tool dispatcher (e.g. do NOT say "Executing tool read_file on target...").
- When inspecting or working, talk to the user concisely:
  * "I'll trace the OTP flow first and inspect where the button handler breaks."
  * "I found the issue in LoginScreen.tsx. The loading state is preventing the handler from firing."
  * "I've made the targeted fix. Running the tests now."
- Always be honest:
  * If a test failed, tell them why.
  * If you didn't test something, explicitly say so.
  * If you cannot find the bug yet, explain what you tried and what you need next.
- When you are ready to modify files, make targeted, minimal changes. Never rewrite whole files unless necessary.
- Honest Verification & Recovery Standards:
  * NEVER claim a task is completed or that tests passed if tests failed or were not run.
  * If a test command failed, you must either fix the issue until tests pass, or honestly describe the failure in your finish summary.
  * If an edit_file fails because target_content was not found, inspect the file with read_file to examine exact line numbers and whitespace before retrying.
  * Never repeatedly run the exact same failing tool call.
  * If you didn't test something, explicitly say so.
- When done, call finish(summary) with a clear human explanation of what was fixed and verified.`

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
    inspectedFiles: [],
    isRunning: false,
    isAborted: false,
    isPaused: false,
    followUpQueue: [],
    lastTestResult: null,
    consecutiveFailures: new Map(),
  }
}

export function pauseTaskSession(session: TaskSession): void {
  session.isPaused = true
}

export function resumeTaskSession(session: TaskSession): void {
  session.isPaused = false
  if (session.pauseResolver) {
    session.pauseResolver()
    session.pauseResolver = undefined
  }
}

export function abortTaskSession(session: TaskSession): void {
  session.isAborted = true
  session.isRunning = false
  session.isPaused = false
  if (session.pauseResolver) {
    session.pauseResolver()
    session.pauseResolver = undefined
  }
  session.followUpQueue = []
  killActiveTaskProcess(session.taskId)
}

export async function waitIfPaused(session: TaskSession): Promise<void> {
  if (session.isPaused && !session.isAborted) {
    await new Promise<void>((resolve) => {
      session.pauseResolver = resolve
    })
  }
}

/**
 * Streams assistant text chunk-by-chunk for a natural typing experience on mobile
 */
async function streamAssistantMessage(
  text: string,
  logAndEmit: (event: TaskEventPayload) => void
): Promise<void> {
  if (!text || !text.trim()) return

  // Break into natural word groups
  const words = text.split(/(\s+)/)
  let accumulated = ''
  for (let i = 0; i < words.length; i += 4) {
    const slice = words.slice(i, i + 4).join('')
    accumulated += slice
    logAndEmit({
      type: 'assistant_message_chunk',
      message: slice,
      metadata: { text: accumulated, is_final: i + 4 >= words.length },
    })
    // Brief realistic cadence
    await new Promise((r) => setTimeout(r, 20))
  }

  logAndEmit({
    type: 'assistant_message',
    message: text.trim(),
  })
}

export async function executeSingleTool(
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
  const callKey = `${name}:${JSON.stringify(a)}`
  let toolResult = ''

  try {
    if (name === 'get_project_context') {
      const ctx = workspace.getProjectContext()
      toolResult = JSON.stringify(ctx, null, 2)

      const card: ActionCardData = {
        id: `ctx_${Date.now()}`,
        kind: 'inspection',
        title: 'Inspecting Project Context',
        summary: `${ctx.framework} (${ctx.language}), ${ctx.packageManager}`,
        status: 'success',
      }
      logAndEmit({
        type: 'action_card',
        message: card.summary,
        metadata: card as any,
      })

    } else if (name === 'list_files') {
      const files = workspace.listFiles(a.subdir)
      toolResult = files.slice(0, 100).join('\n')

      const card: ActionCardData = {
        id: `list_${Date.now()}`,
        kind: 'inspection',
        title: `Listed files ${a.subdir ? `in ${a.subdir}` : 'in workspace'}`,
        summary: `${files.length} files`,
        status: 'success',
        files: files.slice(0, 15),
      }
      logAndEmit({
        type: 'action_card',
        message: card.title,
        metadata: card as any,
      })

    } else if (name === 'search_code') {
      const results = workspace.searchCode(a.query, a.subdir)
      toolResult = results.length > 0
        ? results.map((r) => `${r.file}:${r.line}: ${r.text}`).join('\n')
        : `No matches found for "${a.query}"`

      const card: ActionCardData = {
        id: `search_${Date.now()}`,
        kind: 'inspection',
        title: `Search code: "${a.query}"`,
        summary: `${results.length} matches found`,
        status: 'success',
        files: Array.from(new Set(results.map((r) => r.file))).slice(0, 10),
      }
      logAndEmit({
        type: 'action_card',
        message: card.title,
        metadata: card as any,
      })

    } else if (name === 'read_file') {
      toolResult = workspace.readFile(a.path)
      if (!session.inspectedFiles.includes(a.path)) {
        session.inspectedFiles.push(a.path)
      }

      const card: ActionCardData = {
        id: `read_${Date.now()}`,
        kind: 'inspection',
        title: `Inspected ${path.basename(a.path)}`,
        summary: `${session.inspectedFiles.length} file${session.inspectedFiles.length > 1 ? 's' : ''} inspected`,
        status: 'success',
        files: [a.path],
      }
      logAndEmit({
        type: 'action_card',
        message: card.title,
        metadata: card as any,
      })

    } else if (name === 'write_file') {
      const fileExists = workspace.fileExists(a.path)
      if (fileExists) {
        logAndEmit({ type: 'approval_required', message: `⚠️ Approval requested to overwrite existing file: ${a.path}` })
        const approved = await onApprovalNeeded(`overwrite_file ${a.path}`, `Agent wants to overwrite existing file: ${a.path}`)
        if (!approved) {
          toolResult = `REJECTED: Developer rejected permission to overwrite "${a.path}".`
          logAndEmit({
            type: 'action_card',
            message: `Overwrite rejected by developer: ${path.basename(a.path)}`,
            metadata: {
              id: `write_${Date.now()}`,
              kind: 'edit',
              title: `Overwrite ${path.basename(a.path)}`,
              summary: 'Rejected by developer',
              status: 'failed',
              files: [a.path],
            } as ActionCardData as any,
          })
        } else {
          workspace.writeFile(a.path, a.content)
          session.changedFiles.push({ file_path: a.path, action: 'modified' })

          const card: ActionCardData = {
            id: `write_${Date.now()}`,
            kind: 'edit',
            title: `Updated ${path.basename(a.path)}`,
            summary: 'Overwritten with approval',
            status: 'success',
            files: [a.path],
          }
          logAndEmit({
            type: 'action_card',
            message: card.title,
            metadata: card as any,
          })
          toolResult = `File "${a.path}" updated.`
        }
      } else {
        workspace.writeFile(a.path, a.content)
        session.changedFiles.push({ file_path: a.path, action: 'created' })

        const card: ActionCardData = {
          id: `write_${Date.now()}`,
          kind: 'edit',
          title: `Created ${path.basename(a.path)}`,
          summary: 'New file created',
          status: 'success',
          files: [a.path],
        }
        logAndEmit({
          type: 'action_card',
          message: card.title,
          metadata: card as any,
        })
        toolResult = `File "${a.path}" created.`
      }

    } else if (name === 'edit_file') {
      const isPackageJson = path.basename(a.path) === 'package.json'
      if (isPackageJson) {
        logAndEmit({ type: 'approval_required', message: `⚠️ Approval requested to modify package manifest: ${a.path}` })
        const approved = await onApprovalNeeded(`edit_file ${a.path}`, `Agent wants to modify project manifest: ${a.path}`)
        if (!approved) {
          toolResult = `REJECTED: Developer rejected permission to modify "${a.path}".`
          logAndEmit({
            type: 'action_card',
            message: `Manifest edit rejected: ${path.basename(a.path)}`,
            metadata: {
              id: `edit_${Date.now()}`,
              kind: 'edit',
              title: `Edit ${path.basename(a.path)}`,
              summary: 'Rejected by developer',
              status: 'failed',
              files: [a.path],
            } as ActionCardData as any,
          })
        } else {
          workspace.editFile(a.path, a.target_content, a.replacement_content)
          session.changedFiles.push({ file_path: a.path, action: 'modified' })

          const card: ActionCardData = {
            id: `edit_${Date.now()}`,
            kind: 'edit',
            title: `Changed ${path.basename(a.path)}`,
            summary: 'Package manifest updated with approval',
            status: 'success',
            files: [a.path],
            diff: a.replacement_content,
          }
          logAndEmit({
            type: 'action_card',
            message: card.title,
            metadata: card as any,
          })
          toolResult = `File "${a.path}" successfully edited.`
        }
      } else {
        workspace.editFile(a.path, a.target_content, a.replacement_content)
        session.changedFiles.push({ file_path: a.path, action: 'modified' })

        const card: ActionCardData = {
          id: `edit_${Date.now()}`,
          kind: 'edit',
          title: `Changed ${path.basename(a.path)}`,
          summary: 'Targeted surgical fix applied',
          status: 'success',
          files: [a.path],
          diff: a.replacement_content,
        }
        logAndEmit({
          type: 'action_card',
          message: card.title,
          metadata: card as any,
        })
        toolResult = `File "${a.path}" successfully edited.`
      }

    } else if (name === 'delete_file') {
      logAndEmit({ type: 'approval_required', message: `⚠️ Approval requested to delete file: ${a.path}` })
      const approved = await onApprovalNeeded(`delete_file ${a.path}`, `Agent wants to delete file: ${a.path}`)
      if (!approved) {
        toolResult = `REJECTED: Developer rejected permission to delete file "${a.path}".`
        logAndEmit({
          type: 'action_card',
          message: `Delete rejected by developer: ${path.basename(a.path)}`,
          metadata: {
            id: `del_${Date.now()}`,
            kind: 'edit',
            title: `Delete ${path.basename(a.path)}`,
            summary: 'Rejected by developer',
            status: 'failed',
            files: [a.path],
          } as ActionCardData as any,
        })
      } else {
        workspace.deleteFile(a.path)
        session.changedFiles.push({ file_path: a.path, action: 'deleted' })

        const card: ActionCardData = {
          id: `del_${Date.now()}`,
          kind: 'edit',
          title: `Deleted ${path.basename(a.path)}`,
          summary: 'Removed from project with approval',
          status: 'success',
          files: [a.path],
        }
        logAndEmit({
          type: 'action_card',
          message: card.title,
          metadata: card as any,
        })
        toolResult = `File "${a.path}" deleted.`
      }

    } else if (name === 'run_command') {
      const cmd = a.command as string
      const level = classifyCommand(cmd)
      const isTest = /test|jest|vitest|check|tsc/i.test(cmd)

      if (level === 'BLOCKED') {
        toolResult = `BLOCKED: "${cmd}" is prohibited by security policy.`
        logAndEmit({
          type: 'action_card',
          message: `Blocked dangerous command: ${cmd}`,
          metadata: {
            id: `cmd_${Date.now()}`,
            kind: 'command',
            title: cmd,
            summary: 'Blocked by security policy',
            status: 'failed',
          } as ActionCardData as any,
        })

      } else if (level === 'APPROVAL') {
        logAndEmit({ type: 'approval_required', message: `⚠️ Approval requested for: ${cmd}` })
        const approved = await onApprovalNeeded(cmd, `Agent wants to execute command: ${cmd}`)

        if (!approved) {
          toolResult = `REJECTED: Developer rejected permission to run "${cmd}".`
          logAndEmit({
            type: 'action_card',
            message: `Command rejected by developer: ${cmd}`,
            metadata: {
              id: `cmd_${Date.now()}`,
              kind: isTest ? 'test' : 'command',
              title: cmd,
              summary: 'Rejected by developer',
              status: 'failed',
            } as ActionCardData as any,
          })
        } else {
          const r = await runCommand(cmd, workspace.root, taskId, (chunk, stream) => {
            logAndEmit({ type: 'command_output', message: chunk, metadata: { stream } })
          })
          toolResult = `exit=${r.exitCode}\n${r.stdout}\n${r.stderr}`
          const passed = r.exitCode === 0
          if (isTest) {
            session.lastTestResult = { command: cmd, exitCode: r.exitCode, passed }
          }
          logAndEmit({
            type: 'action_card',
            message: `${cmd} · ${passed ? '✓ Passed' : 'Failed'}`,
            metadata: {
              id: `cmd_${Date.now()}`,
              kind: isTest ? 'test' : 'command',
              title: cmd,
              summary: passed ? '✓ Passed' : `Exit code ${r.exitCode}`,
              status: passed ? 'success' : 'failed',
              command: cmd,
              output: (r.stdout + '\n' + r.stderr).trim(),
            } as ActionCardData as any,
          })
        }
      } else {
        const r = await runCommand(cmd, workspace.root, taskId, (chunk, stream) => {
          logAndEmit({ type: 'command_output', message: chunk, metadata: { stream } })
        })
        toolResult = `exit=${r.exitCode}\n${r.stdout}\n${r.stderr}`
        const passed = r.exitCode === 0
        if (isTest) {
          session.lastTestResult = { command: cmd, exitCode: r.exitCode, passed }
        }
        logAndEmit({
          type: 'action_card',
          message: `${cmd} · ${passed ? '✓ Passed' : 'Failed'}`,
          metadata: {
            id: `cmd_${Date.now()}`,
            kind: isTest ? 'test' : 'command',
            title: cmd,
            summary: passed ? '✓ Passed' : `Exit code ${r.exitCode}`,
            status: passed ? 'success' : 'failed',
            command: cmd,
            output: (r.stdout + '\n' + r.stderr).trim(),
          } as ActionCardData as any,
        })
      }

    } else if (name === 'git_status') {
      toolResult = await git.status()
      logAndEmit({
        type: 'action_card',
        message: 'Git status verified',
        metadata: {
          id: `git_${Date.now()}`,
          kind: 'inspection',
          title: 'Git Status',
          summary: 'Checked current branch and status',
          status: 'success',
          output: toolResult,
        } as ActionCardData as any,
      })

    } else if (name === 'git_diff') {
      toolResult = await git.diff()
      logAndEmit({
        type: 'action_card',
        message: 'Git diff inspected',
        metadata: {
          id: `diff_${Date.now()}`,
          kind: 'inspection',
          title: 'Git Diff',
          summary: 'Examined workspace diffs',
          status: 'success',
          diff: toolResult,
        } as ActionCardData as any,
      })

    } else if (name === 'finish') {
      const summary = a.summary || 'Task completed successfully'

      // Honest Verification Guard:
      // If tests were run and the last test command failed, prevent claiming success
      if (session.lastTestResult && !session.lastTestResult.passed) {
        const mentionsFailure = /fail|error|broken|unresolved|warn/i.test(summary)
        if (!mentionsFailure) {
          toolResult = `HONESTY GUARD: The last verification command ("${session.lastTestResult.command}") failed with exit code ${session.lastTestResult.exitCode}. You must either fix the issue and run tests until they pass, or explicitly describe the test failure in your finish summary so the developer is informed honestly.`
          logAndEmit({
            type: 'error',
            message: `⚠️ Honesty check: prevented claiming completion while "${session.lastTestResult.command}" is failing.`,
          })
          return { toolResult, isFinished: false }
        }
      }

      await streamAssistantMessage(summary, logAndEmit)

      for (const f of session.changedFiles) {
        try { f.diff = await git.diff([f.file_path]) } catch { /* no diff */ }
      }
      return { toolResult: 'Finished', isFinished: true, summary }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    let recoveryHint = ''
    if (name === 'edit_file' && msg.includes('Target content not found')) {
      recoveryHint = ` Actionable recovery: Run read_file("${a.path}") to inspect the exact line numbers and whitespace before retrying the edit.`
    } else if (name === 'read_file' && (msg.includes('ENOENT') || msg.includes('does not exist'))) {
      recoveryHint = ` Actionable recovery: Use search_code or list_files to confirm the file path.`
    }

    toolResult = `ERROR: ${msg}.${recoveryHint}`
    logAndEmit({ type: 'error', message: `Error in ${name}: ${msg}` })
  }

  // Loop detection & failure tracking
  if (toolResult.startsWith('ERROR:') || toolResult.startsWith('BLOCKED:') || toolResult.startsWith('REJECTED:')) {
    const fails = (session.consecutiveFailures.get(callKey) || 0) + 1
    session.consecutiveFailures.set(callKey, fails)
    if (fails >= 3) {
      toolResult += `\n[LOOP WARNING]: You have attempted "${name}" with these exact arguments ${fails} times and it has failed repeatedly. Do not repeat this exact call. Inspect the error and take a different approach.`
    }
  } else {
    session.consecutiveFailures.delete(callKey)
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

  // 1. CLASSIFY INTENT
  const { intent, reason } = await classifyIntent(userMessage, {
    hasActiveTask: isFollowUp || session.changedFiles.length > 0 || session.geminiContents.length > 0,
    provider,
    model: effectiveModel,
  })

  logAndEmit({
    type: 'intent_classified',
    message: `Mode: ${intent.toUpperCase()} (${reason})`,
    metadata: { intent, reason },
  })

  // 2. HANDLE CONTROL COMMANDS (Stop / Pause / Resume)
  if (intent === 'control') {
    abortTaskSession(session)
    const stopMsg = 'Stopped. I have paused all operations and will not touch any files.'
    await streamAssistantMessage(stopMsg, logAndEmit)
    return { result: stopMsg, files: session.changedFiles }
  }

  // 3. HANDLE CHAT OR DISCUSSION (Pure conversational response — NO file tools called!)
  if (intent === 'chat' || intent === 'discussion') {
    const systemPrompt = `You are CodeAway, a senior AI software engineer conversing with a developer via their mobile phone.
The user is having a technical discussion or asking a conceptual question.
Give a clear, insightful, senior-level response. Be concise, direct, and pragmatic.
Do NOT attempt to run code tools or modify files.`

    const promptText = `Developer question: "${userMessage}"`
    let reply = ''

    if (provider.id === 'anthropic') {
      const res = await provider.createMessage({
        model: effectiveModel,
        systemInstruction: systemPrompt,
        messages: [{ role: 'user', content: promptText }],
        tools: [],
      })
      reply = res.text || ''
    } else if (provider.id === 'openai') {
      const res = await provider.createMessage({
        model: effectiveModel,
        systemInstruction: systemPrompt,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptText },
        ],
        tools: [],
      })
      reply = res.text || ''
    } else {
      // Gemini
      const res = await provider.createMessage({
        model: effectiveModel,
        systemInstruction: systemPrompt,
        messages: [{ role: 'user', parts: [{ text: promptText }] }],
        tools: [],
      })
      reply = res.text || ''
    }

    await streamAssistantMessage(reply || "I've noted your question. Let me know how you'd like to proceed!", logAndEmit)
    return { result: reply, files: session.changedFiles }
  }

  // 4. HANDLE ACTION OR FOLLOW-UP (Full autonomous loop with Senior Engineer persona)
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

GIT STATUS:
${gitStatusBefore}

Senior Engineer Guidelines:
- Begin with a brief, natural statement to the user about what you are going to trace or investigate.
- Inspect relevant files, diagnose the issue, and explain findings concisely.
- Make targeted, minimal edits.
- Run tests or validation checks to verify.
- Call finish(summary) when verified.`
    : `FOLLOW-UP USER MESSAGE:
${userMessage}

CURRENT GIT STATUS:
${gitStatusBefore}

FILES PREVIOUSLY MODIFIED:
${session.changedFiles.map((f) => `${f.action}: ${f.file_path}`).join('\n') || 'None yet'}

Senior Engineer Guidelines:
- If the developer is asking a question about prior changes, explain your reasoning clearly and honestly.
- If asking for further work, continue thoughtfully and verify.`

  let maxIterations = 30
  let finalSummary = ''

  try {
    if (provider.id === 'anthropic') {
      session.anthropicMessages.push({ role: 'user', content: promptText })

      while (maxIterations-- > 0) {
        await waitIfPaused(session)
        if (session.isAborted) break

        const res = await provider.createMessage({
          model: effectiveModel,
          systemInstruction: SYSTEM_INSTRUCTION,
          messages: session.anthropicMessages,
          tools: toolDeclarations,
        })

        session.anthropicMessages.push({ role: 'assistant', content: res.rawContent })

        if (res.text && res.text.trim()) {
          await streamAssistantMessage(res.text, logAndEmit)
        }

        if (!res.toolCalls || res.toolCalls.length === 0) {
          finalSummary = res.text || 'Task completed'
          break
        }

        const toolResults: any[] = []
        for (const tc of res.toolCalls) {
          await waitIfPaused(session)
          if (session.isAborted) break

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
        await waitIfPaused(session)
        if (session.isAborted) break

        const res = await provider.createMessage({
          model: effectiveModel,
          systemInstruction: SYSTEM_INSTRUCTION,
          messages: session.openaiMessages,
          tools: toolDeclarations,
        })

        session.openaiMessages.push(res.rawContent)

        if (res.text && res.text.trim()) {
          await streamAssistantMessage(res.text, logAndEmit)
        }

        if (!res.toolCalls || res.toolCalls.length === 0) {
          finalSummary = res.text || 'Task completed'
          break
        }

        for (const tc of res.toolCalls) {
          await waitIfPaused(session)
          if (session.isAborted) break

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
        await waitIfPaused(session)
        if (session.isAborted) break

        const res = await provider.createMessage({
          model: effectiveModel,
          systemInstruction: SYSTEM_INSTRUCTION,
          messages: session.geminiContents,
          tools: toolDeclarations,
        })

        session.geminiContents.push(res.rawContent)

        if (res.text && res.text.trim() && !res.text.startsWith('```json')) {
          await streamAssistantMessage(res.text, logAndEmit)
        }

        if (!res.toolCalls || res.toolCalls.length === 0) {
          finalSummary = res.text || 'Task completed'
          break
        }

        const functionResponses: any[] = []
        for (const tc of res.toolCalls) {
          await waitIfPaused(session)
          if (session.isAborted) break

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
