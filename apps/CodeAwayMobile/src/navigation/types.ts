export type TabType = 'home' | 'tasks' | 'projects' | 'devices' | 'settings'

export type RootStackParamList = {
  Main: { initialTab?: TabType } | undefined
  NewTask: { deviceId?: string; projectId?: string } | undefined
  TaskDetail: { taskId: string }
}


