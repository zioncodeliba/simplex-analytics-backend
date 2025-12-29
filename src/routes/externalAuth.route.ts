import express from 'express'
import { externalAuthController } from '../controllers/externalAuth.controller'

const authrouter = express.Router()

authrouter.post('/', externalAuthController)

export default authrouter
