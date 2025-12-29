/* eslint-disable sonarjs/cognitive-complexity */
import axios from 'axios'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { Request, Response } from 'express'
import UserModel from '../models/user.model'
import mongoose from 'mongoose'
import ProjectModel from '../models/project.model'
import RealModel from '../models/reals'
import UnitModel from '../models/unit.model'
interface ExternalUserResponse {
  userId: string
  userType?: string
  projects?: Array<{
    projectId: string
    projectName: string
    reals?: Array<{
      realId: string
      realName: string
      entities?: Array<{
        unitId: string
        unitName: string
        availability?: string
      }>
    }>
  }>
}
export const userData = async (req: Request, res: Response) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { token } = req.body
  if (!token) {
    return res.status(400).json({ message: 'token is required' })
  }

  try {
    const tokenApi = process.env.EXTERNAL_AUTH_URL
    if (!tokenApi) {
      return res.status(500).json({
        message: 'Missing EXTERNAL_AUTH_URL in environment',
      })
    }

    // 🔹 1️⃣ Verify with client API
    const externalResp = await axios.post<ExternalUserResponse>(
      tokenApi,
      req.body
    )
    const { userId, userType = 'User', projects = [] } = externalResp.data || {}

    // 🔹 2️⃣ Hash & sign
    const hashedExternalToken = await bcrypt.hash(String(token), 10)
    const jwtSecret = process.env.JWT_SECRET!
    const jwtToken = jwt.sign({ userId, userType }, jwtSecret, {
      expiresIn: '7d',
    })

    // 🔹 3️⃣ Upsert User
    const user = await UserModel.findOneAndUpdate(
      { userId },
      { userId, userType, authToken: hashedExternalToken },
      { upsert: true, new: true }
    )

    const projectIds: mongoose.Types.ObjectId[] = []

    // 🔹 4️⃣ Sync Projects / Reals / Units
    for (const proj of projects) {
      const projectDoc = await ProjectModel.findOneAndUpdate(
        { projectId: proj.projectId },
        {
          projectId: proj.projectId,
          projectName: proj.projectName,
          $addToSet: { users: user._id },
        },
        { upsert: true, new: true }
      )

      projectIds.push(projectDoc._id)

      const realIds: mongoose.Types.ObjectId[] = []

      if (Array.isArray(proj.reals)) {
        for (const real of proj.reals) {
          const realDoc = await RealModel.findOneAndUpdate(
            { realId: real.realId },
            {
              realId: real.realId,
              realName: real.realName,
              project: projectDoc._id,
            },
            { upsert: true, new: true }
          )

          const unitIds: mongoose.Types.ObjectId[] = []

          if (Array.isArray(real.entities)) {
            for (const entity of real.entities) {
              const unitDoc = await UnitModel.findOneAndUpdate(
                { unitId: entity.unitId },
                {
                  unitId: entity.unitId,
                  unitName: entity.unitName,
                  availability: entity.availability || 'Available',
                  $addToSet: { real: realDoc._id },
                  project: projectDoc._id,
                },
                { upsert: true, new: true }
              )

              unitIds.push(unitDoc._id)
            }
          }

          // link units → real
          realDoc.units = unitIds
          await realDoc.save()

          realIds.push(realDoc._id)
        }
      }

      // link reals → project
      projectDoc.reals = realIds
      await projectDoc.save()
    }

    // 🔹 5️⃣ Link projects → user
    user.projects = projectIds
    await user.save()

    // 🔹 6️⃣ Populate everything
    const userDoc = await UserModel.findById(user._id)
      .populate({
        path: 'projects',
        populate: {
          path: 'reals',
          populate: {
            path: 'units',
          },
        },
      })
      .lean()

    // 🔹 7️⃣ Set cookie & send response
    res.cookie('auth_token', jwtToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    })

    return res.status(200).json({
      message: 'Login success',
      user: userDoc,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Login failed', error })
  }
}
