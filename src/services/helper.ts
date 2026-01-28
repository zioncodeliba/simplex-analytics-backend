import { ExternalReal, getReals } from './authClient'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function getAllReals(
  accessToken: string
): Promise<ExternalReal[]> {
  const limit = 500
  let offset = 0
  let hasMore = true

  const allReals: ExternalReal[] = []

  while (hasMore) {
    const { reals, pagination } = await getReals(accessToken, offset, limit)

    allReals.push(...reals)

    hasMore = pagination.hasMore
    offset += limit

    if (hasMore) {
      await sleep(400)
    }
  }

  return allReals
}
