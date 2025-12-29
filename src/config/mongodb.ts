import mongoose from 'mongoose'
import { logger } from '../utils/logger'
const connectDB = async (mongoURI: string): Promise<void> => {
  try {
    if (!mongoURI) {
      throw new Error('❌ MONGO_URL not found in environment variables')
    }

    // ✅ Recommended Mongoose connection options
    const mongooseOptions: mongoose.ConnectOptions = {
      autoIndex: false, // disable auto-creation of indexes in production
      maxPoolSize: 10, // maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // retry for 5 seconds
      socketTimeoutMS: 45000, // close sockets after 45 seconds of inactivity
      family: 4, // use IPv4
    }

    // 🟢 Connect to MongoDB
    await mongoose.connect(mongoURI, mongooseOptions)

    // console.log(
    //   `Server is running on port ${config.port} and DataBase Connected 🚀`
    // )
    // or if using winston:
    logger.info('✅ MongoDB Connected Successfully')

    // 🟣 Listen for disconnection events
    mongoose.connection.on('disconnected', () => {
      // console.error('⚠️ MongoDB disconnected')
      logger.warn('⚠️ MongoDB disconnected')
    })

    mongoose.connection.on('error', (err) => {
      // console.error('❌ MongoDB connection error:', err)
      logger.error('❌ MongoDB connection error:', err)
    })
  } catch (error) {
    // console.error('❌ MongoDB Connection Failed:', error)
    logger.error('❌ MongoDB Connection Failed:', error)
    process.exit(1) // Exit process with failure (important for production)
  }
}

export default connectDB
