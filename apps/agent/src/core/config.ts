import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface AgentConfig {
  token: string
  userId: string
  email: string
  deviceId: string
  deviceName: string
  apiUrl: string
  workspace: string
  geminiApiKey: string
}

// Stored at ~/.codeaway/config.json
const CONFIG_DIR = path.join(os.homedir(), '.codeaway')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

function readRaw(): Partial<AgentConfig> {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {}
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function writeRaw(data: Partial<AgentConfig>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export function getConfig(): Partial<AgentConfig> {
  const raw = readRaw()
  return { apiUrl: 'http://localhost:3001', ...raw }
}

export function saveConfig(data: Partial<AgentConfig>): void {
  const current = readRaw()
  writeRaw({ ...current, ...data })
}

export function clearConfig(): void {
  writeRaw({})
}

export function isAuthenticated(): boolean {
  const cfg = getConfig()
  return !!(cfg.token && cfg.userId)
}
