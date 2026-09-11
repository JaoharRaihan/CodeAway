import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { createTaskSession, executeSingleTool } from './runner'
import { WorkspaceManager } from '../core/workspace'
import { GitManager } from '../core/git'

describe('Honest Verification & Tool Recovery Guards', () => {
  let tmpDir: string
  let workspace: WorkspaceManager
  let git: GitManager
  let session: any

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeaway-test-runner-'))
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-pkg' }))
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'console.log("hello world")\n')

    workspace = new WorkspaceManager(tmpDir)
    git = new GitManager(tmpDir)
    session = createTaskSession({
      taskId: 'test-task',
      userId: 'test-user',
      workspace,
      git,
      geminiApiKey: 'mock-key',
    })
  })

  it('prevents finish tool from claiming success if last test failed', async () => {
    session.lastTestResult = { command: 'npm test', exitCode: 1, passed: false }

    const res = await executeSingleTool(
      'finish',
      { summary: 'Completed task successfully and fixed the issue!' },
      session,
      () => {},
      async () => true
    )

    assert.strictEqual(res.isFinished, false)
    assert.ok(res.toolResult.includes('HONESTY GUARD'))
    assert.ok(res.toolResult.includes('npm test'))
  })

  it('permits finish tool if summary honestly reports the test failure', async () => {
    session.lastTestResult = { command: 'npm test', exitCode: 1, passed: false }

    const res = await executeSingleTool(
      'finish',
      { summary: 'Applied the patch, but test failed due to a missing dependency error.' },
      session,
      () => {},
      async () => true
    )

    assert.strictEqual(res.isFinished, true)
    assert.strictEqual(res.toolResult, 'Finished')
  })

  it('provides actionable hints when edit_file target content is not found', async () => {
    const res = await executeSingleTool(
      'edit_file',
      { path: 'index.ts', target_content: 'non_existent_code', replacement_content: 'new_code' },
      session,
      () => {},
      async () => true
    )

    assert.ok(res.toolResult.includes('ERROR:'))
    assert.ok(res.toolResult.includes('Actionable recovery: Run read_file'))
  })

  it('detects and warns on repeated failing tool call loops', async () => {
    const args = { path: 'non_existent_file.ts' }

    // Run 1
    const res1 = await executeSingleTool('read_file', args, session, () => {}, async () => true)
    assert.ok(!res1.toolResult.includes('[LOOP WARNING]'))

    // Run 2
    const res2 = await executeSingleTool('read_file', args, session, () => {}, async () => true)
    assert.ok(!res2.toolResult.includes('[LOOP WARNING]'))

    // Run 3 — triggers loop warning
    const res3 = await executeSingleTool('read_file', args, session, () => {}, async () => true)
    assert.ok(res3.toolResult.includes('[LOOP WARNING]'))
    assert.ok(res3.toolResult.includes('You have attempted "read_file" with these exact arguments 3 times'))
  })
})
