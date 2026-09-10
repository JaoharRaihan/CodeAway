import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IDevice extends Document {
  user_id: Types.ObjectId
  name: string
  platform: string
  hostname: string
  agent_version: string
  status: 'online' | 'offline'
  socket_id?: string
  last_seen_at?: Date
  created_at: Date
}

const DeviceSchema = new Schema<IDevice>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  platform: { type: String, default: 'unknown' },
  hostname: { type: String, default: 'unknown' },
  agent_version: { type: String, default: '0.0.1' },
  status: { type: String, enum: ['online', 'offline'], default: 'offline' },
  socket_id: { type: String },
  last_seen_at: { type: Date },
  created_at: { type: Date, default: Date.now },
})

export const Device = mongoose.model<IDevice>('Device', DeviceSchema)
