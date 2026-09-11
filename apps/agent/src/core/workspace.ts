import * as fs from 'fs'
import * as path from 'path'

export interface ProjectContext {
  framework: string
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown'
  language: string
  scripts: Record<string, string>
  keyDirectories: string[]
  hasGit: boolean
}

export class WorkspaceManager {
  private allowedRoot: string

  constructor(workspacePath: string) {
    this.allowedRoot = path.resolve(workspacePath)
  }

  /**
   * Resolve and validate that a path is strictly inside the allowed workspace.
   * Prevents path traversal, symlink escapes, and secret/credential file access.
   */
  resolveSafe(filePath: string): string {
    const resolved = path.resolve(this.allowedRoot, filePath)
    const rel = path.relative(this.allowedRoot, resolved)

    // 1. Lexical traversal guard
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`🚫 Path "${filePath}" is outside the authorized workspace: ${this.allowedRoot}`)
    }

    // 2. Sensitive credential / secret guard
    if (this.isSensitive(filePath) || this.isSensitive(resolved)) {
      throw new Error(`🚫 Access to sensitive credential or secret file "${filePath}" is blocked by security policy`)
    }

    // 3. Symlink / Canonical Realpath Escape Guard
    try {
      if (fs.existsSync(resolved)) {
        const canonicalResolved = fs.realpathSync(resolved)
        const canonicalRoot = fs.realpathSync(this.allowedRoot)
        const relCanonical = path.relative(canonicalRoot, canonicalResolved)
        if (relCanonical.startsWith('..') || path.isAbsolute(relCanonical)) {
          throw new Error(`🚫 Symlink traversal detected: "${filePath}" points outside the authorized workspace`)
        }
        if (this.isSensitive(canonicalResolved)) {
          throw new Error(`🚫 Symlink target "${filePath}" points to a sensitive credential or secret file`)
        }
      } else {
        // For new files, check nearest existing ancestor directory
        let parentDir = path.dirname(resolved)
        while (parentDir && !fs.existsSync(parentDir) && parentDir !== this.allowedRoot) {
          const parent = path.dirname(parentDir)
          if (parent === parentDir) break
          parentDir = parent
        }
        if (fs.existsSync(parentDir)) {
          const canonicalParent = fs.realpathSync(parentDir)
          const canonicalRoot = fs.realpathSync(this.allowedRoot)
          const relCanonical = path.relative(canonicalRoot, canonicalParent)
          if (relCanonical.startsWith('..') || path.isAbsolute(relCanonical)) {
            throw new Error(`🚫 Parent directory of "${filePath}" escapes authorized workspace via symlink`)
          }
        }
      }
    } catch (err: any) {
      if (err.message && err.message.startsWith('🚫')) {
        throw err
      }
      throw new Error(`🚫 Security verification failed for path "${filePath}": ${err.message}`)
    }

    return resolved
  }

  private isSensitive(p: string): boolean {
    const normalized = p.replace(/\\/g, '/').toLowerCase()
    const base = path.basename(normalized)

    // Dotenv variants (e.g. .env, .env.local, atlas-credentials (1).env, prod.env)
    if (base === '.env' || base.startsWith('.env.') || base.endsWith('.env') || normalized.includes('.env')) {
      return true
    }

    // Private keys, certs, and keystores
    if (
      base === 'id_rsa' ||
      base.startsWith('id_rsa.') ||
      base === 'id_ed25519' ||
      base.startsWith('id_ed25519.') ||
      base.endsWith('.pem') ||
      base.endsWith('.key') ||
      base.endsWith('.pfx') ||
      base.endsWith('.pkcs12') ||
      base.endsWith('.keystore')
    ) {
      return true
    }

    // Sensitive config and secret directories
    const blockedDirs = [
      '/.ssh/',
      '/.aws/',
      '/.git/config',
      '/.gnupg/',
      '/.kube/',
      '/.docker/',
      '/.azure/',
      '/.gcloud/',
    ]
    if (blockedDirs.some((dir) => normalized.includes(dir))) {
      return true
    }

    // Common token & credential files
    const sensitiveBases = [
      'credentials.json',
      'service-account.json',
      'client_secret.json',
      '.netrc',
      '.npmrc',
      '.yarnrc',
      'auth.json',
    ]
    if (sensitiveBases.includes(base)) {
      return true
    }

    return false
  }

  /** List files recursively (respects common ignore patterns) */
  listFiles(subDir = '', maxDepth = 4): string[] {
    const base = this.resolveSafe(subDir)
    const results: string[] = []

    const walk = (dir: string, depth: number) => {
      if (depth > maxDepth) return
      let entries: fs.Dirent[] = []
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }

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

  /**
   * Surgical edit replacing a specific text target inside a file.
   */
  editFile(filePath: string, targetContent: string, replacementContent: string): void {
    const safe = this.resolveSafe(filePath)
    const existing = fs.readFileSync(safe, 'utf-8')
    if (!existing.includes(targetContent)) {
      throw new Error(`Target content not found in ${filePath}`)
    }
    const updated = existing.replace(targetContent, replacementContent)
    fs.writeFileSync(safe, updated, 'utf-8')
  }

  deleteFile(filePath: string): boolean {
    const safe = this.resolveSafe(filePath)
    if (fs.existsSync(safe)) {
      fs.unlinkSync(safe)
      return true
    }
    return false
  }

  searchCode(query: string, subDir = '', maxResults = 25): Array<{ file: string; line: number; text: string }> {
    const files = this.listFiles(subDir, 5)
    const results: Array<{ file: string; line: number; text: string }> = []
    const isReg = query.startsWith('/') && query.endsWith('/') && query.length > 2
    let regex: RegExp

    try {
      regex = isReg ? new RegExp(query.slice(1, -1), 'i') : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    } catch {
      regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    }

    for (const relPath of files) {
      if (results.length >= maxResults) break
      try {
        const full = path.join(this.allowedRoot, relPath)
        const stat = fs.statSync(full)
        if (stat.size > 1024 * 512) continue // skip files > 512KB

        const content = fs.readFileSync(full, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push({ file: relPath, line: i + 1, text: lines[i].trim() })
            if (results.length >= maxResults) break
          }
        }
      } catch {
        /* skip binary or unreadable files */
      }
    }

    return results
  }

  getProjectContext(): ProjectContext {
    let framework = 'Node.js / General'
    let language = 'JavaScript'
    let packageManager: ProjectContext['packageManager'] = 'npm'
    let scripts: Record<string, string> = {}
    const keyDirectories: string[] = []

    if (fs.existsSync(path.join(this.allowedRoot, 'package.json'))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(this.allowedRoot, 'package.json'), 'utf-8'))
        scripts = pkg.scripts || {}
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

        if (allDeps['react-native']) framework = 'React Native'
        else if (allDeps['next']) framework = 'Next.js'
        else if (allDeps['vite']) framework = 'Vite'
        else if (allDeps['express'] || allDeps['fastify']) framework = 'Node.js Backend'

        if (fs.existsSync(path.join(this.allowedRoot, 'tsconfig.json')) || allDeps['typescript']) {
          language = 'TypeScript'
        }
      } catch { /* ignore */ }
    }

    if (fs.existsSync(path.join(this.allowedRoot, 'yarn.lock'))) packageManager = 'yarn'
    else if (fs.existsSync(path.join(this.allowedRoot, 'pnpm-lock.yaml'))) packageManager = 'pnpm'
    else if (fs.existsSync(path.join(this.allowedRoot, 'bun.lockb'))) packageManager = 'bun'

    const checkDirs = ['src', 'apps', 'packages', 'android', 'ios', 'lib', 'test', '__tests__']
    for (const d of checkDirs) {
      if (fs.existsSync(path.join(this.allowedRoot, d))) keyDirectories.push(d)
    }

    const hasGit = fs.existsSync(path.join(this.allowedRoot, '.git'))

    return {
      framework,
      packageManager,
      language,
      scripts,
      keyDirectories,
      hasGit,
    }
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
      'Pods', '.gradle',
    ]
    return SKIP.includes(name) || (name.startsWith('.') && name !== '.github')
  }
}
