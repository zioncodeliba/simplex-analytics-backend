import sliderViewdModel from '../models/posthog/slide_viewed.model'
import RealModel from '../models/reals'
import { logger } from '../utils/logger'
type RealDurationAggregate = {
  _id: string
  total_duration: number
}

export async function syncRealDurations() {
  logger.info('🔄 Syncing real total_duration (deduped by slide_id)')

  const aggregates = await sliderViewdModel.aggregate<RealDurationAggregate>([
    {
      $group: {
        _id: {
          real_id: '$real_id',
          slide_id: '$slide_id',
        },
        duration: { $first: '$duration' },
      },
    },

    {
      $group: {
        _id: '$_id.real_id',
        total_duration: { $sum: '$duration' },
      },
    },
  ])

  if (!aggregates.length) {
    logger.info('ℹ No slide data found')
    return
  }

  const bulkOps = aggregates.map((row) => ({
    updateOne: {
      filter: { realId: row._id },
      update: {
        $set: {
          total_duration: row.total_duration,
        },
      },
    },
  }))

  const CHUNK_SIZE = 1000
  for (let i = 0; i < bulkOps.length; i += CHUNK_SIZE) {
    await RealModel.bulkWrite(bulkOps.slice(i, i + CHUNK_SIZE), {
      ordered: false,
    })
  }

  logger.info(`✅ Real duration sync done for ${bulkOps.length} reals`)
}
