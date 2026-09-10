import mongoose, { Schema, Document, Types } from 'mongoose'
import type { TaskStatus } from '@codeaway/shared'

export interface ITask extends Document {
  user_id: Types.ObjectId
  device_id: Types.ObjectId
  project_id: Types.ObjectId
  prompt: string
  status: TaskStatus
  started_at?: Date
  completed_at?: Date
  result?: string
  error?: string
  created_at: Date
}

const TaskSchema = new Schema<ITask>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  device_id: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
  project_id: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  prompt: { type: String, required: true },
  status: {
    type: String,
    enum: ['queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled'],
    default: 'queued',
    index: true,
  },
  started_at: { type: Date },
  completed_at: { type: Date },
  result: { type: String },
  error: { type: String },
  created_at: { type: Date, default: Date.now },
})

export const Task = mongoose.model<ITask>('Task', TaskSchema)
