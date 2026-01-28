/**
 * Shared lock mechanism to prevent multiple cron jobs from running simultaneously
 */
let isAnyCronRunning = false

export const acquireCronLock = (): boolean => {
  if (isAnyCronRunning) {
    return false
  }
  isAnyCronRunning = true
  return true
}

export const releaseCronLock = (): void => {
  isAnyCronRunning = false
}

export const isCronLocked = (): boolean => {
  return isAnyCronRunning
}
