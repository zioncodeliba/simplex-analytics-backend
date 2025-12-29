import { Request, Response } from 'express'

export const externalAuthController = (req: Request, res: Response) => {
  try {
    return res.status(200).json(req.body)
  } catch (err) {
    return res.status(500).json({ message: 'External API failed', error: err })
  }
}
