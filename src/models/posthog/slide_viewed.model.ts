import mongoose from 'mongoose'

const sliderViewed = new mongoose.Schema(
  {
    id: { type: String },
    distinct_id: { type: String },
    slide_title: { type: String },
    real_id: { type: String },
    slide_index: { type: String },
    view_duration: { type: String },
    client_id: { type: String },
    slide_id: { type: String },
    total_slides: { type: String },
    project_id: { type: String },
    session_duration_seconds: { type: String },
    session_duration_formatted: { type: String },
    duration: { type: Number },
    time: { type: Date },
  },
  { versionKey: false, timestamps: true }
)
sliderViewed.index({ id: 1 })
sliderViewed.index({ distinct_id: 1 })
sliderViewed.index({ real_id: 1 })
const sliderViewdModel = mongoose.model('sliderviewed', sliderViewed)
export default sliderViewdModel
