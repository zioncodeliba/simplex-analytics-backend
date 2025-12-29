/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable sonarjs/no-duplicate-string */

import { Request, Response } from 'express'
import UserModel from '../models/user.model'
import { UserWithProjects } from '../lib/type'
import PageViewModel from '../models/posthog/pageview.model'
import PageLeaveModel from '../models/posthog/pageLeave.model'
import ProjectModel from '../models/project.model'

interface CustomRequest extends Request {
  user?: { userId: string | undefined; userType: string | undefined }
  query: { metrics?: string; limit: number; search?: string } & Request['query']
}
interface DurationAggResult {
  avgTime: number
}
interface PerProjAggRow {
  _id: string
  uniqueReals: string[]
}
export const project_dashboard = async (req: CustomRequest, res: Response) => {
  const { userId = 'user_004' } = req.user ?? { userId: undefined }
  const { startDate, endDate } = req.query
  if (!userId) {
    return res.status(400).json({ message: 'Invalid or missing user' })
  }
  const dateFilter: Record<string, Date> = {}
  if (startDate) {
    dateFilter.$gte = new Date(startDate as string)
  }
  if (endDate) {
    dateFilter.$lte = new Date(endDate as string)
  }
  try {
    // 1️⃣ Fetch user with projects and reals
    const userDoc = await UserModel.findOne({ userId })
      .select('projects')
      .populate({
        path: 'projects',
        select: 'projectId reals createdAt',
        populate: {
          path: 'reals',
          select: 'realId createdAt',
        },
      })
      .lean<UserWithProjects>()

    if (!userDoc) {
      return res.status(404).json({ message: 'User not found' })
    }

    const projects = userDoc.projects || []

    const totalProjects = projects.length

    // 3️⃣ Count all filtered reals
    const allRealIds = projects
      .flatMap((proj) => proj.reals?.map((r) => r.realId) ?? [])
      .filter((id): id is string => !!id)

    const totalReals = allRealIds.length

    let avgOpenRate = 0
    let avgSessionDuration = 0

    if (totalReals > 0) {
      // 🟩 Avg Open Rate (PageView)
      const dateQuery = startDate || endDate ? { time: dateFilter } : {}

      const distinctOpenReals = await PageViewModel.distinct('realId', {
        realId: { $in: allRealIds },
        ...dateQuery,
      })

      avgOpenRate = Number(
        ((distinctOpenReals.length / totalReals) * 100).toFixed(2)
      )

      // 🟩 Avg Session Duration (PageLeave)
      const sessions = await PageLeaveModel.find(
        {
          real_id: { $in: allRealIds },
          session_duration_seconds: { $exists: true },
          ...dateQuery,
        },
        { session_duration_seconds: 1, _id: 0 }
      ).lean()

      const validDurations = sessions
        .map((s) => Number(s.session_duration_seconds || 0))
        .filter((v) => v > 0)

      if (validDurations.length > 0) {
        const totalDuration = validDurations.reduce((sum, v) => sum + v, 0)
        avgSessionDuration = totalDuration / validDurations.length
      }
    }

    // 4️⃣ Convert seconds → minutes
    const avgSessionDurationMinutes = Number(
      (avgSessionDuration / 60).toFixed(2)
    )

    const data = {
      totalProjects,
      totalReals,
      avgOpenRate,
      avgSessionDuration: avgSessionDurationMinutes,
    }

    return res.status(200).json({
      message: 'Project Dashboard Data',
      data,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Internal Server Error', error })
  }
}
export const project_data = async (req: CustomRequest, res: Response) => {
  const { userId = 'user_004' } = req.user ?? { userId: undefined }
  const { startDate, endDate } = req.query
  const limit = Number(req.query.limit) || 10
  const page = Number(req.query.page) || 1
  const search = req.query.search?.toString().trim() || ''
  if (!userId) {
    return res.status(400).json({ message: 'Invalid User' })
  }
  const dateFilter: Record<string, Date> = {}
  if (startDate) {
    dateFilter.$gte = new Date(startDate as string)
  }
  if (endDate) {
    dateFilter.$lte = new Date(endDate as string)
  }
  try {
    const skip = (page - 1) * limit

    const dateMatch = startDate || endDate ? { time: dateFilter } : {}
    // 🟦 Step 1: Find user and populate nested project → real
    const userDoc = await UserModel.findOne({ userId })
      .select('projects')
      .populate({
        path: 'projects',
        match: search
          ? { projectName: { $regex: search, $options: 'i' } } // 🔍 search filter
          : {},
        options: { skip, limit },
        populate: {
          path: 'reals',
          select: 'realId realName createdAt',
        },
      })
      .lean<UserWithProjects>()

    if (!userDoc) {
      return res.status(404).json({ message: 'User not found' })
    }
    const userForCount = await UserModel.findOne({ userId })
      .select('projects')
      .populate({
        path: 'projects',
        match: search ? { projectName: { $regex: search, $options: 'i' } } : {},
      })
      .lean()

    const totalProjects = userForCount?.projects?.length || 0
    const projects = userDoc.projects || []
    if (projects.length === 0) {
      return res.status(200).json({ message: 'No projects found', data: [] })
    }

    // 🟪 Step 2: Build project-level stats
    const projectData = await Promise.all(
      projects.map(async (proj) => {
        const reals = Array.isArray(proj.reals) ? proj.reals : []
        const totalReals = reals.length
        let openRate = 0
        let totalVisits = 0
        let uniqueUsers = 0
        let avgTimeSpent = 0
        if (totalReals > 0) {
          const realIds = reals
            .map((r) => r?.realId)
            .filter(
              (id: string | undefined): id is string =>
                typeof id === 'string' && id.length > 0
            )
          // 🟨 Reals opened at least once
          const openedReals = await PageViewModel.distinct('realId', {
            realId: { $in: realIds },
            ...dateMatch,
          })

          const openedCount = openedReals?.length || 0

          openRate = Number(((openedCount / totalReals) * 100).toFixed(2))

          // 🟨 Total visits
          totalVisits = await PageViewModel.countDocuments({
            realId: { $in: realIds },
            ...dateMatch,
          })

          // 🟨 Unique visitors
          const distinctUsers = await PageViewModel.distinct('distinct_id', {
            realId: { $in: realIds },
            ...dateMatch,
          })
          uniqueUsers = distinctUsers?.length || 0
          const durationAgg: DurationAggResult[] =
            await PageLeaveModel.aggregate([
              {
                $match: {
                  real_id: { $in: realIds },
                  session_duration_seconds: { $exists: true, $ne: null },
                  ...(startDate || endDate ? { time: dateFilter } : {}),
                },
              },
              {
                $group: {
                  _id: null,
                  totalTime: {
                    $sum: { $toDouble: '$session_duration_seconds' },
                  },
                  totalSessions: { $sum: 1 }, // COUNT sessions
                },
              },
              {
                $project: {
                  _id: 0,
                  avgTime: {
                    $cond: [
                      { $gt: ['$totalSessions', 0] },
                      { $divide: ['$totalTime', '$totalSessions'] },
                      0,
                    ],
                  },
                },
              },
            ])

          avgTimeSpent = Number(durationAgg[0]?.avgTime ?? 0)
        }

        const projectRow: {
          id: string
          name: string | undefined
          status: string
          realsCount: number
          openRate: number
          totalVisits: number
          uniqueUsers: number
          avgTimeSpent: number
          createdAt: string
          lastUpdated: string
        } = {
          id: proj._id,
          name: proj.projectName ?? '',
          status: proj.status ?? 'Active',
          realsCount: totalReals,
          openRate,
          totalVisits,
          uniqueUsers,
          avgTimeSpent,
          createdAt: proj.createdAt ?? 'N/A',
          lastUpdated: proj.updatedAt ?? 'N/A',
        }

        return projectRow
      })
    )

    // 🟩 Step 3: Return final data
    return res.status(200).json({
      message: 'User Project Data',
      data: projectData,
      totalProjects,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error })
  }
}
export const PerformanceChart = async (req: CustomRequest, res: Response) => {
  const { userId = 'user_004' } = req.user ?? { userId: undefined }
  const { metrics, startDate, endDate } = req.query

  if (!userId) {
    return res.status(400).json({ message: 'Invalid User' })
  }
  const dateFilter: Record<string, Date> = {}
  if (startDate) {
    dateFilter.$gte = new Date(startDate as string)
  }
  if (endDate) {
    dateFilter.$lte = new Date(endDate as string)
  }
  try {
    // ✅ Step 1: Find user's project IDs
    const user = await UserModel.findOne({ userId }, { projects: 1 }).lean()

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const projectIds = user.projects || []
    if (!projectIds.length) {
      return res.status(200).json({
        message: 'No projects assigned',
        data: [],
      })
    }

    // ✅ Step 2: Get all projects with their reals
    const projects = await ProjectModel.find(
      { _id: { $in: projectIds } },
      { projectName: 1, reals: 1 }
    ).populate({
      path: 'reals',
      select: 'realId realName',
    })

    let metricsValues: Array<{ projectName?: string; value: number }> = []

    // ✅ Step 3: Calculate metric based on query
    if (metrics === 'reals_count') {
      metricsValues = projects.map((proj) => ({
        projectName: proj.projectName,
        value: proj.reals.length,
      }))
    }

    // ✅ OPEN RATE
    else if (metrics === 'open_rate') {
      metricsValues = await Promise.all(
        projects.map(async (proj) => {
          const realIds = Array.isArray(proj.reals)
            ? proj.reals
                .map((r) => {
                  if (
                    typeof r === 'object' &&
                    'realId' in r &&
                    typeof r.realId === 'string'
                  ) {
                    return r.realId
                  }
                  return undefined
                })
                .filter((id): id is string => Boolean(id))
            : []

          const totalReals = realIds.length
          let openRate = 0

          if (totalReals > 0) {
            const matchQuery: {
              realId: { $in: string[] }
              time?: Record<string, Date>
            } = { realId: { $in: realIds } }
            if (startDate || endDate) matchQuery.time = dateFilter
            const result = await PageViewModel.aggregate<{
              uniqueReals: number
            }>([
              { $match: matchQuery },
              { $group: { _id: '$realId' } },
              { $count: 'uniqueReals' },
            ])
            const openedCount = result[0]?.uniqueReals || 0
            openRate = Number(((openedCount / totalReals) * 100).toFixed(2))
          }

          return { projectName: proj.projectName, value: openRate }
        })
      )
    }

    // ✅ VISITS
    else if (metrics === 'visits') {
      metricsValues = await Promise.all(
        projects.map(async (proj) => {
          const realIds = Array.isArray(proj.reals)
            ? proj.reals
                .map((r) => {
                  if (
                    typeof r === 'object' &&
                    'realId' in r &&
                    typeof r.realId === 'string'
                  ) {
                    return r.realId
                  }
                  return undefined
                })
                .filter((id): id is string => Boolean(id))
            : []

          let totalVisits = 0

          if (realIds.length > 0) {
            const matchQuery: {
              realId: { $in: string[] }
              time?: Record<string, Date>
            } = { realId: { $in: realIds } }
            if (startDate || endDate) matchQuery.time = dateFilter
            const result = await PageViewModel.aggregate<{
              _id: null
              total: number
            }>([
              { $match: matchQuery },
              { $group: { _id: null, total: { $sum: 1 } } },
            ])
            totalVisits = result[0]?.total || 0
          }

          return { projectName: proj.projectName, value: totalVisits }
        })
      )
    } else if (metrics === 'avg_time') {
      metricsValues = await Promise.all(
        projects.map(async (proj) => {
          const realIds = Array.isArray(proj.reals)
            ? proj.reals
                .map((r) =>
                  typeof r === 'object' &&
                  'realId' in r &&
                  typeof r.realId === 'string'
                    ? r.realId
                    : undefined
                )
                .filter((id): id is string => Boolean(id))
            : []

          let avgTime = 0

          if (realIds.length > 0) {
            const matchQuery: {
              real_id: { $in: string[] }
              session_duration_seconds?: { $exists: boolean; $ne: null }
              time?: Record<string, Date>
            } = {
              real_id: { $in: realIds },
              session_duration_seconds: { $exists: true, $ne: null },
            }

            if (startDate || endDate) matchQuery.time = dateFilter
            const result: DurationAggResult[] = await PageLeaveModel.aggregate([
              { $match: matchQuery },
              {
                $group: {
                  _id: null,
                  totalTime: {
                    $sum: { $toDouble: '$session_duration_seconds' },
                  },
                  uniqueUsers: { $addToSet: '$event_id' },
                },
              },

              {
                $project: {
                  _id: 0,
                  avgTime: {
                    $cond: [
                      { $gt: [{ $size: '$uniqueUsers' }, 0] },
                      { $divide: ['$totalTime', { $size: '$uniqueUsers' }] },
                      0,
                    ],
                  },
                },
              },
            ])

            avgTime = Number(result[0]?.avgTime || 0)
          }

          return { projectName: proj.projectName, value: avgTime }
        })
      )
    }

    // ✅ Step 4: Top 5 projects by metric
    const topProjects = metricsValues
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    return res.status(200).json({
      message: `Performance Chart Data (Top 5 by ${metrics})`,
      data: topProjects,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error })
  }
}
export const engagement_Trends = async (req: CustomRequest, res: Response) => {
  const { userId = 'user_004' } = req.user ?? { userId: undefined }
  const { metrics = 'visits', breakdown, startDate, endDate } = req.query

  if (!userId) {
    return res.status(400).json({ message: 'Invalid User' })
  }

  try {
    // 1️⃣  MOVE THIS FUNCTION TO THE TOP (HOISTED FUNCTION)

    const generateTimeBuckets = (start: Date, end: Date, grouping: string) => {
      const buckets: string[] = []

      if (grouping === 'year') {
        let year = start.getFullYear()
        const endYear = end.getFullYear()
        while (year <= endYear) {
          buckets.push(String(year))
          year++
        }
        return buckets
      }

      const cursor = new Date(start)
      while (cursor <= end) {
        if (grouping === 'day') {
          buckets.push(cursor.toISOString().slice(0, 10))
          cursor.setDate(cursor.getDate() + 1)
        } else if (grouping === 'week') {
          const weekStart = new Date(cursor)

          // 0 = Sunday, 1 = Monday …
          const day = weekStart.getDay()
          const diff = day === 0 ? -6 : 1 - day // convert to Monday

          weekStart.setDate(weekStart.getDate() + diff)

          // convert to YYYY-MM-DD
          const formatted = weekStart.toISOString().slice(0, 10)
          buckets.push(formatted)
          // move cursor by 7 days
          cursor.setDate(cursor.getDate() + 7)
        } else if (grouping === 'month') {
          buckets.push(
            `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(
              2,
              '0'
            )}`
          )
          cursor.setMonth(cursor.getMonth() + 1)
        }
      }

      return buckets
    }

    // 2️⃣  FETCH USER + PROJECTS + REALS

    const userData = await UserModel.findOne({ userId })
      .select('projects')
      .populate({
        path: 'projects',
        select: 'projectId projectName reals',
        populate: {
          path: 'reals',
          select: 'realId realName',
        },
      })
      .lean<UserWithProjects>()

    if (!userData) {
      return res.status(404).json({ message: 'User not Found' })
    }

    // 3️⃣  Collect all Real IDs

    const allRealIds: string[] = (userData.projects || [])
      .flatMap((proj) => (proj.reals || []).map((r) => r.realId))
      .filter((id): id is string => typeof id === 'string')

    if (!allRealIds.length) {
      return res.status(200).json({ message: 'No Reals Found', data: [] })
    }

    // 4️⃣  Date Range

    const now = new Date()
    const start = startDate
      ? new Date(startDate as string)
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate as string) : now

    const diffDays = Math.floor(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    )

    // 5️⃣ Grouping type

    let groupingType: 'day' | 'week' | 'month' | 'year' = 'day'
    if (diffDays <= 7) groupingType = 'day'
    else if (diffDays <= 45) groupingType = 'week'
    else if (diffDays <= 365) groupingType = 'month'
    else groupingType = 'year'

    const startSec = start.getTime()
    const endSec = end.getTime()

    const baseMatch = {
      realId: { $in: allRealIds },
      $expr: {
        $and: [
          { $gte: [{ $toDouble: '$time' }, startSec] },
          { $lte: [{ $toDouble: '$time' }, endSec] },
        ],
      },
    }

    // 6️⃣  Date Format

    const dateFormat =
      groupingType === 'day'
        ? '%Y-%m-%d'
        : groupingType === 'week'
          ? '%Y-%m-%d'
          : groupingType === 'month'
            ? '%Y-%m'
            : '%Y'

    let trendData: Array<{ _id: string; value: number }> = []

    // 7️⃣  METRIC: VISITS

    if (metrics === 'visits') {
      const isBreakdown = breakdown === 'true'
      // CASE 1: SIMPLE (NO BREAKDOWN)

      if (!isBreakdown) {
        trendData = await PageViewModel.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: dateFormat,
                  date: { $toDate: { $toDouble: '$time' } },
                },
              },
              value: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
      }

      // CASE 2: BREAKDOWN MODE PER PROJECT
      else {
        // SHOW ONLY TOP 5 PROJECTS IN BREAKDOWN (NO "All Projects")

        const projectRealMap: Record<string, string[]> = {}
        ;(userData.projects ?? []).forEach((proj) => {
          projectRealMap[proj._id.toString()] = (proj.reals ?? []).map(
            (r) => r.realId
          )
        })

        // ---- 1. Get total visits per project ----
        const projectTotals = await Promise.all(
          Object.entries(projectRealMap).map(async ([pid, realIds]) => {
            const total = await PageViewModel.countDocuments({
              realId: { $in: realIds },
              $expr: {
                $and: [
                  { $gte: [{ $toDouble: '$time' }, startSec] },
                  { $lte: [{ $toDouble: '$time' }, endSec] },
                ],
              },
            })

            const projInfo = userData?.projects?.find(
              (p) => p._id.toString() === pid
            )
            return {
              projectId: pid,
              projectName: projInfo?.projectName || 'Unknown Project',
              total,
            }
          })
        )

        // ---- 2. Sort and keep only TOP 5 ----
        const top5Projects = projectTotals
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
          .map((p) => p.projectId)

        // ---- 3. Prepare timeline buckets ----
        const buckets = generateTimeBuckets(start, end, groupingType)

        // ---- 4. Breakdown only for TOP 5 projects ----
        const breakdownData = await Promise.all(
          top5Projects.map(async (projectId) => {
            const realIds = projectRealMap[projectId]

            const projInfo = userData?.projects?.find(
              (p) => p._id.toString() === projectId
            )
            const projectName = projInfo?.projectName || 'Unknown Project'

            if (!realIds?.length) {
              return {
                projectId,
                projectName,
                data: buckets.map((b) => ({ _id: b, value: 0 })),
              }
            }

            const perProjAgg = await PageViewModel.aggregate([
              {
                $match: {
                  realId: { $in: realIds },
                  $expr: {
                    $and: [
                      { $gte: [{ $toDouble: '$time' }, startSec] },
                      { $lte: [{ $toDouble: '$time' }, endSec] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: dateFormat,
                      date: { $toDate: { $toDouble: '$time' } },
                    },
                  },
                  value: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ])
            const map: Record<string, number> = {}
            perProjAgg.forEach(
              (row: { _id: string; value: number }) =>
                (map[row._id] = row.value)
            )

            const filled = buckets.map((b) => ({ _id: b, value: map[b] ?? 0 }))

            return { projectId, projectName, data: filled }
          })
        )

        // ---- 5. Build Final Table WITHOUT "All Projects" ----

        const finalTable = buckets.map((bucket) => {
          const row: Record<string, number | string> = { date: bucket }
          breakdownData.forEach((proj) => {
            row[proj.projectName] =
              proj.data.find((d) => d._id === bucket)?.value ?? 0
          })
          return row
        })

        return res.status(200).json({
          message: 'Engagement Trend (Visits Breakdown – Top 5 Only)',
          data: finalTable,
        })
      }
    }
    // 8️⃣   OPEN RATE
    else if (metrics === 'open_rate') {
      const isBreakdown = breakdown === 'true'

      const buckets = generateTimeBuckets(start, end, groupingType)

      // CASE 1: NO BREAKDOWN (OLD LOGIC)
      if (!isBreakdown) {
        trendData = await PageViewModel.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: dateFormat,
                  date: { $toDate: { $toDouble: '$time' } },
                },
              },
              uniqueReals: { $addToSet: '$realId' },
            },
          },
          {
            $project: {
              _id: 1,
              value: {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [{ $size: '$uniqueReals' }, allRealIds.length],
                      },
                      100,
                    ],
                  },
                  2,
                ],
              },
            },
          },
          { $sort: { _id: 1 } },
        ])

        // fill missing buckets
        const map = trendData.reduce<Record<string, number>>((acc, row) => {
          acc[row._id] = row.value
          return acc
        }, {})

        trendData = buckets.map((b) => ({ _id: b, value: map[b] ?? 0 }))
      }
      // CASE 2: BREAKDOWN MODE (NEW FEATURE)
      else {
        // build project → reals map
        const projectRealMap: Record<string, string[]> = {}
        ;(userData.projects ?? []).forEach((proj) => {
          projectRealMap[proj._id.toString()] = (proj.reals ?? []).map(
            (r) => r.realId
          )
        })

        // Prepare timeline buckets
        const buckets = generateTimeBuckets(start, end, groupingType)

        // ---------- Project breakdown ----------
        const breakdownDataAll = await Promise.all(
          Object.entries(projectRealMap).map(
            async ([projectMongoId, realIds]) => {
              const projectInfo = userData?.projects?.find(
                (p) => p._id.toString() === projectMongoId
              )

              const projectName = projectInfo?.projectName || 'Unknown Project'
              const totalRealsInProject = realIds.length

              if (totalRealsInProject === 0) {
                return {
                  projectId: projectMongoId,
                  projectName,
                  totalValue: 0,
                  data: buckets.map((b) => ({ _id: b, value: 0 })),
                }
              }

              const perProjAgg = await PageViewModel.aggregate([
                {
                  $match: {
                    realId: { $in: realIds },
                    $expr: {
                      $and: [
                        { $gte: [{ $toDouble: '$time' }, startSec] },
                        { $lte: [{ $toDouble: '$time' }, endSec] },
                      ],
                    },
                  },
                },
                {
                  $group: {
                    _id: {
                      $dateToString: {
                        format: dateFormat,
                        date: { $toDate: { $toDouble: '$time' } },
                      },
                    },
                    uniqueReals: { $addToSet: '$realId' },
                  },
                },
              ])

              const map = perProjAgg.reduce<Record<string, number>>(
                (acc, row: PerProjAggRow) => {
                  const openRate =
                    (row.uniqueReals.length / totalRealsInProject) * 100

                  acc[row._id] = Math.round(openRate * 100) / 100
                  return acc
                },
                {}
              )

              const filled = buckets.map((b) => ({
                _id: b,
                value: map[b] ?? 0,
              }))
              const totalValue = filled.reduce((sum, d) => sum + d.value, 0)

              return {
                projectId: projectMongoId,
                projectName,
                totalValue,
                data: filled,
              }
            }
          )
        )

        // Sort by totalValue descending and take top 5
        const breakdownData = breakdownDataAll
          .sort((a, b) => b.totalValue - a.totalValue)
          .slice(0, 5)

        // ---------- build final table WITHOUT "All Projects" ----------
        const finalTable = buckets.map((bucket) => {
          const row: Record<string, number | string> = { date: bucket }

          breakdownData.forEach((proj) => {
            row[proj?.projectName] =
              proj.data.find((d) => d._id === bucket)?.value || 0
          })

          return row
        })

        return res.status(200).json({
          message: 'Engagement Trend (Open Rate Breakdown – Top 5 Only)',
          data: finalTable,
        })
      }
    }

    // 9️⃣ FILL MISSING BUCKETS
    const buckets = generateTimeBuckets(start, end, groupingType)
    const mapped = trendData.reduce<Record<string, number>>((acc, row) => {
      acc[row._id] = row.value
      return acc
    }, {})
    const filledData = buckets.map((b) => ({ _id: b, value: mapped[b] ?? 0 }))

    // 🔟 Format week label
    const formattedData = filledData

    return res.status(200).json({
      message: `Engagement Trends Data (${metrics})`,
      range: { start, end, diffDays },
      data: formattedData,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error })
  }
}
