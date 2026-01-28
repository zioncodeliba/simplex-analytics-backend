import cron from 'node-cron'
import mongoose from 'mongoose'
import UserModel from '../models/user.model'
import ProjectModel from '../models/project.model'
import RealModel from '../models/reals'
import {
  getme,
  getProjects,
  getReals,
  ExternalProject,
  ExternalReal,
  AuthUserResponse,
} from '../services/authClient'
import { logger } from '../utils/logger'
import { acquireCronLock, releaseCronLock } from './cronLock'
interface TotalRealsAggResult {
  totalReals: number
}

interface ExtendedExternalReal extends ExternalReal {
  client_id?: string
}

let isRunning = false
type SyncMode = 'INCREMENTAL' | 'FULL'

interface IProjectDoc {
  _id: mongoose.Types.ObjectId
  projectId: string
}

interface IRealDoc {
  _id: mongoose.Types.ObjectId
  realId: string
}

async function safeRunner(fn: () => Promise<void>): Promise<void> {
  if (isRunning) {
    logger.warn('⛔ Admin Cron: Skipped - another admin sync is still running')
    return
  }

  if (!acquireCronLock()) {
    logger.warn('⛔ Admin Cron: Skipped - another cron job is running')
    return
  }

  isRunning = true
  const jobName = fn.name

  try {
    logger.info(`▶ Admin Cron START: ${jobName}`)
    await fn()
    logger.info(`✔ Admin Cron FINISHED: ${jobName}`)
  } catch (err) {
    logger.error(`❌ Admin Cron ERROR in ${jobName}:`, err)
  } finally {
    isRunning = false
    releaseCronLock()
  }
}
async function fetchUserWithToken(): Promise<{
  userId: string
  authToken: string
} | null> {
  const TARGET_USER_ID = process.env.ADMIN_ID
  if (!TARGET_USER_ID) {
    logger.error('❌ ADMIN_ID environment variable is not set')
    return null
  }

  try {
    const user = await UserModel.findOne({ userId: TARGET_USER_ID })
      .select('userId authToken')
      .lean()

    if (!user) {
      logger.error(`❌ User not found with userId: ${TARGET_USER_ID}`)
      return null
    }

    if (!user.authToken) {
      logger.error(`❌ AuthToken not found for user: ${TARGET_USER_ID}`)
      return null
    }

    logger.info(`✅ User found: ${user.userId}`)
    return {
      userId: user.userId,
      authToken: user.authToken,
    }
  } catch (error) {
    logger.error('❌ Error fetching user:', error)
    throw error
  }
}

async function processAndSaveUser(authToken: string): Promise<string> {
  try {
    logger.info('👤 Fetching user data from API (getme)...')

    const authUser: AuthUserResponse = await getme(authToken)

    if (!authUser?.user?._id) {
      throw new Error('Invalid auth response from getme()')
    }

    logger.info(
      `✅ User data fetched: ${authUser.user.name} (${authUser.user.email})`
    )

    await UserModel.findOneAndUpdate(
      { userId: authUser.user._id },
      {
        userId: authUser.user._id,
        name: authUser.user.name,
        email: authUser.user.email,
        userType: authUser.user.role,
        client_id: authUser.user.client_id,
        projects_allowed: authUser.user.projects_allowed,
        refreshTokenHash: authUser.user.refreshTokenHash,
        authToken: authToken,
      },
      { new: true, upsert: true }
    )

    logger.info(`✅ User saved to database: ${authUser.user._id}`)
    return authUser.user.client_id
  } catch (error) {
    logger.error('❌ Error processing user:', error)
    throw error
  }
}

async function processAndSaveProjects(
  authToken: string,
  clientId: string
): Promise<Record<string, mongoose.Types.ObjectId>> {
  try {
    logger.info('📦 Fetching projects from API...')

    const projectResponse = await getProjects(authToken)

    const projectList: ExternalProject[] = Array.isArray(projectResponse)
      ? projectResponse
      : (projectResponse as { projects?: ExternalProject[] }).projects || []

    if (projectList.length === 0) {
      logger.warn('⚠️ No projects found in API response')
      return {}
    }

    logger.info(`✅ Found ${projectList.length} projects in API`)

    const projectBulkOps: mongoose.AnyBulkWriteOperation[] = projectList.map(
      (p) => ({
        updateOne: {
          filter: { projectId: p._id },
          update: {
            projectId: p._id,
            projectName: p.name,
            client_id: clientId,
          },
          upsert: true,
        },
      })
    )

    if (projectBulkOps.length > 0) {
      await ProjectModel.bulkWrite(projectBulkOps)
      logger.info(`✅ Saved ${projectBulkOps.length} projects to database`)
    }

    const projectsInDb = (await ProjectModel.find({
      projectId: { $in: projectList.map((p) => p._id) },
    })) as unknown as IProjectDoc[]

    const projectMap: Record<string, mongoose.Types.ObjectId> = {}
    projectsInDb.forEach((p) => {
      projectMap[p.projectId] = p._id
    })

    logger.info(`✅ Processed ${Object.keys(projectMap).length} projects`)
    return projectMap
  } catch (error) {
    logger.error('❌ Error processing projects:', error)
    throw error
  }
}

