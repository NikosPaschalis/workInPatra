// The job aggregator still runs twice a day. Only Kariera gets a reduced schedule.
export const KARIERA_DAILY_CRON = "0 18 * * *";
export const KARIERA_JITTER_MAX_MS = 180_000;

export function shouldRunKariera(eventName, schedule) {
  // Local/explicit runs remain useful for diagnosing recovery.
  return eventName !== "schedule" || schedule === KARIERA_DAILY_CRON;
}

export function karieraJitterMs(eventName, random = Math.random) {
  return eventName === "schedule"
    ? Math.floor(random() * (KARIERA_JITTER_MAX_MS + 1))
    : 0;
}
