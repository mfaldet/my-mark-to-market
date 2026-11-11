/**
 * Calendar dates. Plain code, safe to use in the browser.
 *
 * A deadline or check-back date is a day on the calendar ("Dec 31, 2027"),
 * not a moment in time. It is stored as midnight UTC on that day. Showing
 * that moment in a time zone behind UTC (anywhere in the Americas) gives
 * the evening before: Dec 30. So a stored date is always read back through
 * its UTC parts, never through the viewer's local clock.
 *
 * "Today" is the opposite: it is the day it is where I am, so it is read
 * from the local clock.
 */

/** The calendar day a stored date stands for, as YYYY-MM-DD. */
export function calendarDay(stored: Date | string): string {
  return typeof stored === "string"
    ? stored.slice(0, 10)
    : stored.toISOString().slice(0, 10)
}

/**
 * Today's date where the viewer is, as YYYY-MM-DD. With no time zone it
 * uses the device's own; tests pass one in.
 */
export function localDay(now: Date = new Date(), timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return `${get("year")}-${get("month")}-${get("day")}`
}

const asUtc = (day: string) => Date.parse(`${day}T00:00:00.000Z`)

/** Whole days from `today` to `day`: 0 is today, negative is in the past. */
export function daysBetween(today: string, day: string): number {
  return Math.round((asUtc(day) - asUtc(today)) / 86_400_000)
}

/** True when the date's day is over: the day after it, or later. */
export function isPastDay(
  stored: Date | string,
  now: Date = new Date(),
  timeZone?: string,
) {
  return calendarDay(stored) < localDay(now, timeZone)
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "June",
  "July",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
]

const ordinal = (day: number) =>
  [1, 21, 31].includes(day)
    ? "st"
    : [2, 22].includes(day)
      ? "nd"
      : [3, 23].includes(day)
        ? "rd"
        : "th"

/** "Dec 31st 2027"; the year is left off when it is this year. */
export function formatCalendarDay(
  stored: Date | string,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const [year, month, day] = calendarDay(stored).split("-").map(Number)
  const thisYear = Number(localDay(now, timeZone).slice(0, 4))
  return `${MONTHS[month - 1]} ${day}${ordinal(day)}${
    year !== thisYear ? ` ${year}` : ""
  }`
}

/**
 * How a date reads in a list: "today", "tomorrow", "in 5 days",
 * "3 days ago" when it is close, otherwise the date itself.
 */
export function describeCalendarDay(
  stored: Date | string,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const days = daysBetween(localDay(now, timeZone), calendarDay(stored))
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  if (days === -1) return "yesterday"
  if (days > 1 && days <= 7) return `in ${days} days`
  if (days < -1 && days >= -56) return `${-days} days ago`
  return formatCalendarDay(stored, now, timeZone)
}
