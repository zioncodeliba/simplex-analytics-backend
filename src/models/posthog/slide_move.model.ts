import mongoose from 'mongoose'

const from_SliderSchema = new mongoose.Schema({
  id: { type: String },
  title: { type: String },
  asset_type: { type: String },
  view_number: { type: String },
  tab: { type: String },
  real_id: { type: String },
})
const to_SliderSchema = new mongoose.Schema({
  id: { type: String },
  title: { type: String },
  asset_type: { type: String },
  view_number: { type: String },
  tab: { type: String },
  real_id: { type: String },
})
const sliderMoveSchema = new mongoose.Schema(
  {
    event_id: { type: String, unique: true },
    distinct_id: { type: String },
    session_id: { type: String },
    time: { type: Date },
    current_url: { type: String },
    from_slide: { type: from_SliderSchema },
    to_slide: { type: to_SliderSchema },
  },
  { timestamps: true, versionKey: false }
)
const SliderMoveModel = mongoose.model('slidermoveevents', sliderMoveSchema)
export default SliderMoveModel
