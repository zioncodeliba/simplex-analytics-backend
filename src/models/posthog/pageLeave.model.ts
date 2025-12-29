import mongoose from 'mongoose'

const pageLeaveSchema = new mongoose.Schema(
  {
    event_id: { type: String },
    distinct_id: { type: String },
    time: { type: Date },
    current_url: { type: String },
    real_id: { type: String },
    project_id: { type: String },
    pageview_id: { type: String },
    client_id: { type: String },
    session_duration_seconds: { type: String },
    session_duration_formatted: { type: String },
    prev_pageview_id: { type: String },
    prev_pageview_pathname: { type: String },
    prev_pageview_duration: { type: Number },
    prev_pageview_scroll: {
      last_scroll: { type: Number },
      max_scroll: { type: Number },
      last_scroll_percentage: { type: Number },
      max_scroll_percentage: { type: Number },
    },
    session: {
      id: { type: String },
      entry_url: { type: String },
      entry_pathname: { type: String },
      entry_host: { type: String },
    },
    geoip: {
      city_name: { type: String },
      country_name: { type: String },
      country_code: { type: String },
    },
  },
  { timestamps: true, versionKey: false }
)
pageLeaveSchema.index({ event_id: 1 }, { unique: true }) // for upsert & duplicate safety
pageLeaveSchema.index({ project_id: 1 }) // to quickly fetch project-wise events
pageLeaveSchema.index({ real_id: 1 }) // for per-real analytics
pageLeaveSchema.index({ distinct_id: 1 }) // user-level analytics
pageLeaveSchema.index({ time: -1 }) // fast sorting and range queries

const PageLeaveModel = mongoose.model('pageleaveevents', pageLeaveSchema)
export default PageLeaveModel
