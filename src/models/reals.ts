import mongoose from 'mongoose'

const realSchema = new mongoose.Schema(
  {
    realId: { type: String, required: true, unique: true },
    realName: { type: String, required: true },
    salesperson_email: { type: String },
    salesperson_name: { type: String },
    client_name: { type: String },
    client_id: { type: String },
    project: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
      },
    ],

    // 👇 add reference to units
    units: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Unit' }],
  },
  { timestamps: true }
)

export const RealModel = mongoose.model('Real', realSchema)
export default RealModel
