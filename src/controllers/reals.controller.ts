/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable sonarjs/no-duplicate-string */
import { Request, Response } from 'express'
import mongoose, { FilterQuery, Types } from 'mongoose'
import UserModel from '../models/user.model'
import PageViewModel from '../models/posthog/pageview.model'
// import PageLeaveModel from '../models/posthog/pageLeave.model'
import sliderViewdModel from '../models/posthog/slide_viewed.model'
import { Drawer, Pause, Real, UserWithProjects, Zoom } from '../lib/type'
import ProjectModel from '../models/project.model'
import PageLeaveModel from '../models/posthog/pageLeave.model'
import UnitModel from '../models/unit.model'
import RealModel from '../models/reals'
import SlidePausedModel from '../models/posthog/slide_paused.model'
import drawerModel from '../models/posthog/drawer_interaction.model'
import zoomModel from '../models/posthog/zoom_interaction.model'
type PageviewAggregateStats = {
  realId: string
  totalVisits?: number
  uniqueUserCount?: number
  firstSeen?: number | string | Date | null
  lastSeen?: number | string | Date | null
  current_url: string | null
}
type UnitsAggregate = { _id: Types.ObjectId; count: number }
type TrendDataItem = { _id: string; value: number }
type RealTotalAggregate = { _id: string; total: number }
type UserTotalAggregate = { _id: string; total: number }
type PerRealAggregate = { _id: string; value: number }
type PerUserAggregate = { _id: string; value: number }
type BreakdownDataItem = { _id: string; value: number }
type SlideSessionAggregate = { percentage: number }
type PerUserRetentionRow = { realId: string; user: string; retention: number }
type SlideDurationAggregate = { _id: string; totalDuration: number }
type TimeRetentionRow = {
  _id: {
    real_id: string
    session_id: string
  }
  time_spent_ms: number
}

interface CustomRequest extends Request {
  user?: { userId: string | undefined; userType: string | undefined }
  query: { metrics?: string; limit: number; search?: string } & Request['query']
}

