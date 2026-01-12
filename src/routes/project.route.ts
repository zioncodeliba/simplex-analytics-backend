import {
  engagement_Trends,
  PerformanceChart,
  project_dashboard,
  project_data,
} from '../controllers/project.controller'
import express from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
const projectRouter = express.Router()

projectRouter.get('/dashboard', authMiddleware, project_dashboard)
projectRouter.get('/projectsdata', authMiddleware, project_data)
projectRouter.get('/performance', authMiddleware, PerformanceChart)
projectRouter.get('/engagement_trends', authMiddleware, engagement_Trends)

export default projectRouter
