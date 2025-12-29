import mongoose from 'mongoose'

const unitSchema = new mongoose.Schema(
  {
    unitId: { type: String, required: true, unique: true },
    unitName: { type: String, required: true },
    availability: { type: String, default: 'Available' },
    real: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Real', required: true },
    ],
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
  },
  { timestamps: true }
)

unitSchema.index({ real: 1 })
unitSchema.index({ project: 1 })

export const UnitModel = mongoose.model('Unit', unitSchema)
export default UnitModel
