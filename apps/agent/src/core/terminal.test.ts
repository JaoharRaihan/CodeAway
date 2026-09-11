import { describe, it } from 'node:test'
import assert from 'node:assert'
import { classifyCommand, runCommand } from './terminal'

describe('Terminal Safety & Command Classification', () => {
  it('classifies benign inspect and test commands as SAFE', () => {
    assert.strictEqual(classifyCommand('npm test'), 'SAFE')
    assert.strictEqual(classifyCommand('npx tsc'), 'SAFE')
    assert.strictEqual(classifyCommand('git status'), 'SAFE')
    assert.strictEqual(classifyCommand('git diff'), 'SAFE')
    assert.strictEqual(classifyCommand('ls -la'), 'SAFE')
    assert.strictEqual(classifyCommand('pwd'), 'SAFE')
  })

  it('classifies destructive and dangerous commands as BLOCKED', () => {
    assert.strictEqual(classifyCommand('sudo rm -rf /'), 'BLOCKED')
    assert.strictEqual(classifyCommand('git push --force origin main'), 'BLOCKED')
    assert.strictEqual(classifyCommand('git push -f'), 'BLOCKED')
    assert.strictEqual(classifyCommand('git reset --hard HEAD~1'), 'BLOCKED')
    assert.strictEqual(classifyCommand('git clean -fd'), 'BLOCKED')
    assert.strictEqual(classifyCommand('git branch -D main'), 'BLOCKED')
    assert.strictEqual(classifyCommand('cat .env'), 'BLOCKED')
    assert.strictEqual(classifyCommand('grep password id_rsa'), 'BLOCKED')
    assert.strictEqual(classifyCommand('chmod 777 script.sh'), 'BLOCKED')
  })

  it('classifies modifications and installs as requiring APPROVAL', () => {
    assert.strictEqual(classifyCommand('npm install lodash'), 'APPROVAL')
    assert.strictEqual(classifyCommand('yarn add express'), 'APPROVAL')
    assert.strictEqual(classifyCommand('git commit -m "update"'), 'APPROVAL')
    assert.strictEqual(classifyCommand('git push origin feature'), 'APPROVAL')
    assert.strictEqual(classifyCommand('rm file.txt'), 'APPROVAL')
  })

  it('truncates unbounded output exceeding limit', async () => {
    // Generate output larger than 50KB
    const r = await runCommand(
      'node -e "process.stdout.write(\'A\'.repeat(70000))"',
      process.cwd()
    )
    assert.ok(r.stdout.length < 60000)
    assert.ok(r.stdout.includes('output truncated to 50KB'))
  })
})
