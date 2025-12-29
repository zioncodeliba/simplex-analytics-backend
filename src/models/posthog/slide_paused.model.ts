import mongoose from 'mongoose'

const slidePaused = new mongoose.Schema(
  {
    event_id: { type: String, unique: true },
    distinct_id: { type: String },
    session_id: { type: String },
    time: { type: Date },
    slide_id: { type: String },
    slide_type: { type: String },
    slide_index: { type: Number },
    remaining_time_ms: { type: Number },
    real_id: { type: String },
    pause_source: { type: String },
  },
  { timestamps: true, versionKey: false }
)
const SlidePausedModel = mongoose.model('slidepause', slidePaused)
export default SlidePausedModel
