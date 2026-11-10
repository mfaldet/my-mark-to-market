/**
 * "What's due?" - plain code for where a claim stands against its deadline.
 *
 * Deadlines are calendar days (stored at 00:00 UTC), and the deadline day
 * itself still counts: a claim due Dec 31 becomes overdue on Jan 1.
 */

export const DUE_SOON_DAYS = 7

const DAY = 24 * 60 * 60 * 1000
const startOfDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

/** Whole days from today to the deadline: 0 = due today, negative = overdue. */
export function daysToDeadline(deadline: Date, now: Date): number {
  return Math.round((startOfDay(deadline) - startOfDay(now)) / DAY)
}

/** The first moment of today (UTC). A deadline before this has passed. */
export function startOfToday(now: Date): Date {
  return new Date(startOfDay(now))
}

/** The last deadline that still counts as "due soon". */
export function dueSoonCutoff(now: Date, withinDays = DUE_SOON_DAYS): Date {
  return new Date(startOfDay(now) + withinDays * DAY)
}

export type DueStatus = "overdue" | "due soon" | null

export function dueStatus(
  deadline: Date,
  now: Date,
  withinDays = DUE_SOON_DAYS,
): DueStatus {
  const days = daysToDeadline(deadline, now)
  if (days < 0) return "overdue"
  if (days <= withinDays) return "due soon"
  return null
}

/** "overdue by 3 days", "due today", "due in 5 days" */
export function describeDue(deadline: Date, now: Date): string {
  const days = daysToDeadline(deadline, now)
  const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`
  if (days < 0) return `overdue by ${plural(-days)}`
  if (days === 0) return "due today"
  return `due in ${plural(days)}`
}
