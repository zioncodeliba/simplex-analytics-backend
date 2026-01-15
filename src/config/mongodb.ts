import mongoose from 'mongoose'
import { logger } from '../utils/logger'
const connectDB = async (mongoURI: string): Promise<void> => {
  try {
    if (!mongoURI) {
      throw new Error('❌ MONGO_URL not found in environment variables')
    }

    const mongooseOptions: mongoose.ConnectOptions = {
      autoIndex: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
    }

    await mongoose.connect(mongoURI, mongooseOptions)
    logger.info('✅ MongoDB Connected Successfully')

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ MongoDB disconnected')
    })

    mongoose.connection.on('error', (err) => {
      logger.error('❌ MongoDB connection error:', err)
    })
  } catch (error) {
    logger.error('❌ MongoDB Connection Failed:', error)
    process.exit(1)
  }
}

export default connectDB
