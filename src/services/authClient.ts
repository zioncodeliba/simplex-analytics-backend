import axios from 'axios'
import { config } from '../config'

type GetRealsResponse = {
  reals: ExternalReal[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface ExternalUser {
  _id: string
  name: string
  email: string
  role: string
  client_id: string
  projects_allowed: string[]
  refreshTokenHash: string
}

export interface AuthUserResponse {
  user: ExternalUser
}

export interface ExternalProject {
  _id: string
  name: string
}

export interface ExternalReal {
  _id: string
  project_id: string
  intro_screen_text: string
}

export async function getme(accessToken: string): Promise<AuthUserResponse> {
  const res = await axios.get<AuthUserResponse>(
    `${config.clientApi}/api/auth/me`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  return res.data
}

export async function getProjects(
  accessToken: string
): Promise<ExternalProject[] | { projects: ExternalProject[] }> {
  const res = await axios.get<
    ExternalProject[] | { projects: ExternalProject[] }
  >(`${config.clientApi}/api/auth/bff/projects`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return res.data
}

export async function getReals(
  accessToken: string,
  offset = 0,
  limit = 500
): Promise<GetRealsResponse> {
  const res = await axios.get<GetRealsResponse>(
    `${config.clientApi}/api/auth/bff/reals`,
    {
      params: { limit, offset },
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  return res.data
}
