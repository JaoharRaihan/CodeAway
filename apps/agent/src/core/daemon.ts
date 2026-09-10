import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import chalk from 'chalk'
import { getConfig } from './config'

const LABEL = 'com.codeaway.agent'
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents')
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, `${LABEL}.plist`)
const CODEAWAY_DIR = path.join(os.homedir(), '.codeaway')
const STDOUT_LOG = path.join(CODEAWAY_DIR, 'daemon.stdout.log')
const STDERR_LOG = path.join(CODEAWAY_DIR, 'daemon.stderr.log')

export function getDaemonPaths() {
  return {
    plist: PLIST_PATH,
    stdout: STDOUT_LOG,
    stderr: STDERR_LOG,
  }
}

export function isDaemonInstalled(): boolean {
  return fs.existsSync(PLIST_PATH)
}

export function getDaemonStatus(): { running: boolean; pid?: number; installed: boolean } {
  const installed = isDaemonInstalled()
  if (!installed) return { running: false, installed: false }

  try {
    const output = execSync(`launchctl list 2>/dev/null | grep "${LABEL}" || true`, {
      encoding: 'utf-8',
    }).trim()

    if (!output) return { running: false, installed: true }

    const parts = output.split(/\s+/)
    const pid = parts[0] !== '-' ? parseInt(parts[0], 10) : undefined
    return { running: true, pid, installed: true }
  } catch {
    return { running: false, installed: true }
  }
}

export function installDaemon(workspacePath?: string): void {
  const config = getConfig()
  const ws = workspacePath ?? config.workspace ?? process.cwd()
  const nodePath = process.execPath || '/usr/local/bin/node'
  const scriptPath = path.resolve(__dirname, '../../dist/index.js')

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Agent bundle not found at ${scriptPath}. Please run "npm run build" in apps/agent first.`)
  }

  fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true })
  fs.mkdirSync(CODEAWAY_DIR, { recursive: true })

  const envPath = `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${scriptPath}</string>
        <string>connect</string>
        <string>--workspace</string>
        <string>${ws}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${STDOUT_LOG}</string>
    <key>StandardErrorPath</key>
    <string>${STDERR_LOG}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${envPath}</string>
    </dict>
</dict>
</plist>
`

  // Unload if already exists
  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null || true`)
  } catch { /* ignore */ }

  fs.writeFileSync(PLIST_PATH, plistContent, 'utf-8')
  execSync(`launchctl load -w "${PLIST_PATH}"`)
}

export function uninstallDaemon(): void {
  if (fs.existsSync(PLIST_PATH)) {
    try {
      execSync(`launchctl unload -w "${PLIST_PATH}" 2>/dev/null || true`)
    } catch { /* ignore */ }
    fs.unlinkSync(PLIST_PATH)
  }
}

export function startDaemon(): void {
  if (!isDaemonInstalled()) {
    throw new Error('Daemon is not installed. Run "codeaway daemon install" first.')
  }
  execSync(`launchctl start "${LABEL}"`)
}

export function stopDaemon(): void {
  if (!isDaemonInstalled()) return
  try {
    execSync(`launchctl stop "${LABEL}" 2>/dev/null || true`)
  } catch { /* ignore */ }
}

export function readDaemonLogs(lines = 30): { stdout: string; stderr: string } {
  const getTail = (file: string) => {
    if (!fs.existsSync(file)) return '(no logs yet)'
    try {
      return execSync(`tail -n ${lines} "${file}"`, { encoding: 'utf-8' })
    } catch {
      return '(failed to read)'
    }
  }

  return {
    stdout: getTail(STDOUT_LOG),
    stderr: getTail(STDERR_LOG),
  }
}
