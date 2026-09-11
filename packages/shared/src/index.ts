// ─── Task ────────────────────────────────────────────────────────────────────
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'waiting_approval'
  | 'testing'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'cancelled'

/** Authoritative Task State Machine Transitions */
export const VALID_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['running', 'cancelled', 'stopped'],
  running: ['paused', 'waiting_approval', 'testing', 'completed', 'failed', 'stopped', 'cancelled'],
  paused: ['running', 'stopped', 'cancelled', 'failed'],
  waiting_approval: ['running', 'stopped', 'cancelled', 'failed'],
  testing: ['running', 'completed', 'failed', 'stopped', 'cancelled'],
  completed: ['running'], // allows reopening only on explicit user follow-up
  failed: ['running'],    // allows retry only on explicit user follow-up
  stopped: ['running'],   // allows resume only on explicit user follow-up
  cancelled: [],          // strictly terminal
}

export function isValidTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true
  const allowed = VALID_TASK_TRANSITIONS[from]
  return allowed ? allowed.includes(to) : false
}

// ─── Events ──────────────────────────────────────────────────────────────────
export type EventType =
  | 'task_started'
  | 'agent_thinking'
  | 'assistant_message'
  | 'assistant_message_chunk'
  | 'action_card'
  | 'intent_classified'
  | 'file_read'
  | 'file_modified'
  | 'file_deleted'
  | 'command_started'
  | 'command_output'
  | 'command_finished'
  | 'approval_required'
  | 'error'
  | 'task_completed'
  | 'user_message'

// ─── Intent Types ────────────────────────────────────────────────────────────
export type IntentType = 'chat' | 'discussion' | 'follow_up' | 'action' | 'control'

// ─── Action Card Payload ─────────────────────────────────────────────────────
export type ActionCardKind = 'inspection' | 'edit' | 'command' | 'test'
export type ActionCardStatus = 'running' | 'success' | 'failed'

export interface ActionCardData {
  id: string
  kind: ActionCardKind
  title: string
  summary: string
  status: ActionCardStatus
  files?: string[]
  diff?: string
  command?: string
  output?: string
}

// ─── Models ──────────────────────────────────────────────────────────────────
export interface ModelInfo {
  id: string
  name: string
  provider: 'gemini' | 'anthropic' | 'openai'
  status: 'available' | 'api_key_required' | 'unavailable'
  isDefault?: boolean
}

// ─── Approval ────────────────────────────────────────────────────────────────
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

// ─── Files ───────────────────────────────────────────────────────────────────
export type FileAction = 'created' | 'modified' | 'deleted'

// ─── Agent permissions ───────────────────────────────────────────────────────
export type PermissionLevel = 'SAFE' | 'APPROVAL' | 'BLOCKED'

// ─── Shared entity shapes (used by both backend and mobile) ──────────────────
export interface TaskEventPayload {
  id?: string
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
  'task:status_changed': (payload: { taskId: string; status: TaskStatus; message?: string }) => void
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
  'agent:connect': (payload: {
    deviceId: string
    token: string
    availableModels?: ModelInfo[]
    currentProject?: string
    workspacePath?: string
    workspaces?: Array<{ name: string; path: string }>
    version?: string
  }) => void
  'agent:heartbeat': (payload: {
    deviceId: string
    availableModels?: ModelInfo[]
    currentProject?: string
    workspacePath?: string
    workspaces?: Array<{ name: string; path: string }>
    version?: string
  }) => void
  'task:event:emit': (payload: {
    taskId: string
    userId: string
    event: TaskEventPayload
  }) => void
  'task:status:ack': (payload: {
    taskId: string
    userId: string
    status: TaskStatus
    message?: string
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
    model?: string
  }) => void
  'task:followup': (payload: {
    taskId: string
    projectId: string
    message: string
    userId: string
    model?: string
  }) => void
  'task:abort': (payload: {
    taskId: string
  }) => void
  'task:pause': (payload: {
    taskId: string
  }) => void
  'task:resume': (payload: {
    taskId: string
  }) => void
  'approval:response': (payload: ApprovalResponsePayload) => void
}
