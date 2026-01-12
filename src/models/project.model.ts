import mongoose from 'mongoose'

const projectSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, unique: true },
    projectName: { type: String },
    client_id: { type: String },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, default: 'Active' },
    reals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Real' }],
  },
  { timestamps: true }
)

export const ProjectModel = mongoose.model('Project', projectSchema)
export default ProjectModel
