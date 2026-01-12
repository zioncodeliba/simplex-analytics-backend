import mongoose from 'mongoose'

const drawer_interaction = new mongoose.Schema(
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
    drawer_height: { type: Number },
  },
  { timestamps: true, versionKey: false }
)
drawer_interaction.index({ distinct_id: 1 })
drawer_interaction.index({ session_id: 1 })
drawer_interaction.index({ slide_id: 1 })
drawer_interaction.index({ real_id: 1 })
const drawerModel = mongoose.model('drawerinteraction', drawer_interaction)
export default drawerModel
