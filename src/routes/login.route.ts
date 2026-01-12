import { usermapping } from '../controllers/login.controller'
import express from 'express'

const loginRouter = express.Router()

// loginRouter.post('/login', userData)
loginRouter.post('/', usermapping)

export default loginRouter
