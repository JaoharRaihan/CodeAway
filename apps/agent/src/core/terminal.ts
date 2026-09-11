import { spawn, ChildProcess } from 'child_process'
import type { PermissionLevel } from '@codeaway/shared'

// Map of active running processes by taskId for Emergency Stop
const activeProcesses = new Map<string, ChildProcess>()

/**
 * Terminates an active process and its entire process group using SIGTERM, followed by SIGKILL if needed.
 */
export function killActiveTaskProcess(taskId: string): boolean {
  const proc = activeProcesses.get(taskId)
  if (proc && proc.pid) {
    try {
      // Send SIGTERM to process group (negative PID)
      process.kill(-proc.pid, 'SIGTERM')
    } catch {
      try { proc.kill('SIGTERM') } catch { /* ignore */ }
    }

    setTimeout(() => {
      try {
        if (proc.pid) process.kill(-proc.pid, 'SIGKILL')
      } catch {
        try { proc.kill('SIGKILL') } catch { /* ignore */ }
      }
    }, 1500)

    activeProcesses.delete(taskId)
    return true
  }
  return false
}

// ─── Permission rules ─────────────────────────────────────────────────────────
const SAFE_PATTERNS = [
  /^npm (test|run lint|run type-check|run build|run tsc)\b/,
  /^npm (run )?[a-zA-Z0-9_-]+(\s+--.+)?$/,
  /^npx tsc\b/,
  /^npx jest\b/,
  /^npx vitest\b/,
  /^git (status|diff|log|show|branch|rev-parse)\b/,
  /^ls(\s+-[a-zA-Z]+)?(\s+.+)?$/,
  /^cat /,
  /^echo /,
  /^pwd$/,
  /^which /,
  /^find /,
]

const BLOCKED_PATTERNS = [
  /\bsudo\b/,
  /rm\s+-rf\s+(\/|~|\$HOME)/,
  /\bmkfs\b/,
  /dd\s+if=/,
  /chmod\s+(-R\s+)?777/,
  /curl.*\|\s*(ba)?sh/,
  /wget.*\|\s*(ba)?sh/,
  /:(){ :\|:& };:/, // fork bomb
  />\s*\/dev\/sd/,
  />\s*\/dev\/null/,
  /kill\s+-9\s+1\b/,
  /\b(reboot|shutdown|init\s+0)\b/,
  /(cat|grep|head|tail|more|less)\s+.*(id_rsa|\.env|credentials\.json|\.pem|\.key)/,
  /git\s+push.*(\-f\b|--force)/,       // Destructive force push blocked
  /git\s+reset\s+--hard/,              // Destructive hard reset blocked
  /git\s+clean\s+-[a-zA-Z]*f/,         // Destructive clean blocked
  /git\s+branch\s+-D\b/,               // Destructive forced branch deletion blocked
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/,      // fork bomb
]

const APPROVAL_PATTERNS = [
  /^npm (install|i|add|update|uninstall)\b/,
  /^yarn (add|remove|install)\b/,
  /^pnpm (add|remove|install)\b/,
  /^bun (add|remove|install)\b/,
  /^git (commit|push|merge|rebase|checkout|restore|reset|clean|stash)\b/,
  /^rm \b/,
  /^mv \b/,
  /^cp -r\b/,
]

export function classifyCommand(command: string): PermissionLevel {
  const cmd = command.trim()

  if (BLOCKED_PATTERNS.some((p) => p.test(cmd))) return 'BLOCKED'
  if (SAFE_PATTERNS.some((p) => p.test(cmd))) return 'SAFE'
  if (APPROVAL_PATTERNS.some((p) => p.test(cmd))) return 'APPROVAL'

  // Default unknown commands to APPROVAL for safety
  return 'APPROVAL'
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

const MAX_OUTPUT_CHARS = 50_000 // 50KB limit to prevent socket and memory blowout

export async function runCommand(
  command: string,
  cwd: string,
  taskId?: string,
  onOutput?: (chunk: string, stream: 'stdout' | 'stderr') => void,
  timeoutMs = 120_000
): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdoutAcc = ''
    let stderrAcc = ''
    let totalChars = 0
    let truncatedNoticeSent = false
    let isSettled = false

    const proc = spawn('sh', ['-c', command], {
      cwd,
      detached: true, // creates process group so child processes can be killed together
      env: {
        ...process.env,
        PATH: `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`,
      },
    })

    if (taskId) {
      activeProcesses.set(taskId, proc)
    }

    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true
        if (taskId) killActiveTaskProcess(taskId)
        resolve({
          stdout: stdoutAcc,
          stderr: stderrAcc + `\n[Command timed out after ${timeoutMs / 1000}s]`,
          exitCode: 124,
        })
      }
    }, timeoutMs)

    const appendData = (data: any, stream: 'stdout' | 'stderr') => {
      const str = data.toString()
      if (totalChars >= MAX_OUTPUT_CHARS) {
        if (!truncatedNoticeSent) {
          truncatedNoticeSent = true
          const notice = '\n[...output truncated to 50KB to protect network and memory...]'
          if (stream === 'stdout') stdoutAcc += notice
          else stderrAcc += notice
          if (onOutput) onOutput(notice, stream)
        }
        return
      }

      const remainingAllowed = MAX_OUTPUT_CHARS - totalChars
      const chunk = str.slice(0, remainingAllowed)
      totalChars += chunk.length
      if (stream === 'stdout') stdoutAcc += chunk
      else stderrAcc += chunk
      if (onOutput) onOutput(chunk, stream)

      if (totalChars >= MAX_OUTPUT_CHARS && !truncatedNoticeSent) {
        truncatedNoticeSent = true
        const notice = '\n[...output truncated to 50KB to protect network and memory...]'
        if (stream === 'stdout') stdoutAcc += notice
        else stderrAcc += notice
        if (onOutput) onOutput(notice, stream)
      }
    }

    proc.stdout?.on('data', (data) => appendData(data, 'stdout'))
    proc.stderr?.on('data', (data) => appendData(data, 'stderr'))

    proc.on('close', (code, signal) => {
      if (!isSettled) {
        isSettled = true
        clearTimeout(timer)
        if (taskId) activeProcesses.delete(taskId)
        resolve({
          stdout: stdoutAcc,
          stderr: stderrAcc,
          exitCode: code !== null ? code : (signal ? 1 : 0),
        })
      }
    })

    proc.on('error', (err) => {
      if (!isSettled) {
        isSettled = true
        clearTimeout(timer)
        if (taskId) activeProcesses.delete(taskId)
        resolve({
          stdout: stdoutAcc,
          stderr: stderrAcc + `\n${err.message}`,
          exitCode: 1,
        })
      }
    })
  })
}
