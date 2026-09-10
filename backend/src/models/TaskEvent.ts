import mongoose, { Schema, Document, Types } from 'mongoose'
import type { EventType } from '@codeaway/shared'

export interface ITaskEvent extends Document {
  task_id: Types.ObjectId
  event_type: EventType
  message: string
  metadata?: Record<string, unknown>
  created_at: Date
}

const TaskEventSchema = new Schema<ITaskEvent>({
  task_id: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
  event_type: {
    type: String,
    enum: [
      'task_started',
      'file_read',
      'file_modified',
      'command_started',
      'command_finished',
      'approval_required',
      'error',
      'task_completed',
    ],
    required: true,
  },
  message: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now },
})

export const TaskEvent = mongoose.model<ITaskEvent>('TaskEvent', TaskEventSchema)
