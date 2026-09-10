import simpleGit, { SimpleGit } from 'simple-git'

export class GitManager {
  private git: SimpleGit

  constructor(workspaceRoot: string) {
    this.git = simpleGit(workspaceRoot)
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.git.status()
      return true
    } catch {
      return false
    }
  }

  async status(): Promise<string> {
    const s = await this.git.status()
    const lines = [
      `Branch: ${s.current}`,
      s.modified.length ? `Modified: ${s.modified.join(', ')}` : null,
      s.created.length ? `Created: ${s.created.join(', ')}` : null,
      s.deleted.length ? `Deleted: ${s.deleted.join(', ')}` : null,
      s.not_added.length ? `Untracked: ${s.not_added.join(', ')}` : null,
    ].filter(Boolean)
    return lines.join('\n')
  }

  async diff(files?: string[]): Promise<string> {
    if (files?.length) {
      return this.git.diff(files)
    }
    return this.git.diff()
  }

  async currentBranch(): Promise<string> {
    const s = await this.git.status()
    return s.current ?? 'unknown'
  }

  /** Create a checkpoint commit (soft — doesn't push) */
  async checkpoint(message: string): Promise<void> {
    await this.git.add('.')
    await this.git.commit(`[codeaway] ${message}`)
  }

  async changedFiles(): Promise<string[]> {
    const s = await this.git.status()
    return [...s.modified, ...s.created, ...s.deleted]
  }
}
