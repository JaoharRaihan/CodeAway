import chalk from 'chalk'
import prompts from 'prompts'
import ora from 'ora'
import * as os from 'os'
import * as path from 'path'
import { io as ioClient, Socket } from 'socket.io-client'
import { api } from '../core/api'
import { getConfig, saveConfig, isAuthenticated } from '../core/config'
import { WorkspaceManager } from '../core/workspace'
import { GitManager } from '../core/git'
import { runAgentLoop } from '../ai/runner'
import type { ServerToAgentEvents, AgentToServerEvents } from '@codeaway/shared'

// pending approval resolvers — keyed by approvalId
const pendingApprovals = new Map<string, (approved: boolean) => void>()

export async function connectCommand(opts: { workspace?: string }) {
  if (!isAuthenticated()) {
    console.log(chalk.red('❌ Not logged in. Run `codeaway login` first.'))
    process.exit(1)
  }

  const config = getConfig()

  // ── 1. Workspace ────────────────────────────────────────────────────────────
  let workspacePath = opts.workspace ?? config.workspace
  if (!workspacePath) {
    const { ws } = await prompts({
      type: 'text',
      name: 'ws',
      message: 'Which folder should the agent have access to?',
      initial: process.cwd(),
    })
    workspacePath = path.resolve(ws)
  }

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
    reconnection: true,
    reconnectionDelay: 3000,
  })

  const workspace = new WorkspaceManager(workspacePath)
  const git = new GitManager(workspacePath)

  socket.on('connect', () => {
    spinner.succeed(chalk.green(`✅ Connected to CodeAway backend`))
    console.log(chalk.dim(`   Workspace : ${workspacePath}`))
    console.log(chalk.dim(`   Device    : ${os.hostname()} (${deviceId})`))
    console.log(chalk.cyan('\n⏳ Waiting for tasks from your phone...\n'))

    socket.emit('agent:connect', { deviceId: deviceId!, token: config.token! })
  })

  socket.on('disconnect', () => {
    console.log(chalk.yellow('\n⚠️  Disconnected — reconnecting...'))
  })

  // ── 6. Handle incoming tasks ────────────────────────────────────────────────
  socket.on('task:new', async ({ taskId, projectId, prompt, userId }) => {
    console.log(chalk.bold.cyan(`\n📨 New task received: ${taskId}`))
    console.log(chalk.dim(`   ${prompt.slice(0, 120)}...`))

    const emit = (event: any) => {
      socket.emit('task:event:emit', { taskId, userId, event })
    }

    const onApprovalNeeded = async (command: string, reason: string): Promise<boolean> => {
      // Create approval record in backend
      const res = await api.post('/approvals', { task_id: taskId, command, reason })
      const approvalId = res.data._id

      socket.emit('approval:request', { taskId, userId, approvalId, command, reason })

      // Wait for phone response (max 5 minutes)
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pendingApprovals.delete(approvalId)
          resolve(false) // auto-reject on timeout
        }, 5 * 60 * 1000)

        pendingApprovals.set(approvalId, (approved) => {
          clearTimeout(timeout)
          resolve(approved)
        })
      })
    }

    try {
      const result = await runAgentLoop({
        taskId,
        userId,
        prompt,
        workspace,
        git,
        geminiApiKey: geminiApiKey!,
        onEvent: emit,
        onApprovalNeeded,
      })

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
    }
  })

  // ── 7. Handle approval responses from phone ─────────────────────────────────
  socket.on('approval:response', ({ approvalId, decision }) => {
    const resolve = pendingApprovals.get(approvalId)
    if (resolve) {
      pendingApprovals.delete(approvalId)
      resolve(decision === 'approved')
      console.log(
        decision === 'approved'
          ? chalk.green(`✅ Approval granted for ${approvalId}`)
          : chalk.red(`❌ Approval rejected for ${approvalId}`)
      )
    }
  })

  // ── 8. Heartbeat ────────────────────────────────────────────────────────────
  setInterval(() => {
    socket.emit('agent:heartbeat', { deviceId: deviceId! })
  }, 30_000)

  socket.on('connect_error', (err) => {
    console.error(chalk.red(`Connection error: ${err.message}`))
  })
}
