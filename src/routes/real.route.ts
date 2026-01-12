import {
  popupSliders,
  real_Dashboard,
  Reals_Data,
  REALS_UsageTrends,
} from '../controllers/reals.controller'
import express from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'

const realsRouter = express.Router()

realsRouter.get('/dashboard', authMiddleware, real_Dashboard)
realsRouter.get('/', authMiddleware, Reals_Data)
realsRouter.get('/trends', authMiddleware, REALS_UsageTrends)
realsRouter.get('/popup', authMiddleware, popupSliders)
export default realsRouter