async function getTotalRealsCount(userId: string): Promise<number> {
  try {
    const user = await UserModel.findOne({ userId }).select('projects').lean()
    if (!user || !user.projects || user.projects.length === 0) {
      return 0
    }
    const result = await ProjectModel.aggregate<TotalRealsAggResult>([
      {
        $match: {
          _id: { $in: user.projects },
        },
      },
      {
        $group: {
          _id: null,
          totalReals: {
            $sum: {
              $size: {
                $ifNull: ['$reals', []],
              },
            },
          },
        },
      },
    ])

    const totalReals: number = result[0]?.totalReals || 0
    logger.info(`📊 Total reals count from user's projects: ${totalReals}`)
    return totalReals
  } catch (error) {
    logger.error('❌ Error calculating total reals count:', error)
    throw error
  }
}
/* eslint-disable sonarjs/cognitive-complexity */
async function processAndSaveReals(
  authToken: string,
  projectMap: Record<string, mongoose.Types.ObjectId>,
  clientId: string,
  userId: string,
  mode: SyncMode
): Promise<void> {
  try {
    logger.info('🎬 Processing reals...')

    const totalRealsCount = await getTotalRealsCount(userId)
    logger.info(`📊 Total reals in user's projects: ${totalRealsCount}`)

    const limit = 500
    let offset = mode === 'FULL' ? 0 : totalRealsCount
    let hasMore = true
    const allReals: ExtendedExternalReal[] = []

    logger.info(
      mode === 'FULL'
        ? '🔁 12-hour FULL fetch (upsert only)'
        : '➕ 1-hour incremental fetch'
    )

    while (hasMore) {
      try {
        const { reals, pagination } = await getReals(authToken, offset, limit)
        allReals.push(...(reals as ExtendedExternalReal[]))

        hasMore = pagination.hasMore
        offset += limit

        logger.info(`  Fetched ${allReals.length} reals so far...`)

        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 400))
        }
      } catch (error) {
        logger.error(`❌ Error fetching reals at offset ${offset}:`, error)
        break
      }
    }

    logger.info(`✅ Fetched ${allReals.length} reals from API`)

    if (allReals.length === 0) {
      logger.info('✅ No reals to save')
      return
    }

    const existingReals = await RealModel.find({}).select('realId').lean()
    const existingRealIds = new Set(existingReals.map((r) => r.realId))
    logger.info(`📊 Found ${existingRealIds.size} existing reals in database`)

    const newReals = allReals.filter((r) => !existingRealIds.has(r._id))
    logger.info(
      `📊 Filtered: ${allReals.length} total fetched, ${newReals.length} new reals to save`
    )

    if (newReals.length === 0) {
      logger.info('✅ No new reals to save')
      return
    }

    const realBulkOps: mongoose.AnyBulkWriteOperation[] = []
    for (const r of newReals) {
      const realProjectId = r.project_id
      if (!realProjectId) {
        continue
      }

      const projectLocalId = projectMap[realProjectId]
      if (!projectLocalId) {
        continue
      }

      const extendedReal = r
      realBulkOps.push({
        updateOne: {
          filter: { realId: r._id },
          update: {
            realId: r._id,
            realName: r.intro_screen_text,
            raw: r,
            project: projectLocalId,
            client_id: clientId || extendedReal.client_id || '',
          },
          upsert: true,
        },
      })
    }

    if (realBulkOps.length > 0) {
      await RealModel.bulkWrite(realBulkOps)
      logger.info(`✅ Saved ${realBulkOps.length} reals to database`)
    }

    const savedReals = (await RealModel.find({
      realId: { $in: newReals.map((r) => r._id) },
    })) as unknown as IRealDoc[]

    const realMap: Record<string, mongoose.Types.ObjectId> = {}
    savedReals.forEach((r) => {
      realMap[r.realId] = r._id
    })

    const realProjectOps: mongoose.AnyBulkWriteOperation[] = []
    for (const r of newReals) {
      const realProjectId = r.project_id
      const realId = r._id

      if (!realProjectId || !realId) continue

      const projectLocalId = projectMap[realProjectId]
      const realMongoId = realMap[realId]

      if (!projectLocalId || !realMongoId) continue

      realProjectOps.push({
        updateOne: {
          filter: { _id: projectLocalId },
          update: { $addToSet: { reals: realMongoId } },
        },
      })
    }

    if (realProjectOps.length > 0) {
      await ProjectModel.bulkWrite(realProjectOps)
      logger.info(`✅ Linked ${realProjectOps.length} reals to projects`)
    }

    logger.info(`✔ Completed processing ${newReals.length} new reals`)
  } catch (error) {
    logger.error('❌ Error processing reals:', error)
    throw error
  }
}

async function runAdminSync(mode: SyncMode = 'INCREMENTAL'): Promise<void> {
  try {
    const userData = await fetchUserWithToken()
    if (!userData) {
      throw new Error('Failed to fetch user or authToken')
    }

    const { authToken, userId } = userData

    const clientId = await processAndSaveUser(authToken)

    const projectMap = await processAndSaveProjects(authToken, clientId)

    if (Object.keys(projectMap).length === 0) {
      logger.warn('⚠️ No projects to process, skipping reals sync')
      return
    }

    await processAndSaveReals(authToken, projectMap, clientId, userId, mode)

    logger.info('🎉 Admin sync completed successfully!')
  } catch (error) {
    logger.error('❌ Admin sync failed:', error)
    throw error
  }
}

export const startAdminCron = async (): Promise<void> => {
  try {
    logger.info('🚀 Starting Admin Cron Job...')

    await safeRunner(() => runAdminSync('INCREMENTAL'))

    cron.schedule('0 * * * *', () => {
      void safeRunner(() => runAdminSync('INCREMENTAL'))
    })
    cron.schedule('0 */12 * * *', () => {
      void safeRunner(() => runAdminSync('FULL'))
    })

    logger.info('⏳ Admin Cron jobs scheduled (1h incremental, 12h full)')
  } catch (error) {
    logger.error('❌ Failed to start Admin Cron:', error)
    throw error
  }
}
