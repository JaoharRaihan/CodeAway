import chalk from 'chalk'
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

// Tool definitions for Gemini
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

const SYSTEM_INSTRUCTION = `You are CodeAway, an expert AI coding agent running directly on a developer's laptop.
You have been given a coding task to complete. Follow this workflow:
1. First INSPECT the project structure and relevant files using list_files and read_file.
2. Formulate a plan before making changes.
3. IMPLEMENT changes carefully with write_file, preserving existing code style.
4. RUN tests or validation commands if appropriate using run_command.
5. Call finish() when done with a clear summary of all changes made.

Always follow existing code patterns, naming conventions, and architecture.
Never modify files unrelated to the task.
Be precise, professional, and thorough.`

const MODEL_NAME = 'gemini-3.5-flash-lite'

export async function runAgentLoop(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { prompt, workspace, git, geminiApiKey, onEvent, onApprovalNeeded } = opts
  const changedFiles: AgentRunResult['files'] = []

  const logAndEmit = (event: TaskEventPayload) => {
    console.log(chalk.cyan(`  ${event.message}`))
    onEvent(event)
  }

  logAndEmit({ type: 'task_started', message: '🤖 Agent started — inspecting project...' })

  const fileList = workspace.listFiles().slice(0, 80).join('\n')
  const gitStatus = (await git.isRepo()) ? await git.status() : 'Not a git repo'

  const initialPrompt = `TASK: ${prompt}

PROJECT FILES:
${fileList}

GIT STATUS:
${gitStatus}

Begin by inspecting the relevant files, implement the solution, and call finish() when complete.`

  const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [
    { role: 'user', parts: [{ text: initialPrompt }] },
  ]

  let maxIterations = 30
  let finalSummary = ''

  while (maxIterations-- > 0) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${geminiApiKey}`

    const requestBody = {
      contents,
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      tools: [{ functionDeclarations: toolDeclarations }],
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    const data: any = await res.json()

    if (!res.ok) {
      throw new Error(data.error?.message || `Gemini API error: ${res.statusText}`)
    }

    const candidate = data.candidates?.[0]
    if (!candidate || !candidate.content) {
      break
    }

    // Append model's response to history (preserving thought signatures & functionCall IDs)
    contents.push(candidate.content)

    const parts = candidate.content.parts || []
    const functionCalls = parts.filter((p: any) => p.functionCall)

    // Log thoughts / text
    for (const part of parts) {
      if (part.text && !part.text.startsWith('```json')) {
        logAndEmit({ type: 'task_started', message: `🧠 ${part.text.slice(0, 160)}...` })
      }
    }

    if (functionCalls.length === 0) {
      // Model returned text response without calling tools
      finalSummary = parts.map((p: any) => p.text).filter(Boolean).join('\n')
      break
    }

    // Execute each function call and collect responses
    const functionResponses: any[] = []

    for (const fcPart of functionCalls) {
      const { name, args } = fcPart.functionCall
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
          changedFiles.push({ file_path: a.path, action })
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
          finalSummary = a.summary || 'Task completed'
          logAndEmit({ type: 'task_completed', message: `🎉 ${finalSummary}` })

          for (const f of changedFiles) {
            try { f.diff = await git.diff([f.file_path]) } catch { /* no diff */ }
          }
          return { result: finalSummary, files: changedFiles }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toolResult = `ERROR: ${msg}`
        logAndEmit({ type: 'error', message: `❌ Error in ${name}: ${msg}` })
      }

      functionResponses.push({
        functionResponse: {
          name,
          response: { result: toolResult },
        },
      })
    }

    // Append function responses as role: "user"
    contents.push({
      role: 'user',
      parts: functionResponses,
    })
  }

  return { result: finalSummary || 'Task completed', files: changedFiles }
}
