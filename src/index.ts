import app from './app'
import { startPosthogCron } from './config/cronjob'
import { config } from './config/index'

import connectDB from './config/mongodb'
import { logger } from './utils/logger'

const PORT = config.port || 3000

const startServer = async () => {
  try {
    await connectDB(config.mongoUrl)

    const server = app.listen(PORT, async () => {
      await startPosthogCron()
      logger.info(`🚀 Server is running on port ${PORT}`)
      logger.info(`📝 Environment: ${config.nodeEnv}`)
    })

    const gracefulShutdown = (signal: string) => {
      logger.info(`${signal} received. Closing server gracefully...`)
      server.close(() => {
        logger.info('Server closed')
        process.exit(0)
      })

      setTimeout(() => {
        logger.error('Forcing shutdown after timeout')
        process.exit(1)
      }, 10000)
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))

    process.on('unhandledRejection', (reason: Error) => {
      logger.error('Unhandled Rejection:', reason)
      throw reason
    })

    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', error)
      process.exit(1)
    })
  } catch (error) {
    logger.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

void startServer()
