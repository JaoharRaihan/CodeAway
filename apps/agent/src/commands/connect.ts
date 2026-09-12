import chalk from 'chalk'
import prompts from 'prompts'
import ora from 'ora'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { io as ioClient, Socket } from 'socket.io-client'
import { api } from '../core/api'
import { getConfig, saveConfig, isAuthenticated } from '../core/config'
import { WorkspaceManager } from '../core/workspace'
import { GitManager } from '../core/git'
import {
  createTaskSession,
  runSessionTurn,
  abortTaskSession,
  pauseTaskSession,
  resumeTaskSession,
  type TaskSession,
} from '../ai/runner'
import { providerRegistry } from '../ai/providers/registry'
import type { ServerToAgentEvents, AgentToServerEvents } from '@codeaway/shared'

// pending approval resolvers — keyed by approvalId, tracking taskId and resolve callback
interface PendingApprovalEntry {
  taskId: string
  resolve: (approved: boolean) => void
}
const pendingApprovals = new Map<string, PendingApprovalEntry>()

export async function connectCommand(opts: { workspace?: string; url?: string }) {
  if (opts.url) {
    saveConfig({ apiUrl: opts.url })
  }

  if (!isAuthenticated()) {
    console.log(chalk.red('❌ Not logged in. Run `codeaway login` first.'))
    process.exit(1)
  }

  const config = getConfig()

  // ── 1. Workspace ────────────────────────────────────────────────────────────
  let rawWs = opts.workspace ?? config.workspace
  if (!rawWs) {
    const { ws } = await prompts({
      type: 'text',
      name: 'ws',
      message: 'Which folder should the agent have access to?',
      initial: process.cwd(),
    })
    rawWs = ws
  }
  const workspacePath: string = path.resolve(rawWs || process.cwd())

  // ── 2. Gemini API key ────────────────────────────────────────────────────────
  let geminiApiKey = config.geminiApiKey
  if (!geminiApiKey) {
    const { key } = await prompts({
      type: 'password',
      name: 'key',
      message: 'Enter your Gemini API key (get one at aistudio.google.com):',
    })
    geminiApiKey = key
  }

  saveConfig({ workspace: workspacePath, geminiApiKey })

  // ── 3. Register device ──────────────────────────────────────────────────────
  let deviceId = config.deviceId
  if (!deviceId) {
    const spinner = ora('Registering device...').start()
    try {
      const res = await api.post('/devices', {
        name: os.hostname(),
        platform: os.platform(),
        hostname: os.hostname(),
        agent_version: '0.1.0',
      })
      deviceId = res.data._id
      saveConfig({ deviceId })
      spinner.succeed(`Device registered: ${chalk.cyan(os.hostname())}`)
    } catch (err: any) {
      spinner.fail('Failed to register device')
      console.error(err.response?.data ?? err.message)
      process.exit(1)
    }
  }

  // ── 4. Register project in backend ─────────────────────────────────────────
  const spinner = ora('Connecting to backend...').start()
  try {
    await api.post('/projects', {
      device_id: deviceId,
      name: path.basename(workspacePath),
      path: workspacePath,
    }).catch(() => { /* project may already exist */ })
  } catch { /* ignore */ }

  // ── 5. Connect Socket.IO ────────────────────────────────────────────────────
  const socket: Socket<ServerToAgentEvents, AgentToServerEvents> = ioClient(config.apiUrl!, {
    auth: { token: config.token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 3000,
  })

  const workspace = new WorkspaceManager(workspacePath)
  const git = new GitManager(workspacePath)

  socket.on('connect', () => {
    spinner.succeed(chalk.green(`✅ Connected to CodeAway backend`))
    console.log(chalk.dim(`   Workspace : ${workspacePath}`))
    console.log(chalk.dim(`   Device    : ${os.hostname()} (${deviceId})`))
    console.log(chalk.cyan('\n⏳ Waiting for tasks from your phone...\n'))

    socket.emit('agent:connect', {
      deviceId: deviceId!,
      token: config.token!,
      availableModels: providerRegistry.getAvailableModels(),
      currentProject: path.basename(workspacePath),
      workspacePath,
      workspaces: [
        { name: path.basename(workspacePath), path: workspacePath },
      ],
      version: '0.1.0',
    })
  })

  socket.on('disconnect', () => {
    console.log(chalk.yellow('\n⚠️  Disconnected — reconnecting...'))
  })

  // Active task conversation sessions
  const taskSessions = new Map<string, TaskSession>()

  const executeTurn = async (session: TaskSession, message: string, isFollowUp: boolean) => {
    const { taskId, userId } = session
    const emit = (event: any) => {
      socket.emit('task:event:emit', { taskId, userId, event })
    }

    const onApprovalNeeded = async (command: string, reason: string): Promise<boolean> => {
      const res = await api.post('/approvals', { task_id: taskId, command, reason })
      const approvalId = res.data._id

      socket.emit('approval:request', { taskId, userId, approvalId, command, reason })

      // Server-authoritative: wait until developer explicitly responds or task is aborted
      return new Promise((resolve) => {
        pendingApprovals.set(approvalId, { taskId, resolve })
      })
    }

    try {
      const result = await runSessionTurn(
        session,
        message,
        isFollowUp,
        emit,
        onApprovalNeeded
      )

      socket.emit('task:complete', {
        taskId,
        userId,
        result: result.result,
        files: result.files,
      })
    } catch (err: any) {
      emit({ type: 'error', message: `❌ Agent error: ${err.message}` })
      socket.emit('task:complete', {
        taskId,
        userId,
        result: `Failed: ${err.message}`,
        files: [],
      })
    } finally {
      // Process next queued follow-up if any
      if (session.followUpQueue.length > 0) {
        const next = session.followUpQueue.shift()!
        if (next.model) session.model = next.model
        executeTurn(session, next.message, true)
      }
    }
  }

  const anthropicApiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY
  const openaiApiKey = config.openaiApiKey || process.env.OPENAI_API_KEY

  // ── 6. Handle incoming tasks ────────────────────────────────────────────────
  socket.on('task:new', async ({ taskId, projectId, prompt, userId, model }) => {
    if (taskId === 'CANCELLED') return
    console.log(chalk.bold.cyan(`\n📨 New task received: ${taskId} [${model || 'gemini-3.5-flash'}]`))
    console.log(chalk.dim(`   ${prompt.slice(0, 120)}...`))

    let taskWorkspace = workspace
    let taskGit = git

    if (projectId) {
      try {
        const projRes = await api.get(`/projects/${projectId}`)
        if (projRes.data?.path && fs.existsSync(projRes.data.path)) {
          taskWorkspace = new WorkspaceManager(projRes.data.path)
          taskGit = new GitManager(projRes.data.path)
          console.log(chalk.dim(`   Active project workspace: ${projRes.data.path}`))
        }
      } catch {
        // Fall back to launch workspace
      }
    }

    const session = createTaskSession({
      taskId,
      userId,
      workspace: taskWorkspace,
      git: taskGit,
      geminiApiKey: geminiApiKey!,
      anthropicApiKey,
      openaiApiKey,
      model,
    })
    taskSessions.set(taskId, session)
    await executeTurn(session, prompt, false)
  })

  // ── 6b. Handle follow-up messages on the same task ──────────────────────────
  socket.on('task:followup', async ({ taskId, projectId, message, userId, model }) => {
    console.log(chalk.bold.cyan(`\n📨 Follow-up received for task ${taskId}:`))
    console.log(chalk.white(`   ${message}`))

    let session = taskSessions.get(taskId)
    if (!session) {
      // Session wasn't in memory (e.g. agent reconnected) — initialize one
      session = createTaskSession({
        taskId,
        userId,
        workspace,
        git,
        geminiApiKey: geminiApiKey!,
        anthropicApiKey,
        openaiApiKey,
        model,
      })
      taskSessions.set(taskId, session)
    }

    if (model) session.model = model

    if (session.isRunning) {
      console.log(chalk.yellow(`   Agent is currently busy; queueing follow-up...`))
      session.followUpQueue.push({ message, model })
    } else {
      await executeTurn(session, message, true)
    }
  })

  // ── 7. Handle approval responses from phone ─────────────────────────────────
  socket.on('approval:response', ({ approvalId, decision }) => {
    const entry = pendingApprovals.get(approvalId)
    if (entry) {
      pendingApprovals.delete(approvalId)
      entry.resolve(decision === 'approved')
      console.log(
        decision === 'approved'
          ? chalk.green(`✅ Approval granted for ${approvalId}`)
          : chalk.red(`❌ Approval rejected for ${approvalId}`)
      )
    }
  })

  // ── 8. Emergency Stop (Task Abort) ──────────────────────────────────────────
  socket.on('task:abort', ({ taskId }) => {
    console.log(chalk.red.bold(`\n🛑 Emergency Stop received for task ${taskId}`))
    const session = taskSessions.get(taskId)
    if (session) {
      // Abort any pending approvals waiting for user response
      for (const [appId, entry] of pendingApprovals.entries()) {
        if (entry.taskId === taskId) {
          entry.resolve(false)
          pendingApprovals.delete(appId)
        }
      }
      abortTaskSession(session)
      console.log(chalk.red(`   Task ${taskId} execution aborted and child processes terminated.`))
      // Two-way handshake: confirm daemon stopped
      socket.emit('task:status:ack', {
        taskId,
        userId: session.userId,
        status: 'stopped',
        message: 'Stopped. No further changes will be made.',
      })
    }
  })

  // ── 8b. Pause Task Execution ────────────────────────────────────────────────
  socket.on('task:pause', ({ taskId }) => {
    console.log(chalk.yellow.bold(`\n⏸️ Pause received for task ${taskId}`))
    const session = taskSessions.get(taskId)
    if (session) {
      pauseTaskSession(session)
      socket.emit('task:status:ack', {
        taskId,
        userId: session.userId,
        status: 'paused',
        message: 'Paused. Waiting for your instruction to resume.',
      })
    }
  })

  // ── 8c. Resume Task Execution ───────────────────────────────────────────────
  socket.on('task:resume', ({ taskId }) => {
    console.log(chalk.green.bold(`\n▶️ Resume received for task ${taskId}`))
    const session = taskSessions.get(taskId)
    if (session) {
      resumeTaskSession(session)
      socket.emit('task:status:ack', {
        taskId,
        userId: session.userId,
        status: 'running',
        message: 'Resumed. Continuing work.',
      })
    }
  })

  // ── 9. Heartbeat (10s interval keeps cloud reverse proxies and websockets alive)
  setInterval(() => {
    if (socket.connected) {
      socket.emit('agent:heartbeat', {
        deviceId: deviceId!,
        availableModels: providerRegistry.getAvailableModels(),
        currentProject: path.basename(workspacePath),
        version: '0.1.0',
      })
    }
  }, 10_000)

  socket.on('connect_error', (err) => {
    // Quiet warning during background reconnect to avoid cluttering output
    if (!socket.connected) {
      process.stdout.write(chalk.dim(`\r[Reconnecting to backend...] `))
    }
  })
}

