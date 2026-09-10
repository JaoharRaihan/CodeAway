import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IProject extends Document {
  device_id: Types.ObjectId
  user_id: Types.ObjectId
  name: string
  path: string
  repository_url?: string
  branch?: string
  created_at: Date
}

const ProjectSchema = new Schema<IProject>({
  device_id: { type: Schema.Types.ObjectId, ref: 'Device', required: true, index: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  path: { type: String, required: true },
  repository_url: { type: String },
  branch: { type: String, default: 'main' },
  created_at: { type: Date, default: Date.now },
})

export const Project = mongoose.model<IProject>('Project', ProjectSchema)
