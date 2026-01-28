import cron from 'node-cron'
import axios, { AxiosResponse } from 'axios'
import type { AnyBulkWriteOperation, BulkWriteOptions } from 'mongodb'
import type { Model } from 'mongoose'
import PageViewModel from '../models/posthog/pageview.model'
import PageLeaveModel from '../models/posthog/pageLeave.model'
import SliderViewedModel from '../models/posthog/slide_viewed.model'
import { PostHogEvent } from '../lib/type'
import { logger } from '../utils/logger'
import SlidePausedModel from '../models/posthog/slide_paused.model'
import SlideResumedModel from '../models/posthog/slide_resumed.model'
import drawerModel from '../models/posthog/drawer_interaction.model'
import zoomModel from '../models/posthog/zoom_interaction.model'
import { acquireCronLock, releaseCronLock } from './cronLock'
import { syncRealDurations } from '../services/realsTotalDuration'

const PH_API = process.env.POSTHOG_API!
const PH_KEY = process.env.POSTHOG_API_KEY!
const FETCH_LIMIT = 500

let isRunning = false

interface PostHogApiResponse {
  results: PostHogEvent[]
  next?: string
}
export const startPosthogCron = async () => {
  logger.info('🚀 Starting PostHog Cron Jobs...')
  await safeRunner(runFullSync)
  cron.schedule('0 */12 * * *', () => safeRunner(runFullSync))
  cron.schedule('0 * * * *', () => safeRunner(runPartialSync))
  logger.info('⏳ Cron jobs scheduled successfully!')
}

async function safeRunner(fn: () => Promise<void>) {
  if (isRunning) {
    logger.warn('⛔ Skipped job: another PostHog sync is still running')
    return
  }

  // Check shared lock to prevent running with other cron jobs
  if (!acquireCronLock()) {
    logger.warn('⛔ PostHog Cron: Skipped - another cron job is running')
    return
  }

  isRunning = true
  const name = fn.name

  try {
    logger.info(`▶ START: ${name}`)
    await fn()
    logger.info(`✔ FINISHED: ${name}`)
  } catch (err) {
    logger.error(`❌ ERROR in ${name}`, err)
  } finally {
    isRunning = false
    releaseCronLock()
  }
}

const eventTypes = [
  'slide_viewed',
  '$pageleave',
  '$pageview',
  'zoom_interaction',
  'drawer_interaction',
  'slide_resumed',
  'slide_paused',
]
async function runFullSync() {
  logger.info('⏰ FULL SYNC STARTED')

  for (const type of eventTypes) {
    await syncEventType(type, 'full')
  }
  await syncRealDurations()

  logger.info('🏁 FULL SYNC DONE.\n')
}

async function runPartialSync() {
  logger.info('⏰ PARTIAL SYNC STARTED')

  for (const type of eventTypes) {
    await syncEventType(type, 'partial')
  }

  logger.info('🏁 PARTIAL SYNC DONE.\n')
}

async function syncEventType(type: string, mode: 'full' | 'partial') {
  try {
    let nextUrl = `${PH_API}/events?event=${type}&limit=${FETCH_LIMIT}`

    if (mode === 'partial') {
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString()
      nextUrl += `&after=${encodeURIComponent(oneHourAgo)}`
    }

    let total = 0
    let page = 1
    while (nextUrl) {
      const response = await retryRequest(nextUrl)
      const events = response?.results || []

      logger.info(`📦 ${type}: Page ${page}, API returned ${events.length}`)

      const filtered = events.filter((e) => e.event === type)

      if (filtered.length > 0) {
        await routeToHandler(type, filtered)
        total += filtered.length
      }

      nextUrl = response?.next ?? ''
      page++
      if (nextUrl) await wait(350)
    }

    logger.info(
      `✔ COMPLETED ${type} (${mode.toUpperCase()}) — Total Saved: ${total}`
    )
  } catch (err) {
    logger.error(`❌ Sync failed for ${type}`, err)
  }
}

