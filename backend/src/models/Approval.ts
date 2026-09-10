import mongoose, { Schema, Document, Types } from 'mongoose'
import type { ApprovalStatus } from '@codeaway/shared'

export interface IApproval extends Document {
  task_id: Types.ObjectId
  command: string
  reason: string
  status: ApprovalStatus
  created_at: Date
  responded_at?: Date
}

const ApprovalSchema = new Schema<IApproval>({
  task_id: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
  command: { type: String, required: true },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  created_at: { type: Date, default: Date.now },
  responded_at: { type: Date },
})

export const Approval = mongoose.model<IApproval>('Approval', ApprovalSchema)
