/* eslint-disable sonarjs/no-duplicate-string */
import { Request, Response } from 'express'
import UserModel from '../models/user.model'
import sliderViewdModel from '../models/posthog/slide_viewed.model'
import { Unit, UserWithProjects } from '../lib/type'
import UnitModel from '../models/unit.model'

type UnitAggregateStats = {
  _id: string
  totalTime?: number
  totalVisits?: number
  uniqueUsers?: string[]
  avgTime?: number
  firstSeen?: Date | string
  lastSeen?: Date | string
}
interface OpenRateAggResult {
  _id: string
  viewedRealsCount: number
}

interface CustomRequest extends Request {
  user?: { userId: string | undefined; userType: string | undefined }
  query: {
    metrics?: string
    limit?: number
    search?: string
  } & Request['query']
}

const unitDashboard = async (req: CustomRequest, res: Response) => {
  const { userId } = req.user ?? {
    userId: undefined,
  }
  const { startDate, endDate } = req.query
  if (!userId) {
    return res.status(400).json({ message: 'Invalid User' })
  }
  const dateFilter: Record<string, Date> = {}
  if (startDate) dateFilter.$gte = new Date(startDate as string)
  if (endDate) dateFilter.$lte = new Date(endDate as string)

  // Apply only when startDate or endDate exists
  const dateMatch = startDate || endDate ? { time: dateFilter } : {}

  try {
    // 1️⃣ Fetch user with projects → reals → units populated
    const userData = await UserModel.findOne({ userId })
      .select('projects reals')
      .populate({
        path: 'projects',
        select: 'reals',
        populate: {
          path: 'reals',
          select: 'units',
          populate: {
            path: 'units',
            select: 'unitId',
          },
        },
      })
      .lean<UserWithProjects>()

    if (!userData) {
      return res.status(404).json({ message: 'User not found' })
    }

    // 2️⃣ Flatten all units
    const allUnits: Unit[] = (userData.projects || [])
      .flatMap((proj) => proj.reals || [])
      .flatMap((real) => real.units || [])
    const uniqueUnitsMap = new Map()

    for (const unit of allUnits) {
      if (unit.unitId) {
        uniqueUnitsMap.set(unit.unitId, unit)
      }
    }

    const uniqueUnits = Array.from(uniqueUnitsMap.values())
    const TotalUnits = uniqueUnits.length
    // const realsCount=
    // 3️⃣ Extract unitIds
    const allUnitIds = uniqueUnits.map((u: { unitId: string }) => u.unitId)

    // 4️⃣ Count total visits
    const totalVisits = await sliderViewdModel.countDocuments({
      slide_id: { $in: allUnitIds },
      ...dateMatch,
    })

    // 5️⃣ Distinct opened units
    const openedUnits = await sliderViewdModel.distinct('slide_id', {
      slide_id: { $in: allUnitIds },
      ...dateMatch,
    })

    // 6️⃣ Calculate open rate
    const unitOpenRate =
      TotalUnits > 0
        ? Number(((openedUnits.length / TotalUnits) * 100).toFixed(2))
        : 0
    const sessions = await sliderViewdModel
      .find(
        {
          slide_id: { $in: allUnitIds },
          session_duration_seconds: { $gt: 0 },
          ...dateMatch,
        },
        { session_duration_seconds: 1, _id: 0 }
      )
      .lean()
    const totalDuration = sessions.reduce(
      (sum, s) => sum + Number(s.session_duration_seconds || 0),
      0
    )
    // count
    const totalSessions = sessions.length

    // average
    const avgTimePerUser = totalSessions > 0 ? totalDuration / totalSessions : 0
    const totalunitOpen = openedUnits?.length
    return res.status(200).json({
      message: 'Unit Dashboard fetched successfully',
      TotalUnits,
      totalVisits,
      unitOpenRate,
      totalunitOpen,
      avgTimePerUser,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error })
  }
}
const unitData = async (req: CustomRequest, res: Response) => {
  const { userId } = req.user ?? {
    userId: undefined,
  }
  const { startDate, endDate } = req.query

  if (!userId) {
    return res.status(400).json({ message: 'Invalid User' })
  }
  try {
    // Pagination and search
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const search = (req.query.search as string)?.trim() || ''
    const skip = (page - 1) * limit

    // 1️⃣ Find only the user's project IDs
    const dateFilter: Record<string, Date> = {}
    if (startDate) dateFilter.$gte = new Date(startDate as string)
    if (endDate) dateFilter.$lte = new Date(endDate as string)

    const dateMatch = startDate || endDate ? { time: dateFilter } : {}
    const user = await UserModel.findOne({ userId }).select('projects').lean()

    if (!user) return res.status(404).json({ message: 'User not found' })

    const projectIds = user.projects || []
    if (!projectIds.length)
      return res.status(200).json({ message: 'No units found', data: [] })

    // 2️⃣ Fetch units with pagination
    const query: {
      project: { $in: typeof projectIds }
      unitName?: { $regex: string; $options: string }
    } = { project: { $in: projectIds } }
    if (search) query.unitName = { $regex: search, $options: 'i' }

    const [units, total] = await Promise.all([
      UnitModel.find(query)
        .select('unitId unitName availability real')
        .skip(skip)
        .limit(limit)
        .lean(),

      UnitModel.countDocuments(query),
    ])

    if (!units.length)
      return res.status(200).json({
        message: 'No units found',
        data: [],
        pagination: { page, limit, total },
      })

    const unitIds = units.map((u) => u.unitId)

    // 3️⃣ Fetch analytics for all units at once
    const stats = await sliderViewdModel.aggregate<UnitAggregateStats>([
      { $match: { slide_id: { $in: unitIds }, ...dateMatch } },
      {
        $group: {
          _id: '$slide_id',
          totalTime: { $sum: { $toDouble: '$session_duration_seconds' } },
          sessionCount: {
            $sum: {
              $cond: [
                { $gt: [{ $toDouble: '$session_duration_seconds' }, 0] },
                1,
                0,
              ],
            },
          },
          firstSeen: { $min: '$time' },
          lastSeen: { $max: '$time' },
          uniqueUsers: { $addToSet: '$distinct_id' },
          totalVisits: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 1,
          totalTime: 1,
          totalVisits: 1,
          firstSeen: 1,
          lastSeen: 1,
          uniqueUsers: 1,
          avgTime: {
            $cond: [
              { $eq: ['$sessionCount', 0] },
              0,
              { $divide: ['$totalTime', '$sessionCount'] },
            ],
          },
        },
      },
    ])

    const statsMap = new Map<string, UnitAggregateStats>(
      stats.map((s) => [String(s._id), s])
    )

    // 4️⃣ Merge metadata + analytics
    const data = units.map((unit) => {
      const s = statsMap.get(unit.unitId)

      return {
        id: unit._id,
        name: unit.unitName,
        availability: unit.availability,
        realsCount: unit.real?.length ?? 0,
        slideViews: s?.totalVisits ?? 0,
        uniqueUsers: s?.uniqueUsers?.length ?? 0,
        totalTime: s?.totalTime ?? 0,
        avgTime: s?.avgTime ?? 0,
        firstSeen: s?.firstSeen ? new Date(s.firstSeen).getTime() : null,
        lastSeen: s?.lastSeen ? new Date(s.lastSeen).getTime() : null,
      }
    })

    return res.status(200).json({
      message: 'Unit Data fetched successfully',
      data,
      pagination: { page, limit, total },
    })
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error })
  }
}
const performanceChart = async (req: CustomRequest, res: Response) => {
  const { userId } = req.user ?? {
    userId: undefined,
  }
  const { metrics, startDate, endDate } = req.query ?? { metrics: undefined }
  if (!userId) {
    return res.status(400).json({ message: 'Invalid User' })
  }
  try {
    const user = await UserModel.findOne({ userId }).select('projects').lean()

    if (!user?.projects?.length) {
      return res.status(200).json({ message: 'No Projects', data: [] })
    }

    // 2️⃣ Fetch units from these projects (with project name)
    const units = await UnitModel.find({
      project: { $in: user.projects },
    })
      .select('unitId unitName project real ')
      .populate('project', 'projectName')
      .lean()

    if (!units.length) {
      return res.status(200).json({ message: 'No Units Found', data: [] })
    }

    // Create a lookup for unitId → {unitName, projectName}
    const unitLookup = (
      units as Array<{
        unitId: string
        unitName: string
        project?: { projectName?: string }
      }>
    ).reduce<Record<string, { unitName: string; projectName: string }>>(
      (acc, u) => {
        acc[u.unitId] = {
          unitName: u.unitName,
          projectName: u.project?.projectName ?? '',
        }
        return acc
      },
      {}
    )

    const unitIds = Object.keys(unitLookup)
    const dateFilter: Record<string, Date> = {}

    if (startDate) {
      dateFilter.$gte = new Date(startDate as string)
    }

    if (endDate) {
      // Include entire end date day
      dateFilter.$lte = new Date((endDate as string) + 'T23:59:59.999')
    }
    const matchCondition: {
      slide_id: { $in: string[] }
      time?: Record<string, Date>
    } = {
      slide_id: { $in: unitIds },
    }

    if (startDate || endDate) {
      matchCondition.time = dateFilter
    }
    // Helper to generate final response rows
    const mapResult = (
      results: Array<{
        _id: string
        value?: number
        openRate?: number
        avgTime?: number
      }>
    ) =>
      results.map((r) => {
        const info = unitLookup[r._id] ?? { unitName: '', projectName: '' }

        return {
          unitId: r._id,
          name: `${info.projectName} - ${info.unitName}`,
          project: info.projectName,
          unit: info.unitName,
          value: r.value ?? r.openRate ?? r.avgTime ?? 0,
        }
      })

    // 3️⃣ Metric-wise aggregation
    let results: {
      _id: string
      value?: number
      openRate?: number
      avgTime?: number
    }[] = []

    switch (metrics) {
      case 'slide_views':
        results = await sliderViewdModel.aggregate([
          { $match: matchCondition },
          { $group: { _id: '$slide_id', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: 5 },
        ])

        return res.status(200).json({
          message: 'Top 5 Units by Slide Views',
          data: mapResult(results),
        })

      case 'open_rate': {
        // Correctly typed aggregation
        const results = await sliderViewdModel.aggregate<OpenRateAggResult>([
          {
            $match: {
              slide_id: { $in: unitIds },
              ...(startDate || endDate ? { time: dateFilter } : {}),
            },
          },

          // 1️⃣ collect unique REAL ids per slide/unit
          {
            $group: {
              _id: '$slide_id',
              viewedReals: { $addToSet: '$real_id' },
            },
          },

          // 2️⃣ count them
          {
            $project: {
              _id: 1,
              viewedRealsCount: { $size: '$viewedReals' },
            },
          },
        ])

        // 3️⃣ Compute percentages and build final output
        const final = results.map((r) => {
          const info = unitLookup[r._id] ?? {
            unitName: '',
            projectName: '',
          }

          const totalReals =
            units.find((u) => u.unitId === r._id)?.real?.length || 0

          const viewed = r.viewedRealsCount || 0

          const percent =
            totalReals > 0 ? Math.round((viewed / totalReals) * 100) : 0

          return {
            unitId: r._id,
            name: `${info.projectName} - ${info.unitName}`,
            project: info.projectName,
            unit: info.unitName,
            value: percent, // rename "value" for consistent structure
            viewed,
            totalReals,
          }
        })

        // 4️⃣ sort by percentage (value)
        const sorted = final.sort((a, b) => b.value - a.value)

        return res.status(200).json({
          message: 'Top 5 Units by Open Rate (%)',
          data: sorted.slice(0, 5),
        })
      }

      case 'avg_time':
        results = await sliderViewdModel.aggregate([
          { $match: matchCondition },
          {
            $addFields: {
              durationSeconds: { $toDouble: '$session_duration_seconds' },
            },
          },
          {
            $group: {
              _id: '$slide_id',
              avgSeconds: { $avg: '$durationSeconds' },
            },
          },

          {
            $project: {
              _id: 1,
              avgTime: {
                $divide: ['$avgSeconds', 60],
              },
            },
          },

          { $sort: { avgTime: -1 } },
          { $limit: 5 },
        ])

        return res.status(200).json({
          message: 'Top 5 Units by Average View Time',
          data: mapResult(results),
        })
      case 'reals_count': {
        const data = units
          .map((u) => {
            const projectName =
              (u.project as { projectName?: string } | undefined)
                ?.projectName ?? ''
            const unitName = u.unitName ?? ''

            return {
              unitId: u.unitId,
              name: `${projectName} - ${unitName}`,
              project: projectName,
              unit: unitName,
              value: Array.isArray(u.real) ? u.real.length : 0, // count how many reals this unit appears in
            }
          })
          .sort((a, b) => b.value - a.value)
          .slice(0, 5)

        return res.status(200).json({
          message: 'Top 5 Units by Reals Count',
          data,
        })
      }

      default:
        return res.status(400).json({ message: 'Invalid metrics option' })
    }
  } catch (error) {
    return res.status(500).json({ message: 'Server Error', error })
  }
}
export { unitDashboard, unitData, performanceChart }
