import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isValidTaskTransition } from './index'

describe('Authoritative Task State Machine', () => {
  it('allows valid forward transitions from queued', () => {
    assert.strictEqual(isValidTaskTransition('queued', 'running'), true)
    assert.strictEqual(isValidTaskTransition('queued', 'cancelled'), true)
    assert.strictEqual(isValidTaskTransition('queued', 'stopped'), true)
    assert.strictEqual(isValidTaskTransition('queued', 'completed'), false)
  })

  it('allows valid transitions from running', () => {
    assert.strictEqual(isValidTaskTransition('running', 'paused'), true)
    assert.strictEqual(isValidTaskTransition('running', 'waiting_approval'), true)
    assert.strictEqual(isValidTaskTransition('running', 'testing'), true)
    assert.strictEqual(isValidTaskTransition('running', 'completed'), true)
    assert.strictEqual(isValidTaskTransition('running', 'failed'), true)
    assert.strictEqual(isValidTaskTransition('running', 'stopped'), true)
    assert.strictEqual(isValidTaskTransition('running', 'cancelled'), true)
  })

  it('allows pause and resume cycle', () => {
    assert.strictEqual(isValidTaskTransition('running', 'paused'), true)
    assert.strictEqual(isValidTaskTransition('paused', 'running'), true)
    assert.strictEqual(isValidTaskTransition('paused', 'stopped'), true)
    assert.strictEqual(isValidTaskTransition('paused', 'completed'), false)
  })

  it('strictly prevents illegal transitions from terminal states', () => {
    // Cancelled is strictly terminal
    assert.strictEqual(isValidTaskTransition('cancelled', 'running'), false)
    assert.strictEqual(isValidTaskTransition('cancelled', 'completed'), false)
    assert.strictEqual(isValidTaskTransition('cancelled', 'paused'), false)

    // Completed only allows reopening to running for a new follow-up
    assert.strictEqual(isValidTaskTransition('completed', 'running'), true)
    assert.strictEqual(isValidTaskTransition('completed', 'waiting_approval'), false)
    assert.strictEqual(isValidTaskTransition('completed', 'paused'), false)
  })

  it('permits idempotent self-transitions', () => {
    assert.strictEqual(isValidTaskTransition('running', 'running'), true)
    assert.strictEqual(isValidTaskTransition('paused', 'paused'), true)
    assert.strictEqual(isValidTaskTransition('completed', 'completed'), true)
  })
})
