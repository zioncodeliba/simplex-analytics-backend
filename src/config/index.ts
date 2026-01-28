import dotenv from 'dotenv'

dotenv.config()

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number.parseInt(process.env.PORT || '8000', 10),
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  mongoUrl: process.env.MONGO_URL || 'development',
  clientApi: process.env.CLIENT_API,
  rateLimit: {
    windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
} as const
