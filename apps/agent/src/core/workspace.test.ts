import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { WorkspaceManager } from './workspace'

describe('WorkspaceManager - Hardened Sandboxing & File Tools', () => {
  let tmpDir: string
  let manager: WorkspaceManager

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeaway-ws-test-'))
    // Create mock project files
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'sample-project',
        scripts: { test: 'jest', build: 'tsc' },
        dependencies: { 'react-native': '0.74.0' },
        devDependencies: { typescript: '^5.0.0' },
      })
    )
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'export const greeting = "hello world";\n')
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.ts'), 'console.log("running");\n')
    manager = new WorkspaceManager(tmpDir)
  })

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch { /* ignore cleanup error */ }
  })

  it('correctly reports project context', () => {
    const context = manager.getProjectContext()
    assert.equal(context.framework, 'React Native')
    assert.equal(context.language, 'TypeScript')
    assert.ok(context.scripts.test)
    assert.ok(context.keyDirectories.includes('src'))
  })

  it('safely reads and lists project files', () => {
    const files = manager.listFiles()
    assert.ok(files.includes('package.json'))
    assert.ok(files.includes('index.ts'))

    const content = manager.readFile('index.ts')
    assert.ok(content.includes('hello world'))
  })

  it('surgically edits files without overwriting unrelated content', () => {
    manager.editFile('index.ts', 'hello world', 'codeaway autonomous')
    const updated = manager.readFile('index.ts')
    assert.ok(updated.includes('codeaway autonomous'))
    assert.ok(updated.includes('export const greeting ='))
  })

  it('searches code within workspace using searchCode', () => {
    const results = manager.searchCode('codeaway autonomous')
    assert.ok(results.length > 0)
    assert.equal(results[0].file, 'index.ts')
    assert.ok(results[0].text.includes('codeaway autonomous'))
  })

  it('blocks path traversal outside root workspace', () => {
    assert.throws(() => {
      manager.readFile('../outside.txt')
    }, /outside the authorized workspace/)

    assert.throws(() => {
      manager.writeFile('/etc/passwd', 'malicious')
    }, /outside the authorized workspace/)

    assert.throws(() => {
      manager.deleteFile('../../secret.key')
    }, /outside the authorized workspace/)
  })

  it('blocks access to protected sensitive files (.env, credentials, ssh keys)', () => {
    assert.throws(() => {
      manager.readFile('.env')
    }, /sensitive credential/)

    assert.throws(() => {
      manager.writeFile('.env.production', 'KEY=123')
    }, /sensitive credential/)

    assert.throws(() => {
      manager.readFile('id_rsa')
    }, /sensitive credential/)
  })

  it('deletes files safely within workspace', () => {
    manager.writeFile('temp.txt', 'temporary file')
    assert.ok(fs.existsSync(path.join(tmpDir, 'temp.txt')))

    const deleted = manager.deleteFile('temp.txt')
    assert.equal(deleted, true)
    assert.ok(!fs.existsSync(path.join(tmpDir, 'temp.txt')))
  })
})
