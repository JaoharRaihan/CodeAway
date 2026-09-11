import { describe, it } from 'node:test'
import assert from 'node:assert'
import { classifyIntent } from './intent'

describe('classifyIntent', () => {
  it('identifies emergency stop and control commands', async () => {
    const res1 = await classifyIntent('stop')
    assert.strictEqual(res1.intent, 'control')

    const res2 = await classifyIntent('pause')
    assert.strictEqual(res2.intent, 'control')

    const res3 = await classifyIntent('continue')
    assert.strictEqual(res3.intent, 'control')
  })

  it('identifies conceptual questions as chat without running tools', async () => {
    const res1 = await classifyIntent('What is MobX?')
    assert.strictEqual(res1.intent, 'chat')

    const res2 = await classifyIntent('Explain how Socket.IO reconnection works')
    assert.strictEqual(res2.intent, 'chat')

    const res3 = await classifyIntent('What is the difference between Redux and Zustand?')
    assert.strictEqual(res3.intent, 'chat')
  })

  it('identifies architectural design queries as discussion', async () => {
    const res1 = await classifyIntent('Should we use MongoDB or PostgreSQL for this?')
    assert.strictEqual(res1.intent, 'discussion')

    const res2 = await classifyIntent('What do you think about using Zustand?')
    assert.strictEqual(res2.intent, 'discussion')
  })

  it('identifies coding instructions as action', async () => {
    const res1 = await classifyIntent('Fix the login button on OTP screen')
    assert.strictEqual(res1.intent, 'action')

    const res2 = await classifyIntent('Add SafeAreaView to AppNavigator')
    assert.strictEqual(res2.intent, 'action')

    const res3 = await classifyIntent('Run npm test')
    assert.strictEqual(res3.intent, 'action')
  })

  it('identifies follow-up inquiries in active session context', async () => {
    const res1 = await classifyIntent('Why did you change LoginScreen.tsx?', { hasActiveTask: true })
    assert.strictEqual(res1.intent, 'follow_up')

    const res2 = await classifyIntent('What did you find?', { hasActiveTask: true })
    assert.strictEqual(res2.intent, 'follow_up')
  })
})
