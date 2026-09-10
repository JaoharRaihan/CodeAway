import { GoogleGenerativeAI } from '@google/generative-ai'
import { WorkspaceManager } from '../core/workspace'
import { classifyCommand, runCommand } from '../core/terminal'
import { GitManager } from '../core/git'
import type { TaskEventPayload, FileAction } from '@codeaway/shared'

export interface AgentRunOptions {
  taskId: string
  userId: string
  prompt: string
  workspace: WorkspaceManager
  git: GitManager
  geminiApiKey: string
  onEvent: (event: TaskEventPayload) => void
  onApprovalNeeded: (command: string, reason: string) => Promise<boolean>
}

export interface AgentRunResult {
  result: string
  files: Array<{ file_path: string; action: FileAction; diff?: string }>
}

// ─── Tool definitions (string literals — no SchemaType import needed) ─────────
const tools = [
  {
    functionDeclarations: [
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
    ],
  },
]

// ─── Agent loop ───────────────────────────────────────────────────────────────
export async function runAgentLoop(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { prompt, workspace, git, geminiApiKey, onEvent, onApprovalNeeded } = opts
  const changedFiles: AgentRunResult['files'] = []

  const genAI = new GoogleGenerativeAI(geminiApiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    systemInstruction: `You are CodeAway, an expert AI coding agent running on a developer's laptop.
You have been given a coding task to complete. You must:
1. First INSPECT the project structure and relevant files
2. Create an internal PLAN before making changes
3. IMPLEMENT changes carefully, one file at a time
4. RUN tests or type checks to VERIFY your work
5. FIX any errors found
6. Call finish() when done with a clear summary

Always follow existing code patterns, naming conventions, and architecture.
Never modify files unrelated to the task.
Be precise and professional.`,
  })

  const chat = model.startChat()

  onEvent({ type: 'task_started', message: '🤖 Agent started — inspecting project...' })

  const fileList = workspace.listFiles().slice(0, 80).join('\n')
  const gitStatus = (await git.isRepo()) ? await git.status() : 'Not a git repo'

  const initialMessage = `TASK: ${prompt}\n\nPROJECT FILES:\n${fileList}\n\nGIT STATUS:\n${gitStatus}\n\nBegin by inspecting key files, then plan and implement the task.`

  let response = await chat.sendMessage(initialMessage)
  let maxIterations = 25
  let finalSummary = ''

  while (maxIterations-- > 0) {
    const candidate = response.response.candidates?.[0]
    if (!candidate) break

    const parts = candidate.content.parts
    let hasToolCall = false

    for (const part of parts) {
      if (part.text) {
        onEvent({ type: 'task_started', message: `🧠 ${part.text.slice(0, 200)}` })
      }

      if (part.functionCall) {
        hasToolCall = true
        const { name, args } = part.functionCall
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = args as any
        let toolResult = ''

        try {
          if (name === 'list_files') {
            const files = workspace.listFiles(a.subdir)
            toolResult = files.join('\n')
            onEvent({ type: 'file_read', message: `📁 Listed ${files.length} files` })

          } else if (name === 'read_file') {
            toolResult = workspace.readFile(a.path as string)
            onEvent({ type: 'file_read', message: `📄 Reading ${a.path}` })

          } else if (name === 'write_file') {
            const isNew = !workspace.fileExists(a.path as string)
            workspace.writeFile(a.path as string, a.content as string)
            const action: FileAction = isNew ? 'created' : 'modified'
            changedFiles.push({ file_path: a.path as string, action })
            toolResult = `File ${action}: ${a.path}`
            onEvent({ type: 'file_modified', message: `✏️  ${action === 'created' ? 'Created' : 'Modified'} ${a.path}` })

          } else if (name === 'run_command') {
            const cmd = a.command as string
            const level = classifyCommand(cmd)

            if (level === 'BLOCKED') {
              toolResult = `BLOCKED: "${cmd}" is not allowed`
              onEvent({ type: 'error', message: `🚫 Blocked: ${cmd}` })
            } else if (level === 'APPROVAL') {
              onEvent({ type: 'approval_required', message: `⚠️  Approval needed: ${cmd}` })
              const approved = await onApprovalNeeded(cmd, 'Agent wants to run this command')
              if (!approved) {
                toolResult = `REJECTED: User rejected "${cmd}"`
              } else {
                onEvent({ type: 'command_started', message: `▶️  Running: ${cmd}` })
                const r = await runCommand(cmd, workspace.root)
                toolResult = `exit=${r.exitCode}\n${r.stdout}\n${r.stderr}`
                onEvent({ type: 'command_finished', message: `✅ Done: ${cmd}` })
              }
            } else {
              onEvent({ type: 'command_started', message: `▶️  Running: ${cmd}` })
              const r = await runCommand(cmd, workspace.root)
              toolResult = `exit=${r.exitCode}\n${r.stdout}\n${r.stderr}`
              onEvent({
                type: r.exitCode === 0 ? 'command_finished' : 'error',
                message: r.exitCode === 0 ? `✅ Done: ${cmd}` : `❌ Failed: ${cmd}\n${r.stderr.slice(0, 300)}`,
              })
            }

          } else if (name === 'git_status') {
            toolResult = await git.status()

          } else if (name === 'git_diff') {
            toolResult = await git.diff()

          } else if (name === 'finish') {
            finalSummary = a.summary as string
            onEvent({ type: 'task_completed', message: `✅ ${finalSummary}` })
            for (const f of changedFiles) {
              try { f.diff = await git.diff([f.file_path]) } catch { /* no diff */ }
            }
            return { result: finalSummary, files: changedFiles }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          toolResult = `ERROR: ${msg}`
          onEvent({ type: 'error', message: `❌ Tool error: ${msg}` })
        }

        response = await chat.sendMessage([
          { functionResponse: { name, response: { result: toolResult } } },
        ])
        break
      }
    }

    if (!hasToolCall) {
      finalSummary = parts.find((p) => p.text)?.text ?? 'Task completed'
      break
    }
  }

  onEvent({ type: 'task_completed', message: '✅ Task completed' })
  return { result: finalSummary || 'Task completed', files: changedFiles }
}
