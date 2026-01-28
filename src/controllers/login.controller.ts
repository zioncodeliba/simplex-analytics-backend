/* eslint-disable sonarjs/cognitive-complexity */
import axios from 'axios'
// import bcrypt from 'bcrypt'
// import jwt from 'jsonwebtoken'
import { Request, Response } from 'express'
import UserModel from '../models/user.model'
import mongoose from 'mongoose'
import ProjectModel from '../models/project.model'
import RealModel from '../models/reals'
import UserLoginTimeModel from '../models/userLoginTime.model'
import { getme, getProjects } from '../services/authClient'
import { logger } from '../utils/logger'
import { getAllReals } from '../services/helper'

interface ExternalUser {
  _id: string
  name: string
  email: string
  role: string
  client_id: string
  projects_allowed: string[]
  refreshTokenHash: string
}

interface AuthUserResponse {
  user: ExternalUser
}

interface ExternalProject {
  _id: string
  name: string
}

interface ExternalReal {
  _id: string
  project_id: string
  intro_screen_text: string
  client_id: string
}

interface IProjectDoc {
  _id: mongoose.Types.ObjectId
  projectId: string
}

interface IRealDoc {
  _id: mongoose.Types.ObjectId
  realId: string
}
// export const userData = async (req: Request, res: Response) => {
//   // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
//   const { token } = req.body
//   if (!token) {
//     return res.status(400).json({ message: 'token is required' })
//   }

//   try {
//     const tokenApi = process.env.EXTERNAL_AUTH_URL
//     if (!tokenApi) {
//       return res.status(500).json({
//         message: 'Missing EXTERNAL_AUTH_URL in environment',
//       })
//     }

//     // 🔹 1️⃣ Verify with client API
//     const externalResp = await axios.post<ExternalUserResponse>(
//       tokenApi,
//       req.body
//     )
//     const { userId, userType = 'User', projects = [] } = externalResp.data || {}

//     // 🔹 2️⃣ Hash & sign
//     const hashedExternalToken = await bcrypt.hash(String(token), 10)
//     const jwtSecret = process.env.JWT_SECRET!
//     const jwtToken = jwt.sign({ userId, userType }, jwtSecret, {
//       expiresIn: '7d',
//     })

//     // 🔹 3️⃣ Upsert User
//     const user = await UserModel.findOneAndUpdate(
//       { userId },
//       { userId, userType, authToken: hashedExternalToken },
//       { upsert: true, new: true }
//     )

//     const projectIds: mongoose.Types.ObjectId[] = []

//     // 🔹 4️⃣ Sync Projects / Reals / Units
//     for (const proj of projects) {
//       const projectDoc = await ProjectModel.findOneAndUpdate(
//         { projectId: proj.projectId },
//         {
//           projectId: proj.projectId,
//           projectName: proj.projectName,
//           $addToSet: { users: user._id },
//         },
//         { upsert: true, new: true }
//       )

//       projectIds.push(projectDoc._id)

//       const realIds: mongoose.Types.ObjectId[] = []

//       if (Array.isArray(proj.reals)) {
//         for (const real of proj.reals) {
//           const realDoc = await RealModel.findOneAndUpdate(
//             { realId: real.realId },
//             {
//               realId: real.realId,
//               realName: real.realName,
//               project: projectDoc._id,
//             },
//             { upsert: true, new: true }
//           )

//           const unitIds: mongoose.Types.ObjectId[] = []

//           if (Array.isArray(real.entities)) {
//             for (const entity of real.entities) {
//               const unitDoc = await UnitModel.findOneAndUpdate(
//                 { unitId: entity.unitId },
//                 {
//                   unitId: entity.unitId,
//                   unitName: entity.unitName,
//                   availability: entity.availability || 'Available',
//                   $addToSet: { real: realDoc._id },
//                   project: projectDoc._id,
//                 },
//                 { upsert: true, new: true }
//               )

//               unitIds.push(unitDoc._id)
//             }
//           }

//           // link units → real
//           realDoc.units = unitIds
//           await realDoc.save()

//           realIds.push(realDoc._id)
//         }
//       }

//       // link reals → project
//       projectDoc.reals = realIds
//       await projectDoc.save()
//     }

//     // 🔹 5️⃣ Link projects → user
//     user.projects = projectIds
//     await user.save()

//     // 🔹 6️⃣ Populate everything
//     const userDoc = await UserModel.findById(user._id)
//       .populate({
//         path: 'projects',
//         populate: {
//           path: 'reals',
//           populate: {
//             path: 'units',
//           },
//         },
//       })
//       .lean()

//     // 🔹 7️⃣ Set cookie & send response
//     res.cookie('token', jwtToken, {
//       httpOnly: true,
//       maxAge: 7 * 24 * 60 * 60 * 1000,
//       path: '/',
//     })

