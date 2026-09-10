import mongoose, { Schema, Document, Types } from 'mongoose'
import type { FileAction } from '@codeaway/shared'

export interface ITaskFile extends Document {
  task_id: Types.ObjectId
  file_path: string
  action: FileAction
  diff?: string
  created_at: Date
}

const TaskFileSchema = new Schema<ITaskFile>({
  task_id: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
  file_path: { type: String, required: true },
  action: {
    type: String,
    enum: ['created', 'modified', 'deleted'],
    required: true,
  },
  diff: { type: String },
  created_at: { type: Date, default: Date.now },
})

export const TaskFile = mongoose.model<ITaskFile>('TaskFile', TaskFileSchema)
