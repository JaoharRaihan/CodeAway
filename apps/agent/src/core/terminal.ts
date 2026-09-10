import { spawn, ChildProcess } from 'child_process'
import type { PermissionLevel } from '@codeaway/shared'

// Map of active running processes by taskId for Emergency Stop
const activeProcesses = new Map<string, ChildProcess>()

export function killActiveTaskProcess(taskId: string): boolean {
  const proc = activeProcesses.get(taskId)
  if (proc) {
    try {
      proc.kill('SIGTERM')
      setTimeout(() => {
        try { proc.kill('SIGKILL') } catch { /* ignore */ }
      }, 2000)
      activeProcesses.delete(taskId)
      return true
    } catch {
      return false
    }
  }
  return false
}

// ─── Permission rules ─────────────────────────────────────────────────────────
const SAFE_PATTERNS = [
  /^npm (test|run lint|run type-check|run build|run tsc)/,
  /^npm (run )?[a-zA-Z0-9_-]+(\s+--.+)?$/,
  /^npx tsc/,
  /^npx jest/,
  /^git (status|diff|log|show|branch|rev-parse)/,
  /^ls(\s+-[a-zA-Z]+)?(\s+.+)?$/,
  /^cat /,
  /^echo /,
  /^pwd$/,
  /^which /,
  /^find /,
]

const BLOCKED_PATTERNS = [
  /sudo/,
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  /chmod\s+777/,
  /curl.*\|\s*(ba)?sh/,
  /wget.*\|\s*(ba)?sh/,
  /:(){ :\|:& };:/, // fork bomb
  />\s*\/dev\/sd/,
  />\s*\/dev\/null/,
  /kill\s+-9\s+1\b/,
  /reboot|shutdown|init\s+0/,
  /cat.*id_rsa/,
  /cat.*\.env/,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/, // fork bomb
]

const APPROVAL_PATTERNS = [
  /^npm (install|i|add|update|uninstall)/,
  /^yarn (add|remove|install)/,
  /^pnpm (add|remove|install)/,
  /^git (commit|push|reset|rebase|merge|checkout -b|clean)/,
  /^rm /,
  /^mv /,
  /^cp -r/,
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
    let isSettled = false

    const proc = spawn('sh', ['-c', command], {
      cwd,
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
        if (taskId) activeProcesses.delete(taskId)
        try { proc.kill('SIGTERM') } catch { /* ignore */ }
        resolve({
          stdout: stdoutAcc,
          stderr: stderrAcc + `\n[Command timed out after ${timeoutMs / 1000}s]`,
          exitCode: 124,
        })
      }
    }, timeoutMs)

    proc.stdout.on('data', (data) => {
      const str = data.toString()
      stdoutAcc += str
      if (onOutput) onOutput(str, 'stdout')
    })

    proc.stderr.on('data', (data) => {
      const str = data.toString()
      stderrAcc += str
      if (onOutput) onOutput(str, 'stderr')
    })

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
