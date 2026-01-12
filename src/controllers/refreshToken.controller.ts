// import { Request, Response } from 'express'
// import axios from 'axios'
// import { config } from '../config'

// import UserModel from '../models/user.model'

// export const refreshToken = async (req: Request, res: Response) => {
//   try {
//     const { token } = req.body

//     if (!token) {
//       return res.status(400).json({ message: 'token is required' })
//     }
//     const response = await axios.get(`${config.clientApi}/api/auth/${token}`)

//     // response se tokens nikaalo
//     const { authToken, refreshToken } = response.data

//     if (!authToken || !refreshToken) {
//       return res.status(500).json({ message: 'Tokens missing in API response' })
//     }

//     res.cookie('accessToken', authToken, {
//       httpOnly: true,
//       secure: true,
//       sameSite: 'strict',
//     })

//     res.cookie('rt', refreshToken, {
//       httpOnly: true,
//       secure: true,
//       sameSite: 'strict',
//     })

//     // Return success
//     return res.json({
//       message: 'Tokens stored in cookies',
//       authToken,
//       refreshToken,
//     })
//   } catch (err) {
//     console.error('Refresh Error:', err)
//     return res.status(500).json({ message: 'Server Error' })
//   }
// }

// export const tokenexprire = async (req, res) => {
//   const { authToken, rtToken } = req.body
//   if (!authToken || !rtToken) {
//     return res
//       .status(400)
//       .json({ message: 'AuthToken and RefreshToken is required' })
//   }
//   try {
//     const isExist=await UserModel.findOne({})

//   } catch {
//     return res.status(500).json({ message: 'Server Error' })
//   }
// }
