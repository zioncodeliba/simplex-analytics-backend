import express from 'express'
import {
  performanceChart,
  unitDashboard,
  unitData,
} from '../controllers/unit.controller'

const unitRoutes = express.Router()

unitRoutes.get('/dashboard', unitDashboard)
unitRoutes.get('/', unitData)
unitRoutes.get('/performance', performanceChart)
export default unitRoutes
