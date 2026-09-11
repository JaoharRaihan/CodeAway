import { create } from 'zustand'
import type { TaskStatus, TaskEventPayload } from '@codeaway/shared'

export interface Task {
  _id: string
  prompt: string
  status: TaskStatus
  device_id: string
  project_id: string
  created_at: string
  completed_at?: string
  result?: string
}

export interface LiveEvent {
  taskId: string
  event: TaskEventPayload
  timestamp: number
}

interface TaskState {
  tasks: Task[]
  liveEvents: Record<string, LiveEvent[]>
  setTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTaskStatus: (taskId: string, status: TaskStatus) => void
  setTaskEvents: (taskId: string, events: TaskEventPayload[]) => void
  addLiveEvent: (taskId: string, event: TaskEventPayload) => void
  clearLiveEvents: (taskId: string) => void
}

function areEventsDuplicate(a: TaskEventPayload, b: TaskEventPayload): boolean {
  if (a.id && b.id && a.id === b.id) return true
  if (a.metadata?.id && b.metadata?.id && a.metadata.id === b.metadata.id) return true
  if (a.type === b.type && a.message === b.message) {
    const aMeta = JSON.stringify(a.metadata ?? {})
    const bMeta = JSON.stringify(b.metadata ?? {})
    if (aMeta === bMeta) return true
  }
  return false
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  liveEvents: {},
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
  updateTaskStatus: (taskId, status) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t._id === taskId ? { ...t, status } : t)),
    })),
  setTaskEvents: (taskId, events) =>
    set((s) => {
      const uniqueEvents: LiveEvent[] = []
      const now = Date.now()
      for (const ev of events) {
        const existingIdx = uniqueEvents.findIndex((item) => areEventsDuplicate(item.event, ev))
        if (existingIdx >= 0) {
          uniqueEvents[existingIdx] = { taskId, event: ev, timestamp: now }
        } else {
          uniqueEvents.push({ taskId, event: ev, timestamp: now })
        }
      }
      return {
        liveEvents: {
          ...s.liveEvents,
          [taskId]: uniqueEvents,
        },
      }
    }),
  addLiveEvent: (taskId, event) =>
    set((s) => {
      const current = s.liveEvents[taskId] ?? []
      const now = Date.now()

      // Check if this event updates an existing action card by card id
      if (event.metadata?.id) {
        const cardIndex = current.findIndex(
          (item) => item.event.metadata?.id === event.metadata?.id
        )
        if (cardIndex >= 0) {
          const updated = [...current]
          updated[cardIndex] = {
            ...updated[cardIndex],
            event: {
              ...updated[cardIndex].event,
              ...event,
              metadata: {
                ...updated[cardIndex].event.metadata,
                ...event.metadata,
              },
            },
            timestamp: now,
          }
          return {
            liveEvents: {
              ...s.liveEvents,
              [taskId]: updated,
            },
          }
        }
      }

      // Check for duplicate event by id or signature
      const isDuplicate = current.some((item) => areEventsDuplicate(item.event, event))
      if (isDuplicate) {
        return s // Idempotent discard
      }

      return {
        liveEvents: {
          ...s.liveEvents,
          [taskId]: [...current, { taskId, event, timestamp: now }],
        },
      }
    }),
  clearLiveEvents: (taskId) =>
    set((s) => ({
      liveEvents: { ...s.liveEvents, [taskId]: [] },
    })),
}))
