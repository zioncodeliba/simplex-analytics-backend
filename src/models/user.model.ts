import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    email: { type: String, unique: true },
    name: { type: String },
    refreshTokenHash: { type: String, require: true },
    client_id: { type: String },
    isVerified: { type: Boolean },
    userType: {
      type: String,
      enum: ['Admin', 'User', 'Manager'],
      default: 'User',
    },
    authToken: { type: String, require: true },
    projects_allowed: [],
    projects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
      },
    ],
  },
  { timestamps: true }
)

userSchema.index({ userId: 1 })

export const UserModel = mongoose.model('User', userSchema)
export default UserModel