//     return res.status(200).json({
//       message: 'Login success',
//       user: userDoc,
//     })
//   } catch (error) {
//     return res.status(500).json({ message: 'Login failed', error })
//   }
// }
export const usermapping = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({ message: 'Authorization header missing' })
  }
  const authtoken = authHeader.split(' ')[1]
  if (!authtoken) {
    return res.status(400).json({ message: 'token is required' })
  }

  try {
    const [authUser, projectResponse, realResponse] = (await Promise.all([
      getme(authtoken),
      getProjects(authtoken),
      getAllReals(authtoken),
    ])) as [
      AuthUserResponse,
      ExternalProject[] | { projects: ExternalProject[] },
      ExternalReal[] | { reals: ExternalReal[] },
    ]

    if (!authUser?.user?._id) {
      throw new Error('Invalid auth response')
    }

    // 🔹 UPSERT USER
    const user = await UserModel.findOneAndUpdate(
      { userId: authUser.user._id },
      {
        userId: authUser.user._id,
        name: authUser.user.name,
        email: authUser.user.email,
        userType: authUser.user.role,
        client_id: authUser.user.client_id,
        projects_allowed: authUser.user.projects_allowed,
        refreshTokenHash: authUser.user.refreshTokenHash,
        authToken: authtoken,
      },
      { new: true, upsert: true }
    )

    // 🔹 NORMALIZE PROJECTS
    const projectList: ExternalProject[] = Array.isArray(projectResponse)
      ? projectResponse
      : (projectResponse as { projects?: ExternalProject[] }).projects || []

    // 🔹 UPSERT PROJECTS (BULK)
    const projectBulkOps: mongoose.AnyBulkWriteOperation[] = projectList.map(
      (p) => ({
        updateOne: {
          filter: { projectId: p._id },
          update: {
            projectId: p._id,
            projectName: p.name,
            client_id: authUser.user.client_id,
          },
          upsert: true,
        },
      })
    )

    if (projectBulkOps.length) {
      await ProjectModel.bulkWrite(projectBulkOps)
    }

    // 🔹 FETCH PROJECTS FROM DB
    const projectsInDb = (await ProjectModel.find({
      projectId: { $in: projectList.map((p) => p._id) },
    })) as unknown as IProjectDoc[]

    const projectIds = projectsInDb.map((p) => p._id)
    const projectMap: Record<string, mongoose.Types.ObjectId> = {}

    projectsInDb.forEach((p) => {
      projectMap[p.projectId] = p._id
    })

    // 🔹 USER → PROJECTS (ONE UPDATE ONLY ✅)
    if (projectIds.length && user) {
      await UserModel.updateOne(
        { _id: user._id },
        { $addToSet: { projects: { $each: projectIds } } }
      )
    }

    // 🔹 PROJECT → USER (BULK)
    const projectUserOps: mongoose.AnyBulkWriteOperation[] = projectIds.map(
      (pid) => ({
        updateOne: {
          filter: { _id: pid },
          update: { $addToSet: { users: user?._id } },
        },
      })
    )

    if (projectUserOps.length) {
      await ProjectModel.bulkWrite(projectUserOps)
    }

    // 🔹 NORMALIZE REALS
    const reals: ExternalReal[] = Array.isArray(realResponse)
      ? realResponse
      : (realResponse as { reals?: ExternalReal[] }).reals || []

    // 🔹 UPSERT REALS (BULK)
    const realBulkOps: mongoose.AnyBulkWriteOperation[] = []
    for (const r of reals) {
      const projectLocalId = projectMap[r.project_id]
      if (!projectLocalId) continue

      realBulkOps.push({
        updateOne: {
          filter: { realId: r._id },
          update: {
            realId: r._id,
            realName: r.intro_screen_text,
            raw: r,
            project: projectLocalId,
            client_id: r.client_id,
          },
          upsert: true,
        },
      })
    }

    if (realBulkOps.length) {
      await RealModel.bulkWrite(realBulkOps)
    }

    // 🔹 FETCH REALS TO GET MONGO _id
    const savedReals = (await RealModel.find({
      realId: { $in: reals.map((r) => r._id) },
    })) as unknown as IRealDoc[]

    const realMap: Record<string, mongoose.Types.ObjectId> = {}
    savedReals.forEach((r) => {
      realMap[r.realId] = r._id
    })

    // 🔹 PROJECT → REALS (BULK, CORRECT IDS ✅)
    const realProjectOps: mongoose.AnyBulkWriteOperation[] = []
    for (const r of reals) {
      const projectLocalId = projectMap[r.project_id]
      const realMongoId = realMap[r._id]

      if (!projectLocalId || !realMongoId) continue

      realProjectOps.push({
        updateOne: {
          filter: { _id: projectLocalId },
          update: { $addToSet: { reals: realMongoId } },
        },
      })
    }

    if (realProjectOps.length) {
      await ProjectModel.bulkWrite(realProjectOps)
    }

    // 🔹 SAVE LOGIN TIME AND USER ID
    const now = new Date()
    await UserLoginTimeModel.findOneAndUpdate(
      { userId: authUser.user._id },
      {
        userId: authUser.user._id,
        lastLoginTime: now,
        lastProjectSyncTime: now,
      },
      { upsert: true, new: true }
    )

    res.clearCookie('token', {
      domain: '.codeandcore.co.il',
      path: '/',
    })
    res.cookie('access_token', authtoken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      ...(process.env.NODE_ENV === 'production' && {
        domain: process.env.COOKIES_DOMAIN,
      }),
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    })
    return res.status(200).json({
      message: 'User, Projects & Reals mapped successfully 🚀',
      name: authUser.user.name,
    })
  } catch (error: unknown) {
    let errorMessage = 'Unknown error'

    if (axios.isAxiosError(error)) {
      errorMessage =
        (error.response?.data as { error?: string })?.error || error.message

      logger.error(errorMessage)
    } else if (error instanceof Error) {
      errorMessage = error.message
      logger.error(errorMessage)
    }

    return res.status(500).json({
      message: 'Server Error',
      error: errorMessage,
    })
  }
}

