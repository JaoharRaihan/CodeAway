import { exec } from 'child_process'
import { promisify } from 'util'
import type { PermissionLevel } from '@codeaway/shared'

const execAsync = promisify(exec)

// ─── Permission rules ─────────────────────────────────────────────────────────
const SAFE_PATTERNS = [
  /^npm (test|run lint|run type-check|run build)/,
  /^npm (run )?[a-zA-Z0-9_-]+(\s+--.+)?$/,
  /^npx tsc/,
  /^git (status|diff|log|show|branch)/,
  /^ls/,
  /^cat /,
  /^echo /,
  /^pwd/,
]

const BLOCKED_PATTERNS = [
  /sudo/,
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  /chmod\s+777/,
  /curl.*\|\s*sh/,
  /wget.*\|\s*sh/,
]

const APPROVAL_PATTERNS = [
  /^npm install/,
  /^yarn add/,
  /^git (commit|push|reset|rebase|merge|checkout -b)/,
  /^rm /,
  /^mv /,
  /^cp -r/,
]

export function classifyCommand(command: string): PermissionLevel {
  const cmd = command.trim()

  if (BLOCKED_PATTERNS.some((p) => p.test(cmd))) return 'BLOCKED'
  if (SAFE_PATTERNS.some((p) => p.test(cmd))) return 'SAFE'
  if (APPROVAL_PATTERNS.some((p) => p.test(cmd))) return 'APPROVAL'

  // Default unknown commands to APPROVAL
  return 'APPROVAL'
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

export async function runCommand(
  command: string,
  cwd: string
): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 5, // 5MB
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message,
      exitCode: err.code ?? 1,
    }
  }
}
