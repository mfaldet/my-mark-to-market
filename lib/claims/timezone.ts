/**
 * Time zones. Plain code, no database.
 *
 * Dates in this app are calendar days ("2026-11-10"), stored as midnight
 * UTC. What "today" means depends on where I am: 8:30pm on Nov 10 in
 * Chicago is already Nov 11 in UTC. Everything that asks "what day is it?"
 * goes through here.
 */
export const DEFAULT_TIME_ZONE = "America/Chicago"

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== "string") return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format()
    return true
  } catch {
    return false
  }
}

/** The given zone if it is a real one, otherwise the default. */
export function timeZoneOrDefault(timeZone?: string | null): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE
}

/** The calendar day it is in that zone at that moment, as YYYY-MM-DD. */
export function dayIn(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZoneOrDefault(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return `${get("year")}-${get("month")}-${get("day")}`
}

/**
 * "Now", shifted so that its UTC calendar day is today's date in that
 * zone. The rest of the code compares days in UTC (deadlines are stored as
 * midnight UTC), so handing it this value makes it work in my zone.
 */
export function localToday(timeZone: string, now: Date): Date {
  return new Date(`${dayIn(timeZone, now)}T00:00:00.000Z`)
}
