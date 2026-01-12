import mongoose from 'mongoose'

const zoom_interaction = new mongoose.Schema(
  {
    event_id: { type: String, unique: true },
    distinct_id: { type: String },
    session_id: { type: String },
    time: { type: Date },
    slide_id: { type: String },
    slide_type: { type: String },
    slide_index: { type: Number },
    real_id: { type: String },
    action: { type: String },
    zoom_scale: { type: Number },
  },
  { timestamps: true, versionKey: false }
)
zoom_interaction.index({ distinct_id: 1 })
zoom_interaction.index({ session_id: 1 })
zoom_interaction.index({ slide_id: 1 })
zoom_interaction.index({ real_id: 1 })

const zoomModel = mongoose.model('zoomintersction', zoom_interaction)
export default zoomModel
