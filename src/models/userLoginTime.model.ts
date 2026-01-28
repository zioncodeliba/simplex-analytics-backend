import mongoose from 'mongoose'

const userLoginTimeSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      ref: 'User',
    },
    lastLoginTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastProjectSyncTime: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
)

userLoginTimeSchema.index({ userId: 1 })
userLoginTimeSchema.index({ lastLoginTime: 1 })

export const UserLoginTimeModel = mongoose.model(
  'UserLoginTime',
  userLoginTimeSchema
)
export default UserLoginTimeModel
