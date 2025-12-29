// import { authMiddleware } from '../middleware/authMiddleware'
import {
  engagement_Trends,
  PerformanceChart,
  project_dashboard,
  project_data,
} from '../controllers/project.controller'
import express from 'express'
const projectRouter = express.Router()

projectRouter.get('/dashboard', project_dashboard)
projectRouter.get('/projectsdata', project_data)
projectRouter.get('/performance', PerformanceChart)
projectRouter.get('/engagement_trends', engagement_Trends)

export default projectRouter
