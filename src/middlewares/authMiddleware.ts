import { Request, Response, NextFunction } from 'express'
import UserModel from '../models/user.model'

export interface AuthenticatedRequest extends Request {
  user?: { userId: string }
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const getCookieString = (cookie: unknown): string | undefined =>
      typeof cookie === 'string' ? cookie : undefined

    //  token from httpOnly cookie
    const token = getCookieString(req.cookies?.access_token)
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: token missing' })
    }

    const localUser = await UserModel.findOne(
      { authToken: token },
      { userId: 1 }
    ).lean()
    if (!localUser) {
      return res.status(401).json({ message: 'Unauthorized: user not found' })
    }

    req.user = {
      userId: String(localUser.userId),
    }

    return next()
  } catch {
    return res.status(401).json({ message: 'Unauthorized: invalid token' })
  }
}
