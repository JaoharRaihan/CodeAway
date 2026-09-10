// ─── Task ────────────────────────────────────────────────────────────────────
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

// ─── Events ──────────────────────────────────────────────────────────────────
export type EventType =
  | 'task_started'
  | 'file_read'
  | 'file_modified'
  | 'command_started'
  | 'command_finished'
  | 'approval_required'
  | 'error'
  | 'task_completed'

// ─── Approval ────────────────────────────────────────────────────────────────
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

// ─── Files ───────────────────────────────────────────────────────────────────
export type FileAction = 'created' | 'modified' | 'deleted'

// ─── Agent permissions ───────────────────────────────────────────────────────
export type PermissionLevel = 'SAFE' | 'APPROVAL' | 'BLOCKED'

// ─── Shared entity shapes (used by both backend and mobile) ──────────────────
export interface TaskEventPayload {
  type: EventType
  message: string
  metadata?: Record<string, unknown>
}

export interface TaskCompletedPayload {
  taskId: string
  result: string
  files: Array<{
    file_path: string
    action: FileAction
    diff?: string
  }>
}

export interface ApprovalRequestPayload {
  taskId: string
  approvalId: string
  command: string
  reason: string
}

export interface ApprovalResponsePayload {
  approvalId: string
  taskId: string
  decision: 'approved' | 'rejected'
}

// ─── Socket.IO event map ─────────────────────────────────────────────────────
/** Events the server emits to mobile clients */
export interface ServerToClientEvents {
  'task:created': (payload: { taskId: string }) => void
  'task:status_changed': (payload: { taskId: string; status: TaskStatus }) => void
  'task:event': (payload: { taskId: string; event: TaskEventPayload }) => void
  'task:completed': (payload: TaskCompletedPayload) => void
  'approval:required': (payload: ApprovalRequestPayload) => void
}

/** Events the mobile client sends to server */
export interface ClientToServerEvents {
  'user:join': (payload: { userId: string }) => void
}

/** Events the laptop agent sends to server */
export interface AgentToServerEvents {
  'agent:connect': (payload: { deviceId: string; token: string }) => void
  'agent:heartbeat': (payload: { deviceId: string }) => void
  'task:event:emit': (payload: {
    taskId: string
    userId: string
    event: TaskEventPayload
  }) => void
  'task:complete': (payload: TaskCompletedPayload & { userId: string }) => void
  'approval:request': (payload: ApprovalRequestPayload & { userId: string }) => void
}

/** Events the server sends to the laptop agent */
export interface ServerToAgentEvents {
  'task:new': (payload: {
    taskId: string
    projectId: string
    prompt: string
    userId: string
  }) => void
  'approval:response': (payload: ApprovalResponsePayload) => void
}