const ONE_HOUR = 60 * 60 * 1000

export const syncUserAndProjects = async (req: Request, res: Response) => {
  try {
    // 🔹 TOKEN
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ message: 'Authorization header missing' })
    }

    const token = authHeader.split(' ')[1]
    if (!token) {
      return res.status(400).json({ message: 'Token required' })
    }

    // 🔹 LOCAL USER (TOKEN SE)
    const localUser = await UserModel.findOne(
      { authToken: token },
      { userId: 1 }
    ).lean()

    if (!localUser) {
      return res.status(401).json({ message: 'Unauthorized: user not found' })
    }

    const userId = String(localUser.userId)
    const now = new Date()

    // 🔹 LOGIN TIME RECORD
    const loginRecord = await UserLoginTimeModel.findOne({ userId })

    const shouldSync =
      !loginRecord ||
      now.getTime() - loginRecord.lastProjectSyncTime.getTime() >= ONE_HOUR

    // 🔹 ALWAYS UPDATE LOGIN TIME
    await UserLoginTimeModel.findOneAndUpdate(
      { userId },
      { userId, lastLoginTime: now },
      { upsert: true }
    )

    // ❌ 1 HOUR NAHI HUA
    if (!shouldSync) {
      return res.status(200).json({
        message: 'Login updated, project sync not required',
        synced: false,
      })
    }

    const [authUser, projectResponse] = await Promise.all([
      getme(token),
      getProjects(token),
    ])

    if (!authUser?.user?._id) {
      throw new Error('Invalid auth response')
    }

    // 🔹 UPSERT USER
    const user = await UserModel.findOneAndUpdate(
      { userId: authUser.user._id },
      {
        userId: authUser.user._id,
        name: authUser.user.name,
        email: authUser.user.email,
        userType: authUser.user.role,
        client_id: authUser.user.client_id,
        projects_allowed: authUser.user.projects_allowed,
        refreshTokenHash: authUser.user.refreshTokenHash,
        authToken: token,
      },
      { new: true, upsert: true }
    )

    // 🔹 NORMALIZE PROJECTS
    const projects = Array.isArray(projectResponse)
      ? projectResponse
      : projectResponse.projects || []

    // 🔹 UPSERT PROJECTS
    if (projects.length) {
      await ProjectModel.bulkWrite(
        projects.map((p) => ({
          updateOne: {
            filter: { projectId: p._id },
            update: {
              projectId: p._id,
              projectName: p.name,
              client_id: authUser.user.client_id,
            },
            upsert: true,
          },
        }))
      )
    }

    // 🔹 FETCH PROJECTS FROM DB
    const projectsInDb = await ProjectModel.find({
      projectId: { $in: projects.map((p) => p._id) },
    })

    const projectIds = projectsInDb.map((p) => p._id)

    // 🔹 USER → PROJECTS
    if (user && projectIds.length) {
      await UserModel.updateOne(
        { _id: user._id },
        { $addToSet: { projects: { $each: projectIds } } }
      )
    }

    // 🔹 PROJECT → USER
    if (user && projectIds.length) {
      await ProjectModel.bulkWrite(
        projectIds.map((pid) => ({
          updateOne: {
            filter: { _id: pid },
            update: { $addToSet: { users: user._id } },
          },
        }))
      )
    }
    logger.info(
      String(projectIds.length),
      'User & projects synced successfully syncUserAndProjects'
    )
    await UserLoginTimeModel.updateOne({ userId }, { lastProjectSyncTime: now })
    return res.status(200).json({
      message: 'User & projects synced successfully',
      synced: true,
    })
  } catch (error: unknown) {
    let message = 'Server error'

    if (axios.isAxiosError(error)) {
      message =
        (error.response?.data as { error?: string })?.error || error.message
    } else if (error instanceof Error) {
      message = error.message
    }

    logger.error(message)

    return res.status(500).json({
      message: 'Server Error',
      error: message,
    })
  }
}