async function retryRequest(url: string) {
  let attempt = 0

  while (attempt < 6) {
    try {
      const res: AxiosResponse<PostHogApiResponse> = await axios.get(url, {
        headers: { Authorization: `Bearer ${PH_KEY}` },
        timeout: 25000,
      })

      return res.data
    } catch (err) {
      attempt++

      let status: number | undefined = undefined

      if (axios.isAxiosError(err)) {
        status = err.response?.status
      }

      const waitMs = 500 * Math.pow(2, attempt)

      if (status === 429) {
        logger.warn(`⚠ Rate limit hit. Retrying in ${waitMs}ms...`)
      } else {
        logger.warn(
          `⚠ API error ${status ?? 'unknown'}. Retrying in ${waitMs}ms...`
        )
      }

      await wait(waitMs)
    }
  }

  throw new Error('❌ PostHog API failed after 6 retries')
}
async function routeToHandler(type: string, events: PostHogEvent[]) {
  switch (type) {
    case 'slide_paused':
      return chunkedBulkWrite(events, syncSlidePausedMapper, SlidePausedModel)
    case '$pageview':
      return chunkedBulkWrite(events, syncPageViewMapper, PageViewModel)

    case '$pageleave':
      return chunkedBulkWrite(events, syncPageLeaveMapper, PageLeaveModel)

    case 'slide_viewed':
      return chunkedBulkWrite(events, syncSlideViewedMapper, SliderViewedModel)
    case 'slide_resumed':
      return chunkedBulkWrite(events, syncSlideResumedMapper, SlideResumedModel)
    case 'drawer_interaction':
      return chunkedBulkWrite(events, syncDrawerInteractionMapper, drawerModel)
    case 'zoom_interaction':
      return chunkedBulkWrite(events, syncZoomInteractionMapper, zoomModel)
    default:
      logger.warn(`⚠ Unknown event type: ${type}`)
  }
}
function syncPageViewMapper(ev: PostHogEvent) {
  return {
    updateOne: {
      filter: { id: ev.id },
      update: {
        $set: {
          id: ev.id,
          distinct_id: ev.distinct_id,
          current_url: ev?.properties?.$current_url,
          realId: ev?.properties?.$pathname?.slice(6),
          session_id: ev?.properties?.$session_id,
          time: Math.floor(new Date(ev?.properties?.$sent_at ?? 0).getTime()),
        },
      },
      upsert: true,
    },
  }
}

function syncPageLeaveMapper(ev: PostHogEvent) {
  return {
    updateOne: {
      filter: { event_id: ev.id },
      update: {
        $set: {
          distinct_id: ev.distinct_id,
          time: Math.floor(new Date(ev?.properties?.$sent_at ?? 0).getTime()),
          current_url: ev?.properties?.$current_url,
          real_id: ev?.properties?.real_id,
          project_id: ev?.properties?.project_id,
          client_id: ev?.properties?.client_id,
          session_duration_seconds: ev?.properties?.session_duration_seconds,
          session_duration_formatted:
            ev?.properties?.session_duration_formatted,
          prev_pageview_id: ev?.properties?.$prev_pageview_id,
          prev_pageview_pathname: ev?.properties?.$prev_pageview_pathname,
          prev_pageview_duration: ev?.properties?.$prev_pageview_duration,
          prev_pageview_scroll: {
            last_scroll: ev?.properties?.$prev_pageview_last_scroll,
            max_scroll: ev?.properties?.$prev_pageview_max_scroll,
            last_scroll_percentage:
              ev?.properties?.$prev_pageview_last_scroll_percentage,
            max_scroll_percentage:
              ev?.properties?.$prev_pageview_max_scroll_percentage,
          },
          session: {
            id: ev?.properties?.$session_id,
            entry_url: ev?.properties?.$session_entry_url,
            entry_pathname: ev?.properties?.$session_entry_pathname,
            entry_host: ev?.properties?.$session_entry_host,
          },
        },
      },
      upsert: true,
    },
  }
}

