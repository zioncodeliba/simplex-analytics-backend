// import { Request, Response, NextFunction } from 'express'
// import jwt from 'jsonwebtoken'

// export interface AuthenticatedRequest extends Request {
//   user?: any
// }

// export const authMiddleware = (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const authHeader = req.headers['authorization'] // e.g. "Bearer <token>"
//     const bearerToken =
//       typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
//         ? authHeader.substring(7)
//         : undefined

//     const cookieToken = (req as any).cookies?.['auth_token'] // cookie-parser added in server
//     const token = bearerToken || cookieToken
//     if (!token) {
//       return res.status(401).json({ message: 'Unauthorized: token missing' })
//     }

//     const secret = process.env.JWT_SECRET
//     if (!secret) {
//       return res.status(500).json({ message: 'JWT secret not configured' })
//     }

//     const payload = jwt.verify(token, secret)
//     req.user = payload
//     return next()
//   } catch {
//     return res.status(401).json({ message: 'Unauthorized: invalid token' })
//   }
// }
