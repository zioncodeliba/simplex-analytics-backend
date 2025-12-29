import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    userType: {
      type: String,
      enum: ['Admin', 'User', 'Manager'],
      default: 'User',
    },
    authToken: { type: String },
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
