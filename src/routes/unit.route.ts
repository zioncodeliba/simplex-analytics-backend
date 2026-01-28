import express from 'express'
import {
  performanceChart,
  unitDashboard,
  unitData,
} from '../controllers/unit.controller'
import { authMiddleware } from '../middlewares/authMiddleware'

const unitRoutes = express.Router()

unitRoutes.get('/dashboard', authMiddleware, unitDashboard)
unitRoutes.get('/', authMiddleware, unitData)
unitRoutes.get('/performance', authMiddleware, performanceChart)
export default unitRoutes
