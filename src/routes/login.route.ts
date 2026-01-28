import {
  usermapping,
  syncUserAndProjects,
} from '../controllers/login.controller'
import express from 'express'

const loginRouter = express.Router()

// loginRouter.post('/login', userData)
loginRouter.get('/', usermapping)
loginRouter.get('/save-login-time', syncUserAndProjects)

export default loginRouter
