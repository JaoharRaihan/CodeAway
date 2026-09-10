import * as fs from 'fs'
import * as path from 'path'

export class WorkspaceManager {
  private allowedRoot: string

  constructor(workspacePath: string) {
    this.allowedRoot = path.resolve(workspacePath)
  }

  /** Resolve and validate that a path is inside the allowed workspace */
  resolveSafe(filePath: string): string {
    const resolved = path.resolve(this.allowedRoot, filePath)
    if (!resolved.startsWith(this.allowedRoot)) {
      throw new Error(`🚫 Path "${filePath}" is outside the allowed workspace`)
    }
    return resolved
  }

  /** List files recursively (respects .gitignore patterns) */
  listFiles(subDir = '', maxDepth = 4): string[] {
    const base = this.resolveSafe(subDir)
    const results: string[] = []

    const walk = (dir: string, depth: number) => {
      if (depth > maxDepth) return
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (this.shouldSkip(entry.name)) continue
        const fullPath = path.join(dir, entry.name)
        const rel = path.relative(this.allowedRoot, fullPath)
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1)
        } else {
          results.push(rel)
        }
      }
    }

    walk(base, 0)
    return results
  }

  readFile(filePath: string): string {
    const safe = this.resolveSafe(filePath)
    return fs.readFileSync(safe, 'utf-8')
  }

  writeFile(filePath: string, content: string): void {
    const safe = this.resolveSafe(filePath)
    fs.mkdirSync(path.dirname(safe), { recursive: true })
    fs.writeFileSync(safe, content, 'utf-8')
  }

  fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(this.resolveSafe(filePath))
    } catch {
      return false
    }
  }

  get root(): string {
    return this.allowedRoot
  }

  private shouldSkip(name: string): boolean {
    const SKIP = [
      'node_modules', '.git', 'dist', 'build', '.next',
      '__pycache__', '.DS_Store', 'coverage', '.cache',
    ]
    return SKIP.includes(name) || name.startsWith('.')
  }
}
