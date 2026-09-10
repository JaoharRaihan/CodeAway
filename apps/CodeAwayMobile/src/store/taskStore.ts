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
  addLiveEvent: (taskId: string, event: TaskEventPayload) => void
  clearLiveEvents: (taskId: string) => void
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
  addLiveEvent: (taskId, event) =>
    set((s) => ({
      liveEvents: {
        ...s.liveEvents,
        [taskId]: [...(s.liveEvents[taskId] ?? []), { taskId, event, timestamp: Date.now() }],
      },
    })),
  clearLiveEvents: (taskId) =>
    set((s) => ({
      liveEvents: { ...s.liveEvents, [taskId]: [] },
    })),
}))
