export interface Unit {
  unitId: string
  unitName: string
  _id: string
  availability: string
  duration: number
}

export interface Real {
  realId: string
  realName: string
  units?: Unit[]
  createdAt: string
  UpdatedAt?: string
  sharingTitle?: string
  createdBy?: string
}

interface Project {
  _id: string
  projectName: string
  status: string
  createdAt: string
  updatedAt: string
  reals?: Real[]
}

export interface UserWithProjects {
  projects?: Project[]
}
export interface Stats {
  _id: string
  totalTime: number
  firstSeen: Date
  lastSeen: Date
  uniqueUsers: string[]
  totalVisits: number
}

export interface UnitData {
  name: string
  status: string
  totalVisits: number
  uniqusers: number
  totalTime: number
  firstseen: number | null
  lastseen: number | null
}
export interface ApiStats {
  totalTime: number
  firstSeen: Date
  lastSeen: Date
  uniqueUserCount: number
  totalVisits: number
}
export interface PostHogEvent {
  id: string
  distinct_id: string
  event: string
  timestamp: Date
  properties: {
    $sent_at?: string
    $current_url?: string
    $session_id?: string
    $pathname?: string

    // pageleave
    real_id?: string
    project_id?: string
    client_id?: string
    session_duration_seconds?: string
    session_duration_formatted?: string
    $prev_pageview_id?: string
    $prev_pageview_pathname?: string
    $prev_pageview_duration?: number
    $prev_pageview_last_scroll?: number
    $prev_pageview_max_scroll?: number
    $prev_pageview_last_scroll_percentage?: number
    $prev_pageview_max_scroll_percentage?: number
    $session_entry_url?: string
    $session_entry_pathname?: string
    $session_entry_host?: string

    // slide_move / slide_viewed
    slide_title?: string
    slide_index?: string
    view_duration?: string
    slide_id?: string
    total_slides?: string
    slide_type: string
    remaining_time_ms: string
    previous_pause_source: string
    pause_source: string
    asset_delay: number | null
    action: string
    drawer_height?: number

    zoom_scale: number
    from?: {
      _id?: string
      title?: string
      asset_type?: string
      view_number?: string
      tab?: string
      real_id?: string
    }

    to?: {
      _id?: string
      title?: string
      asset_type?: string
      view_number?: string
      tab?: string
      real_id?: string
    }
  }
}
export interface Pause {
  _id: string // real_id
  hold_count: number
}

export interface Zoom {
  _id: string // real_id
  pinch_count: number
}

export interface Drawer {
  _id: string // real_id
  expanded_count: number
}
