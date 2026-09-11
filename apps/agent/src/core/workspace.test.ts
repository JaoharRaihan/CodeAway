import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { WorkspaceManager } from './workspace'

describe('Workspace Security & Path Jail', () => {
  let testDir: string
  let outsideDir: string
  let workspace: WorkspaceManager

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeaway-ws-test-'))
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeaway-outside-test-'))

    // Create valid internal files
    fs.writeFileSync(path.join(testDir, 'index.ts'), 'console.log("hello")')
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true })
    fs.writeFileSync(path.join(testDir, 'src', 'app.ts'), 'export const a = 1')

    // Create outside file
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'SUPER_SECRET_TOKEN')

    // Create symlink pointing outside
    try {
      fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(testDir, 'symlink-outside.txt'))
    } catch { /* ignore if symlink not supported */ }

    workspace = new WorkspaceManager(testDir)
  })

  after(() => {
    try { fs.rmSync(testDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { fs.rmSync(outsideDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('allows safe files strictly inside workspace', () => {
    const p1 = workspace.resolveSafe('index.ts')
    assert.strictEqual(p1, path.join(testDir, 'index.ts'))

    const p2 = workspace.resolveSafe('src/app.ts')
    assert.strictEqual(p2, path.join(testDir, 'src', 'app.ts'))
  })

  it('strictly blocks relative path traversal escapes', () => {
    assert.throws(() => workspace.resolveSafe('../../etc/passwd'), /outside the authorized workspace/)
    assert.throws(() => workspace.resolveSafe('../secret.txt'), /outside the authorized workspace/)
  })

  it('strictly blocks absolute path traversal escapes', () => {
    assert.throws(() => workspace.resolveSafe('/etc/passwd'), /outside the authorized workspace/)
    assert.throws(() => workspace.resolveSafe(path.join(outsideDir, 'secret.txt')), /outside the authorized workspace/)
  })

  it('strictly blocks symlink escapes pointing outside workspace', () => {
    const symlinkPath = path.join(testDir, 'symlink-outside.txt')
    if (fs.existsSync(symlinkPath)) {
      assert.throws(() => workspace.resolveSafe('symlink-outside.txt'), /Symlink traversal detected/)
    }
  })

  it('blocks sensitive credential and secret files', () => {
    assert.throws(() => workspace.resolveSafe('.env'), /blocked by security policy/)
    assert.throws(() => workspace.resolveSafe('.env.local'), /blocked by security policy/)
    assert.throws(() => workspace.resolveSafe('atlas-credentials (1).env'), /blocked by security policy/)
    assert.throws(() => workspace.resolveSafe('id_rsa'), /blocked by security policy/)
    assert.throws(() => workspace.resolveSafe('server.key'), /blocked by security policy/)
    assert.throws(() => workspace.resolveSafe('cert.pem'), /blocked by security policy/)
    assert.throws(() => workspace.resolveSafe('credentials.json'), /blocked by security policy/)
    assert.throws(() => workspace.resolveSafe('.ssh/id_ed25519'), /blocked by security policy/)
  })
})
