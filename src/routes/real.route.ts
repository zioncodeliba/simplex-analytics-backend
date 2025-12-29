import {
  popupSliders,
  real_Dashboard,
  Reals_Data,
  REALS_UsageTrends,
} from '../controllers/reals.controller'
import express from 'express'

const realsRouter = express.Router()

realsRouter.get('/dashboard', real_Dashboard)
realsRouter.get('/', Reals_Data)
realsRouter.get('/trends', REALS_UsageTrends)
realsRouter.get('/popup', popupSliders)
export default realsRouter
