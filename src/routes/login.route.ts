import { userData } from '../controllers/login.controller'
import express from 'express'

const loginRouter = express.Router()

loginRouter.post('/login', userData)

export default loginRouter