const real_Dashboard = async (req: CustomRequest, res: Response) => {
  const { userId } = req.user ?? {
    userId: undefined,
  }
  const { startDate, endDate } = req.query

  if (!userId) {
    return res.status(400).json({ message: 'Invalid User' })
  }

  try {
    const userData = await UserModel.findOne({ userId })
      .select('projects')
      .populate({
        path: 'projects',
        select: 'projectId projectName reals',
        populate: {
          path: 'reals',
          select: 'realId realName units',
          populate: {
            path: 'units',
            select: 'unitId unitName availability',
          },
        },
      })
      .lean<UserWithProjects>()

    if (!userData) {
      return res.status(404).json({ message: 'User not found' })
    }

    const allReals = (userData.projects || []).flatMap((p) => p.reals || [])
    const realsCount = allReals.length
    let avgOpenRate = 0,
      totalVisits = 0,
      distinctVisitors = 0,
      avgTimePerUser = 0,
      slidesRetention = 0,
      avgTimeRetention = 0,
      totalRealsOpened = 0
    if (realsCount > 0) {
      const allRealIds = allReals.map((r) => r.realId).filter(Boolean)
      const dateFilter: Record<string, Date> = {}
      if (startDate) dateFilter.$gte = new Date(startDate as string)
      if (endDate) dateFilter.$lte = new Date(endDate as string)

      const timeCondition = Object.keys(dateFilter).length
        ? { time: dateFilter }
        : {}

      const distinctOpenReals = await PageViewModel.distinct('realId', {
        realId: { $in: allRealIds },
        ...timeCondition,
      })
      totalRealsOpened = distinctOpenReals.length
      avgOpenRate = Number(((totalRealsOpened / realsCount) * 100).toFixed(2))

      totalVisits = await PageViewModel.countDocuments({
        realId: { $in: allRealIds },
        ...timeCondition,
      })

      const distinctUsers = await PageViewModel.distinct('distinct_id', {
        realId: { $in: allRealIds },
        ...timeCondition,
      })
      distinctVisitors = distinctUsers.length

      const sessions = await PageLeaveModel.find(
        {
          real_id: { $in: allRealIds },
          session_duration_seconds: { $gt: 0 },
          ...(Object.keys(dateFilter).length ? { time: dateFilter } : {}),
        },
        { session_duration_seconds: 1, _id: 0 }
      ).lean()
      const totalDuration = sessions.reduce(
        (sum, s) => sum + Number(s.session_duration_seconds || 0),
        0
      )

      const totalSessions = sessions.length

      avgTimePerUser = totalSessions > 0 ? totalDuration / totalSessions : 0

      const slideSessions =
        await sliderViewdModel.aggregate<SlideSessionAggregate>([
          {
            $match: {
              real_id: { $in: allRealIds },
              ...timeCondition,
            },
          },
          {
            $group: {
              _id: '$real_id',
              uniqueSlidesViewed: { $addToSet: '$slide_id' },
              totalSlidesStr: { $first: '$total_slides' },
            },
          },
          {
            $project: {
              totalSlides: { $toInt: '$totalSlidesStr' },
              viewedCount: { $size: '$uniqueSlidesViewed' },
            },
          },
          {
            $project: {
              percentage: {
                $multiply: [
                  {
                    $cond: [
                      { $eq: ['$totalSlides', 0] },
                      0,
                      { $divide: ['$viewedCount', '$totalSlides'] },
                    ],
                  },
                  100,
                ],
              },
            },
          },
        ])

      if (slideSessions.length > 0) {
        const sum = slideSessions.reduce((acc, s) => acc + s.percentage, 0)
        slidesRetention = Number((sum / slideSessions.length).toFixed(2))
      }
      const realsDurationMap = new Map<string, number>()

      const realsWithDuration = await RealModel.find(
        { realId: { $in: allRealIds } },
        { realId: 1, total_duration: 1, _id: 0 }
      ).lean()

      realsWithDuration.forEach((r) => {
        realsDurationMap.set(r.realId, Number(r.total_duration || 0))
      })
      const timeRetentionRows =
        await PageLeaveModel.aggregate<TimeRetentionRow>([
          {
            $match: {
              real_id: { $in: allRealIds },
              prev_pageview_duration: { $gt: 0 },
              ...(Object.keys(dateFilter).length ? { time: dateFilter } : {}),
            },
          },
          {
            $group: {
              _id: {
                real_id: '$real_id',
                session_id: '$session.id',
              },
              time_spent_ms: { $sum: '$prev_pageview_duration' },
            },
          },
        ])
      let retentionSum = 0
      let retentionCount = 0

      for (const row of timeRetentionRows) {
        const realId = row._id.real_id
        const timeSpentSec = row.time_spent_ms / 1000
        const totalDuration = realsDurationMap.get(realId) || 0

        if (totalDuration > 0) {
          const cappedTime = Math.min(timeSpentSec, totalDuration)

          retentionSum += cappedTime / totalDuration
          retentionCount++
        }
      }

      avgTimeRetention =
        retentionCount > 0
          ? Number(((retentionSum / retentionCount) * 100).toFixed(2))
          : 0
    }

    const data = {
      realsCount,
      avgOpenRate,
      totalRealsOpened,
      totalVisits,
      distinctVisitors,
      avgTimePerUser,
      slidesRetention,
      avgTimeRetention,
    }

    return res.status(200).json({
      message: 'REAL Dashboard Data',
      data,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error })
  }
}
const Reals_Data = async (req: CustomRequest, res: Response) => {
  const { userId } = req.user ?? {
    userId: undefined,
  }
  const { startDate, endDate } = req.query
  if (!userId) {
    return res.status(400).json({ message: 'Invalid User' })
  }
  const limit = Number(req.query.limit) || 10
  const page = Number(req.query.page) || 1
  const search = req.query.search?.toString().trim() || ''
  const skip = (page - 1) * limit

  let dateFilter: Record<string, Date> = {}
  if (startDate && endDate) {
    dateFilter = {
      $gte: new Date(startDate as string),
      $lte: new Date(endDate as string),
    }
  }

  try {
    const user = await UserModel.findOne({ userId }).select('_id').lean()
    if (!user) return res.status(404).json({ message: 'User not found' })

    const projectDocs = await ProjectModel.find({
      users: user._id,
    })
      .select('_id projectName')
      .lean()
    if (!projectDocs.length) {
      return res.status(200).json({
        message: 'No projects found',
        total: 0,
        realsData: [],
      })
    }

    const projectIdMap = Object.fromEntries(
      projectDocs.map((p) => [p._id.toString(), p.projectName])
    )

    const realMatch: FilterQuery<Real> = {
      project: { $in: projectDocs.map((p) => p._id) },
    }
    if (search) realMatch.realName = { $regex: search, $options: 'i' }

    const reals = await RealModel.find(realMatch)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    if (!reals.length) {
      return res.status(200).json({
        message: 'No REALs found',
        total: 0,
        realsData: [],
      })
    }

    const realIds = reals.map((r) => r.realId)

    // 3️⃣ Slides Count
    const unitsAgg: UnitsAggregate[] = await UnitModel.aggregate([
      { $match: { real: { $in: reals.map((r) => r._id) } } },
      { $unwind: '$real' },
      { $group: { _id: '$real', count: { $sum: 1 } } },
    ])

    const slidesMap = Object.fromEntries(
      unitsAgg.map((u) => [u._id.toString(), u.count])
    )
    // 4️⃣ PageViews (DATE FILTER APPLIED)
    const pageviewsAgg: PageviewAggregateStats[] =
      await PageViewModel.aggregate([
        {
          $match: {
            realId: { $in: realIds },
            ...(startDate && endDate ? { time: dateFilter } : {}),
          },
        },
        {
          $group: {
            _id: '$realId',
            totalVisits: { $sum: 1 },
            uniqueUsers: { $addToSet: '$distinct_id' },
            firstSeen: { $min: '$time' },
            lastSeen: { $max: '$time' },
            current_url: { $first: '$current_url' },
          },
        },
        {
          $project: {
            _id: 0,
            realId: '$_id',
            totalVisits: 1,
            uniqueUserCount: { $size: '$uniqueUsers' },
            firstSeen: 1,
            lastSeen: 1,
            current_url: 1,
          },
        },
      ])

    const statsMap = Object.fromEntries(pageviewsAgg.map((s) => [s.realId, s]))

    // 5️⃣ PageLeave (Avg Time On Real)
    const sessions = await PageLeaveModel.find({
      real_id: { $in: realIds },
      session_duration_seconds: { $gt: 0 },
      ...(startDate && endDate ? { time: dateFilter } : {}),
    }).lean()

    const avgTimeMap: Record<string, number> = {}
    const countMap: Record<string, number> = {}

    sessions.forEach((s) => {
      const id = s.real_id
      if (!id) return
      const dur = Number(s.session_duration_seconds) || 0

      avgTimeMap[id] = (avgTimeMap[id] ?? 0) + dur
      countMap[id] = (countMap[id] ?? 0) + 1
    })

    Object.keys(avgTimeMap).forEach((id) => {
      avgTimeMap[id] = (avgTimeMap[id] ?? 0) / (countMap[id] ?? 1)
    })

    // 6️⃣ Per User Slide Retention (DATE FILTER APPLIED)
    const perUserRetentionAgg =
      await sliderViewdModel.aggregate<PerUserRetentionRow>([
        {
          $match: {
            real_id: { $in: realIds },
            ...(startDate && endDate ? { createdAt: dateFilter } : {}),
          },
        },

        {
          $group: {
            _id: { real: '$real_id', user: '$distinct_id' },
            viewedSlides: { $addToSet: '$slide_id' },
            totalSlidesStr: { $first: '$total_slides' },
          },
        },

        {
          $project: {
            realId: '$_id.real',
            user: '$_id.user',
            viewedCount: { $size: '$viewedSlides' },
            totalSlides: { $toInt: '$totalSlidesStr' },
          },
        },

        {
          $project: {
            realId: 1,
            user: 1,
            retention: {
              $cond: [
                { $eq: ['$totalSlides', 0] },
                0,
                {
                  $multiply: [
                    {
                      $min: [{ $divide: ['$viewedCount', '$totalSlides'] }, 1],
                    },
                    100,
                  ],
                },
              ],
            },
          },
        },
      ])

    const retentionMap: Record<string, number[]> = {}

    perUserRetentionAgg.forEach((row) => {
      const realId = row.realId
      const retention = row.retention

      if (!retentionMap[realId]) {
        retentionMap[realId] = []
      }

      retentionMap[realId].push(retention)
    })

    const interaction_pause: Pause[] = await SlidePausedModel.aggregate<Pause>([
      {
        $match: {
          real_id: { $in: realIds },
          pause_source: 'hold',
        },
      },
      {
        $group: {
          _id: '$real_id',
          hold_count: { $sum: 1 },
        },
      },
    ])
    const interaction_zoom: Zoom[] = await zoomModel.aggregate<Zoom>([
      {
        $match: {
          real_id: { $in: realIds },
          action: 'pinch_zoom',
        },
      },
      {
        $group: {
          _id: '$real_id',
          pinch_count: { $sum: 1 },
        },
      },
    ])
    const interaction_drawer: Drawer[] = await drawerModel.aggregate<Drawer>([
      {
        $match: {
          real_id: { $in: realIds },
          action: 'expanded',
        },
      },
      {
        $group: {
          _id: '$real_id',
          expanded_count: { $sum: 1 },
        },
      },
    ])
    function toLookupMap<T extends { _id: string }>(
      arr: T[],
      key: keyof T & (string | number | symbol)
    ): Record<string, number> {
      return arr.reduce(
        (acc, e) => {
          acc[e._id] = Number(e[key])
          return acc
        },
        {} as Record<string, number>
      )
    }

    const realsWithDuration = await RealModel.find(
      { realId: { $in: realIds } },
      { realId: 1, total_duration: 1, _id: 0 }
    ).lean()

    const totalDurationMap = new Map<string, number>()
    realsWithDuration.forEach((r) => {
      totalDurationMap.set(r.realId, Number(r.total_duration || 0))
    })

    type ATRRow = {
      realId: string
      sessionId: string
      timeSpentSec: number
    }

    const atrRows: ATRRow[] = []

    sessions.forEach((s) => {
      const realId = s.real_id
      const sessionId = s.session?.id
      if (!realId || !sessionId) return

      const timeSpentSec = (s.prev_pageview_duration ?? 0) / 1000
      if (timeSpentSec <= 0) return

      atrRows.push({ realId, sessionId, timeSpentSec })
    })

    // 5.c️⃣ Compute Avg Time Retention per real
    const atrMap: Record<string, number> = {}

    const groupedByReal = atrRows.reduce(
      (acc, row) => {
        if (!acc[row.realId]) acc[row.realId] = []
        acc[row?.realId]?.push(row.timeSpentSec)
        return acc
      },
      {} as Record<string, number[]>
    )

    Object.entries(groupedByReal).forEach(([realId, times]) => {
      const totalDuration = totalDurationMap.get(realId) ?? 0
      if (totalDuration <= 0) {
        atrMap[realId] = 0
        return
      }

      const sumRatio =
        times.reduce((a, b) => a + Math.min(b, totalDuration), 0) /
        totalDuration
      atrMap[realId] = Number(((sumRatio / times.length) * 100).toFixed(2))
    })

    const pausecount = toLookupMap(interaction_pause, 'hold_count')
    const zoomcount = toLookupMap(interaction_zoom, 'pinch_count')
    const drawercount = toLookupMap(interaction_drawer, 'expanded_count')
    // 7️⃣ Build FINAL Response
    const realsData = reals.map((r) => {
      const stats = statsMap[r.realId]
      const hold = pausecount[r.realId] ?? 0
      const zoom = zoomcount[r.realId] ?? 0
      const drawer = drawercount[r.realId] ?? 0

      const interactions = hold + zoom + drawer

      // const no = interaction_pause[r.realId]
      const userRetentions = retentionMap[r.realId] ?? []
      const avgSlideRetention =
        userRetentions.length > 0
          ? Number(
              (
                userRetentions.reduce((a, b) => a + b, 0) /
                userRetentions.length
              ).toFixed(2)
            )
          : 0

      return {
        project: projectIdMap[r.project.toString()] ?? 'Unknown',
        realId: r._id,
        realName: r.realName,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        avgTime: avgTimeMap[r.realId] ?? 0,
        slides: slidesMap[r._id.toString()] ?? 0,
        slidesRetention: avgSlideRetention,
        visits: stats?.totalVisits ?? 0,
        interactions,
        totalDuration: r?.total_duration ?? 0,
        uniqUsers: stats?.uniqueUserCount ?? 0,
        firstSeen: stats?.firstSeen ?? null,
        lastSeen: stats?.lastSeen ?? null,
        currentUrl: stats?.current_url ?? null,
        avgTimeRetention: atrMap[r.realId] ?? 0,
        // sharingTitle: r.sharingTitle ?? 'N/A',
      }
    })

    // 8️⃣ Pagination Count (NO DATE FILTER)
    const total = await RealModel.countDocuments(realMatch)

    return res.status(200).json({
      message: 'Reals Data fetched successfully',
      total,
      realsData,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error })
  }
}
const REALS_UsageTrends = async (req: CustomRequest, res: Response) => {
  const { userId } = req.user ?? {
    userId: undefined,
  }
  const {
    metrics = 'reals_opened',
    breakdown,
    startDate,
    endDate,
  } = req.query ?? {}

  if (!userId) {
    return res.status(400).json({ message: 'Invalid User' })
  }

  try {
    // 1️⃣ Fetch user → populated projects → reals
    const userData = await UserModel.findOne({ userId })
      .select('projects')
      .populate({
        path: 'projects',
        select: 'reals',
        populate: { path: 'reals', select: 'realId' },
      })
      .lean<UserWithProjects>()

    if (!userData) {
      return res.status(404).json({ message: 'User not found' })
    }

    // 2️⃣ Flatten all realIds
    const allRealIds: string[] = (userData.projects || [])
      .flatMap((p) => p.reals || [])
      .map((r) => r.realId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (!allRealIds.length) {
      return res.status(200).json({ message: 'No Reals Found', data: [] })
    }

    // 3️⃣ Date range setup
    const now = new Date()
    const start = startDate
      ? new Date(startDate as string)
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate as string) : now
    const diffDays = Math.floor(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    )

    // 4️⃣ Grouping type
    let groupingType: 'day' | 'week' | 'month' | 'year' = 'day'
    if (diffDays <= 7) groupingType = 'day'
    else if (diffDays <= 45) groupingType = 'week'
    else if (diffDays <= 365) groupingType = 'month'
    else groupingType = 'year'

    const startSec = start.getTime()
    const endSec = end.getTime()

    // 5️⃣ Base match for PageView
    const baseMatch: Record<string, unknown> = {
      realId: { $in: allRealIds },
      $expr: {
        $and: [
          { $gte: [{ $toDouble: '$time' }, startSec] },
          { $lte: [{ $toDouble: '$time' }, endSec] },
        ],
      },
    }

    // 6️⃣ Date format pattern
    let dateFormat: string

    if (groupingType === 'day' || groupingType === 'week') {
      dateFormat = '%Y-%m-%d'
    } else if (groupingType === 'month') {
      dateFormat = '%Y-%m'
    } else {
      dateFormat = '%Y'
    }
    let trendData: TrendDataItem[] | Record<string, string | number>[] = []

    // 7️⃣ Time bucket generator
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

    // 8️⃣ Fill missing data
    const fillMissing = (
      data: Array<{ _id: string; value: number }>,
      start: Date,
      end: Date,
      grouping: string
    ) => {
      const buckets = generateTimeBuckets(start, end, grouping)
      const mapped = data.reduce<Record<string, number>>((acc, item) => {
        acc[item._id] = item.value
        return acc
      }, {})
      return buckets.map((b) => ({ _id: b, value: mapped[b] ?? 0 }))
    }

    // 9️⃣ Metrics logic
    if (metrics === 'reals_opened') {
      const isBreakdown = breakdown === 'true'
      const buckets = generateTimeBuckets(start, end, groupingType)

      if (!isBreakdown) {
        // Normal aggregation (all reals)
        trendData = await PageViewModel.aggregate<TrendDataItem>([
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
          { $project: { _id: 1, value: { $size: '$uniqueReals' } } },
          { $sort: { _id: 1 } },
        ])
        trendData = fillMissing(
          trendData as TrendDataItem[],
          start,
          end,
          groupingType
        )
      } else {
        // BREAKDOWN: top 5 reals
        // 1️⃣ Get total events per real
        const realTotals = await PageViewModel.aggregate<RealTotalAggregate>([
          { $match: baseMatch },
          { $group: { _id: '$realId', total: { $sum: 1 } } },
          { $sort: { total: -1 } },
          { $limit: 5 },
        ])

        const top5Reals = realTotals.map((r) => r._id)

        // 2️⃣ Aggregate timeline for each top real
        const breakdownData = await Promise.all(
          top5Reals.map(async (realId) => {
            const realUrlDoc = await RealModel.findOne(
              { realId },
              { realName: 1 }
            ).lean()

            const perRealAgg = await PageViewModel.aggregate<PerRealAggregate>([
              { $match: { ...baseMatch, realId } },
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

            const map = perRealAgg.reduce<Record<string, number>>(
              (acc, row) => {
                acc[row._id] = row.value
                return acc
              },
              {}
            )

            const filled: BreakdownDataItem[] = buckets.map((b) => ({
              _id: b,
              value: map[b] ?? 0,
            }))

            return {
              realId,
              realName: realUrlDoc?.realName ?? 'N/A',
              data: filled,
            }
          })
        )

        // 3️⃣ Build final table for chart
        trendData = buckets.map((bucket) => {
          const row: Record<string, string | number> = { date: bucket }
          breakdownData.forEach((real) => {
            const realData = real as {
              realId: string
              data: BreakdownDataItem[]
              realName: string
            }
            const safeName =
              realData.realName?.trim() || `Real-${real.realId.slice(-4)}`
            row[safeName] =
              realData.data.find((d) => d._id === bucket)?.value ?? 0
          })
          return row
        })
      }
    } else if (metrics === 'views') {
      const isBreakdown = breakdown === 'true'
      const buckets = generateTimeBuckets(start, end, groupingType)

      if (!isBreakdown) {
        trendData = await PageViewModel.aggregate<TrendDataItem>([
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
        trendData = fillMissing(
          trendData as TrendDataItem[],
          start,
          end,
          groupingType
        )
      } else {
        // BREAKDOWN: TOP 5 REALS

        const realTotals = await Promise.all(
          allRealIds.map(async (realId) => {
            const total = await PageViewModel.countDocuments({
              realId,
              $expr: {
                $and: [
                  { $gte: [{ $toDouble: '$time' }, startSec] },
                  { $lte: [{ $toDouble: '$time' }, endSec] },
                ],
              },
            })
            return { realId, total }
          })
        )

        const sortedReals = [...realTotals].sort((a, b) => b.total - a.total)

        const top5Reals = sortedReals.slice(0, 5).map((r) => r.realId)

        const breakdownData = await Promise.all(
          top5Reals.map(async (realId) => {
            const realUrlDoc = await RealModel.findOne(
              { realId },
              { realName: 1 }
            ).lean()
            const perRealAgg = await PageViewModel.aggregate<PerRealAggregate>([
              {
                $match: {
                  realId,
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

            const map = perRealAgg.reduce<Record<string, number>>(
              (acc, row) => {
                acc[row._id] = row.value
                return acc
              },
              {}
            )

            const filled: BreakdownDataItem[] = buckets.map((b) => ({
              _id: b,
              value: map[b] ?? 0,
            }))
            return {
              realId,
              realName: realUrlDoc?.realName ?? 'N/A',
              data: filled,
            }
          })
        )

        // Build final table
        trendData = buckets.map((bucket) => {
          const row: Record<string, string | number> = { date: bucket }

          breakdownData.forEach((real) => {
            const safeName =
              real.realName?.trim() || `Real-${real.realId.slice(-4)}`
            row[safeName] = real.data.find((d) => d._id === bucket)?.value ?? 0
          })

          return row
        })
      }
    } else if (metrics === 'unique_users') {
      const isBreakdown = breakdown === 'true'
      const buckets = generateTimeBuckets(start, end, groupingType)

      if (!isBreakdown) {
        // Normal aggregation (all users)
        trendData = await PageViewModel.aggregate<TrendDataItem>([
          { $match: baseMatch },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: dateFormat,
                  date: { $toDate: { $toDouble: '$time' } },
                },
              },
              uniqueUsers: { $addToSet: '$distinct_id' },
            },
          },
          { $project: { _id: 1, value: { $size: '$uniqueUsers' } } },
          { $sort: { _id: 1 } },
        ])
        trendData = fillMissing(
          trendData as TrendDataItem[],
          start,
          end,
          groupingType
        )
      } else {
        // BREAKDOWN: top 5 users
        // 1️⃣ Get total unique events per user
        const userTotals = await PageViewModel.aggregate<UserTotalAggregate>([
          { $match: baseMatch },
          { $group: { _id: '$distinct_id', total: { $sum: 1 } } },
          { $sort: { total: -1 } },
          { $limit: 5 },
        ])

        const top5Users = userTotals.map((u) => u._id)

        // 2️⃣ Get timeline for each top user
        const breakdownData = await Promise.all(
          top5Users.map(async (userId) => {
            const realUrlDoc = await RealModel.findOne(
              { realId: userId },
              { realName: 1, _id: 0 }
            ).lean()

            const perUserAgg = await PageViewModel.aggregate<PerUserAggregate>([
              { $match: { ...baseMatch, distinct_id: userId } },
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

            const map = perUserAgg.reduce<Record<string, number>>(
              (acc, row) => {
                acc[row._id] = row.value
                return acc
              },
              {}
            )

            const filled: BreakdownDataItem[] = buckets.map((b) => ({
              _id: b,
              realName: realUrlDoc?.realName ?? 'N/A',
              value: map[b] ?? 0,
            }))
            return { userId, data: filled }
          })
        )

        // 3️⃣ Build final table
        trendData = buckets.map((bucket) => {
          const row: Record<string, string | number> = { date: bucket }
          breakdownData.forEach((user) => {
            const userData = user as {
              userId: string
              data: BreakdownDataItem[]
              realName: string
            }
            const safeName =
              userData.realName?.trim() || `Real-${userData.userId.slice(-4)}`
            row[safeName] =
              userData.data.find((d) => d._id === bucket)?.value ?? 0
          })
          return row
        })
      }
    }

    // 1️⃣0️⃣ Format week nicely
    const formattedData = trendData
    // 1️⃣1️⃣ Send response
    return res.status(200).json({
      message: `Reals Usage Trends (${metrics})`,
      range: { start, end, diffDays },
      total_reals: allRealIds.length,
      data: formattedData,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error })
  }
}
const popupSliders = async (req: CustomRequest, res: Response) => {
  const { realId } = req.query
  if (!realId) {
    return res.status(400).json({ message: 'Real Id is required' })
  }
  try {
    const slides = await UnitModel.find({
      real: new mongoose.Types.ObjectId(realId as string),
    }).lean()

    if (!slides.length) {
      return res.status(200).json({ message: 'No slides found', slides: [] })
    }

    const slideIds = slides.map((s) => s.unitId)
    const durations = await sliderViewdModel.aggregate<SlideDurationAggregate>([
      { $match: { slide_id: { $in: slideIds } } },
      {
        $group: {
          _id: '$slide_id',
          totalDuration: { $sum: { $toDouble: '$session_duration_seconds' } },
        },
      },
    ])
    const pausedCounts = await SlidePausedModel.aggregate([
      { $match: { slide_id: { $in: slideIds } } },
      { $group: { _id: '$slide_id', count: { $sum: 1 } } },
    ])
    const drawerClosedCounts = await drawerModel.aggregate([
      { $match: { slide_id: { $in: slideIds }, action: 'closed' } },
      {
        $group: {
          _id: '$slide_id',
          closedCount: { $sum: 1 },
        },
      },
    ])

    const durationMap: Record<string, number> = {}
    durations.forEach((d) => {
      durationMap[d._id] = d.totalDuration
    })
    const pausedMap: Record<string, number> = {}
    pausedCounts.forEach((p: { _id: string; count: number }) => {
      pausedMap[p._id] = p.count
    })
    const drawerClosedMap: Record<string, number> = {}
    drawerClosedCounts.forEach((d: { _id: string; closedCount: number }) => {
      drawerClosedMap[d._id] = d.closedCount
    })
    // 4️⃣ Merge back
    const result = slides.map((slide) => ({
      slideId: slide.unitId,
      slideName: slide.unitName,
      timeSpent: durationMap[slide.unitId] ?? 0,
      numberOfPauses: pausedMap[slide.unitId] ?? 0,
      drawerClosed: drawerClosedMap[slide.unitId] ?? 0,
    }))

    return res.status(200).json({ message: 'Slides Fetched', result })
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error })
  }
}
export { real_Dashboard, Reals_Data, REALS_UsageTrends, popupSliders }
