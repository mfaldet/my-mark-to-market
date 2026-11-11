import { useEffect, useState } from "react"
import {
  calendarDay,
  describeCalendarDay,
  formatCalendarDay,
} from "../../lib/claims/calendar"

/**
 * Shows a deadline or check-back date as the calendar day it is: Dec 31
 * is Dec 31 for everyone, whatever time zone they are in. (FormattedDate
 * is for moments in time, such as when something was resolved.)
 */
export function CalendarDate({
  date,
  capitalise = false,
  className,
}: {
  date: Date | string
  capitalise?: boolean
  className?: string
}) {
  // "today" and "in 5 days" depend on the viewer's clock, so they are
  // worked out in the browser; the server renders the plain date.
  const [text, setText] = useState(() => formatCalendarDay(date))
  useEffect(() => setText(describeCalendarDay(date)), [date])
  return (
    <span
      className={className}
      title={calendarDay(date)}
      suppressHydrationWarning={true}
    >
      {capitalise ? text.charAt(0).toUpperCase() + text.slice(1) : text}
    </span>
  )
}
