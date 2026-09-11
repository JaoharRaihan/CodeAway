import { useTaskStore } from '../src/store/taskStore'

describe('taskStore event idempotency and reconnect sync', () => {
  beforeEach(() => {
    useTaskStore.getState().clearLiveEvents('task-1')
  })

  it('seeds events cleanly and eliminates duplicates in setTaskEvents', () => {
    const store = useTaskStore.getState()
    store.setTaskEvents('task-1', [
      { id: 'evt-1', type: 'assistant_message', message: 'Hello developer' },
      { id: 'evt-1', type: 'assistant_message', message: 'Hello developer' }, // duplicate id
      { id: 'evt-2', type: 'action_card', message: 'Inspected files', metadata: { id: 'card-1', status: 'running' } },
    ])

    const afterSet = useTaskStore.getState().liveEvents['task-1']
    expect(afterSet.length).toBe(2)
  })

  it('discards duplicate events in addLiveEvent', () => {
    const store = useTaskStore.getState()
    store.setTaskEvents('task-1', [
      { id: 'evt-1', type: 'assistant_message', message: 'Hello developer' },
      { id: 'evt-2', type: 'action_card', message: 'Inspected files', metadata: { id: 'card-1', status: 'running' } },
    ])

    // Duplicate by id
    store.addLiveEvent('task-1', { id: 'evt-1', type: 'assistant_message', message: 'Hello developer' })
    expect(useTaskStore.getState().liveEvents['task-1'].length).toBe(2)

    // Append unique event
    store.addLiveEvent('task-1', { type: 'command_output', message: 'npm test output' })
    expect(useTaskStore.getState().liveEvents['task-1'].length).toBe(3)

    // Duplicate by signature
    store.addLiveEvent('task-1', { type: 'command_output', message: 'npm test output' })
    expect(useTaskStore.getState().liveEvents['task-1'].length).toBe(3)
  })

  it('updates action cards in-place by metadata.id in addLiveEvent', () => {
    const store = useTaskStore.getState()
    store.setTaskEvents('task-1', [
      { id: 'evt-1', type: 'assistant_message', message: 'Hello developer' },
      { id: 'evt-2', type: 'action_card', message: 'Inspected files', metadata: { id: 'card-1', status: 'running' } },
    ])

    store.addLiveEvent('task-1', {
      id: 'evt-3',
      type: 'action_card',
      message: 'Inspected files',
      metadata: { id: 'card-1', status: 'success', summary: '3 files checked' },
    })

    const afterCardUpdate = useTaskStore.getState().liveEvents['task-1']
    expect(afterCardUpdate.length).toBe(2)
    const updatedCard = afterCardUpdate.find((e) => e.event.metadata?.id === 'card-1')
    expect(updatedCard?.event.metadata?.status).toBe('success')
    expect(updatedCard?.event.metadata?.summary).toBe('3 files checked')
  })
})
