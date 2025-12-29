import mongoose from 'mongoose'

const pageViewSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    distinct_id: { type: String },
    current_url: { type: String },
    realId: { type: String },
    session_id: { type: String },
    time: { type: Date },
  },
  { timestamps: true, versionKey: false }
)
const PageViewModel = mongoose.model('pageviewEvents', pageViewSchema)
export default PageViewModel
