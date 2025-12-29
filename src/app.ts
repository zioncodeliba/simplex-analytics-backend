import express, { Application, Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
// import { rateLimiter } from './middlewares/rateLimiter'
import loginRouter from './routes/login.route'
import projectRouter from './routes/project.route'
import realsRouter from './routes/real.route'
import unitRoutes from './routes/unit.route'
import { notFoundHandler } from './middlewares/notFoundHandler'
import { errorHandler } from './middlewares/errorHandler'
import { logger } from './utils/logger'
import { config } from './config/index'
import authrouter from './routes/externalAuth.route'

const app: Application = express()

// Security middleware
app.use(helmet())
app.use(cors(config.cors))

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Compression middleware
app.use(compression())

// HTTP request logger
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'))
} else {
  app.use(
    morgan('combined', {
      stream: {
        write: (message: string) => logger.info(message.trim()),
      },
    })
  )
}

// Rate limiting

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
  })
})

// API routes
app.use('/api', loginRouter)
app.use('/external-auth', authrouter)
app.use('/project', projectRouter)
app.use('/reals', realsRouter)
app.use('/unit', unitRoutes)
// 404 handler
app.use(notFoundHandler)

// Error handler (must be last)
app.use(errorHandler)

export default app