function syncSlideViewedMapper(ev: PostHogEvent) {
  return {
    updateOne: {
      filter: { id: ev.id },
      update: {
        $set: {
          id: ev.id,
          distinct_id: ev.distinct_id,
          slide_title: ev?.properties?.slide_title,
          real_id: ev?.properties?.real_id,
          slide_index: ev?.properties?.slide_index,
          view_duration: ev?.properties?.view_duration,
          client_id: ev?.properties?.client_id,
          slide_id: ev?.properties?.slide_id,
          total_slides: ev?.properties?.total_slides,
          project_id: ev?.properties?.project_id,
          session_duration_seconds: ev?.properties?.session_duration_seconds,
          session_duration_formatted:
            ev?.properties?.session_duration_formatted,
          time: Math.floor(new Date(ev?.properties?.$sent_at ?? 0).getTime()),
          duration: ev?.properties?.asset_delay,
        },
      },
      upsert: true,
    },
  }
}
function syncSlidePausedMapper(ev: PostHogEvent) {
  return {
    updateOne: {
      filter: { event_id: ev.id },
      update: {
        $set: {
          event_id: ev.id,
          distinct_id: ev.distinct_id,
          session_id: ev.properties?.$session_id,
          time: new Date(ev.timestamp ?? Date.now()),
          slide_id: ev.properties?.slide_id,
          slide_type: ev.properties?.slide_type,
          slide_index: ev.properties?.slide_index,
          remaining_time_ms: ev.properties?.remaining_time_ms,
          real_id: ev.properties?.real_id,
          pause_source: ev.properties?.pause_source,
        },
      },
      upsert: true,
    },
  }
}
function syncSlideResumedMapper(ev: PostHogEvent) {
  return {
    updateOne: {
      filter: { event_id: ev.id },
      update: {
        $set: {
          event_id: ev.id,
          distinct_id: ev.distinct_id,
          session_id: ev.properties?.$session_id,
          time: new Date(ev.timestamp ?? Date.now()),
          slide_id: ev.properties?.slide_id,
          slide_type: ev.properties?.slide_type,
          slide_index: ev.properties?.slide_index,
          remaining_time_ms: ev.properties?.remaining_time_ms,
          real_id: ev.properties?.real_id,
          previous_pause_source: ev.properties?.previous_pause_source,
        },
      },
      upsert: true,
    },
  }
}
function syncDrawerInteractionMapper(ev: PostHogEvent) {
  return {
    updateOne: {
      filter: { event_id: ev.id },
      update: {
        $set: {
          event_id: ev.id,
          distinct_id: ev.distinct_id,
          session_id: ev.properties?.$session_id,
          time: new Date(ev.timestamp ?? Date.now()),
          action: ev.properties?.action,
          drawer_height: ev.properties?.drawer_height,
          slide_id: ev.properties?.slide_id,
          slide_index: ev.properties?.slide_index,
          real_id: ev.properties?.real_id,
        },
      },
      upsert: true,
    },
  }
}
function syncZoomInteractionMapper(ev: PostHogEvent) {
  return {
    updateOne: {
      filter: { event_id: ev.id },
      update: {
        $set: {
          event_id: ev.id,
          distinct_id: ev.distinct_id,
          session_id: ev.properties?.$session_id,
          time: new Date(ev.timestamp ?? Date.now()),
          slide_id: ev.properties?.slide_id,
          slide_index: ev.properties?.slide_index,
          real_id: ev.properties?.real_id,
          action: ev.properties?.action,
          zoom_scale: ev.properties?.zoom_scale,
          slide_type: ev.properties?.slide_type ?? null,
        },
      },
      upsert: true,
    },
  }
}
type BulkWritableModel = Pick<Model<unknown>, 'bulkWrite'>

async function chunkedBulkWrite<TModel extends BulkWritableModel>(
  events: PostHogEvent[],
  mapFn: (ev: PostHogEvent) => AnyBulkWriteOperation<Record<string, unknown>>,
  Model: TModel
) {
  const CHUNK = 1000

  for (let i = 0; i < events.length; i += CHUNK) {
    const batch = events.slice(i, i + CHUNK).map(mapFn)

    try {
      const operations = batch as Parameters<TModel['bulkWrite']>[0]
      await Model.bulkWrite(operations, { ordered: false } as BulkWriteOptions)
    } catch (err) {
      logger.error('Mongo bulkWrite error:', err)
    }

    await wait(50)
  }
}
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms))
