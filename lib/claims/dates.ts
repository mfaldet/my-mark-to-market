/**
 * Turns a deadline phrase in claim text into a calendar date.
 *
 * The one rule that matters: relative phrases ("this year", "next month",
 * "by December") are worked out from the CLAIM DATE, never from today.
 * Nothing in this file reads the clock.
 *
 * All dates are calendar days at 00:00 UTC, matching how Fatebook's API
 * stores a resolveBy given as YYYY-MM-DD.
 */
import * as chrono from "chrono-node"

export type ResolvedDeadline = {
  date: Date
  /** the words in the text this came from */
  phrase: string
  /**
   * true when the phrase has two reasonable readings (e.g. "by 2028" could
   * mean before 2028 starts or by the end of it). The engine should treat
   * the date as a suggestion to confirm, not as something I stated.
   */
  ambiguous: boolean
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]
const MONTH_NAMES = MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join("|")

function utc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day))
}
/** last day of a month; month may run past 11 and rolls into later years */
function endOfMonth(year: number, month: number) {
  return utc(year, month + 1, 0)
}
function endOfQuarter(year: number, quarter: number) {
  // quarter is 0-3 and may run past 3
  return endOfMonth(year, quarter * 3 + 2)
}
function endOfYear(year: number) {
  return utc(year, 11, 31)
}

type Rule = {
  pattern: RegExp
  resolve: (
    m: RegExpExecArray,
    claim: { y: number; m: number; d: number },
  ) => { date: Date; ambiguous?: boolean } | null
}

// Checked in order; the first rule that matches wins.
const RULES: Rule[] = [
  // 2027-12-31
  {
    pattern: /\b(20\d\d)-(\d\d)-(\d\d)\b/,
    resolve: (m) => ({ date: utc(+m[1], +m[2] - 1, +m[3]) }),
  },
  // "within 6 months", "in the next 2 years", "in 90 days"
  {
    pattern:
      /\b(?:within|in)\s+(?:the\s+next\s+)?(\d+)\s+(day|week|month|year)s?\b/i,
    resolve: (m, c) => {
      const n = +m[1]
      const unit = m[2].toLowerCase()
      if (unit === "day") return { date: utc(c.y, c.m, c.d + n) }
      if (unit === "week") return { date: utc(c.y, c.m, c.d + n * 7) }
      if (unit === "month") return { date: utc(c.y, c.m + n, c.d) }
      return { date: utc(c.y + n, c.m, c.d) }
    },
  },
  // "Q3 2026", "by Q4"
  {
    pattern: /\bq([1-4])(?:\s+(20\d\d))?\b/i,
    resolve: (m, c) => {
      const quarter = +m[1] - 1
      if (m[2]) return { date: endOfQuarter(+m[2], quarter) }
      // no year: the next time that quarter ends on or after the claim date
      const thisYear = endOfQuarter(c.y, quarter)
      return {
        date:
          thisYear >= utc(c.y, c.m, c.d)
            ? thisYear
            : endOfQuarter(c.y + 1, quarter),
      }
    },
  },
  // "this quarter", "next quarter", "end of the quarter"
  {
    pattern: /\b(this|next|the)\s+quarter\b/i,
    resolve: (m, c) => {
      const quarter =
        Math.floor(c.m / 3) + (m[1].toLowerCase() === "next" ? 1 : 0)
      return { date: endOfQuarter(c.y, quarter) }
    },
  },
  // "this month", "next month", "end of the month"
  {
    pattern: /\b(this|next|the)\s+month\b/i,
    resolve: (m, c) => ({
      date: endOfMonth(c.y, c.m + (m[1].toLowerCase() === "next" ? 1 : 0)),
    }),
  },
  // "this year", "next year", "end of the year", "year-end"
  {
    pattern: /\b(?:(this|next|the)\s+year|year[- ]end)\b/i,
    resolve: (m, c) => ({
      date: endOfYear(c.y + (m[1]?.toLowerCase() === "next" ? 1 : 0)),
    }),
  },
  // "by December", "in March 2027", "before June", "end of May"
  // (needs a lead-in word so the verb "may" is not read as a month, and
  // skips "December 15", which is an exact day handled further down)
  {
    pattern: new RegExp(
      `\\b(by|in|during|before|until|through|end of)\\s+(?:the\\s+end\\s+of\\s+)?(${MONTH_NAMES})\\.?(?!\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\b|,))(?:,?\\s+(20\\d\\d))?`,
      "i",
    ),
    resolve: (m, c) => {
      const month = MONTHS.findIndex((name) =>
        name.startsWith(m[2].toLowerCase().slice(0, 3)),
      )
      // no year: the next time that month comes round, counting the claim's own month
      const year = m[3] ? +m[3] : month >= c.m ? c.y : c.y + 1
      // "before December" means by the end of November
      const before = m[1].toLowerCase() === "before"
      return { date: endOfMonth(year, before ? month - 1 : month) }
    },
  },
  // "end of 2027", "by 2028", "in 2026", "before 2030"
  {
    pattern: /\b(by|in|during|before|until|through|end of)\s+(20\d\d)\b/i,
    resolve: (m) => {
      const lead = m[1].toLowerCase()
      if (lead === "before") return { date: endOfYear(+m[2] - 1) }
      // "by 2028" reads two ways; we take the end of 2028 and flag it
      return { date: endOfYear(+m[2]), ambiguous: lead === "by" }
    },
  },
]

// A date after one of these words is where a change is measured from
// ("from today's close", "since March 3"), not a deadline.
const BASELINE_LEAD_IN =
  /\b(from|since|as of|versus|vs\.?|compared (?:to|with))\s+$/i

/**
 * Finds the deadline in claim text, worked out from the claim date.
 * Returns null if the text has no deadline phrase.
 *
 *   resolveDeadline("... this year", July 14 2025)  -> Dec 31 2025
 *   resolveDeadline("... next month", July 14 2025) -> Aug 31 2025
 *   resolveDeadline("... by December", July 14 2025) -> Dec 31 2025
 */
export function resolveDeadline(
  text: string,
  claimDate: Date,
): ResolvedDeadline | null {
  const claim = {
    y: claimDate.getUTCFullYear(),
    m: claimDate.getUTCMonth(),
    d: claimDate.getUTCDate(),
  }

  // 1. An exact day ("March 3, 2027", "Dec 15", "Friday", "tomorrow").
  //    chrono is given the claim date as "now". It works in the machine's
  //    local time zone, so we hand it local noon on the claim's calendar day
  //    and read back calendar-day parts: the answer is then the same on
  //    every machine, whatever its time zone.
  const exact = chrono
    .parse(text, new Date(claim.y, claim.m, claim.d, 12), { forwardDate: true })
    .find(
      (r) =>
        (r.start.isCertain("day") || r.start.isCertain("weekday")) &&
        !BASELINE_LEAD_IN.test(text.slice(0, r.index)),
    )
  const exactIsFullDate =
    exact &&
    (exact.start.isCertain("month") || exact.start.isCertain("weekday"))

  // 2. A period ("this year", "by December", "Q3 2026", "within 6 months").
  for (const rule of RULES) {
    const m = rule.pattern.exec(text)
    if (!m) continue
    // the first two rules (ISO date, "within N months") are exact already;
    // otherwise an exact day wins over a period ("by December 15")
    if (rule === RULES[0] || rule === RULES[1] || !exactIsFullDate) {
      const resolved = rule.resolve(m, claim)
      if (resolved) {
        return {
          date: resolved.date,
          phrase: m[0],
          ambiguous: resolved.ambiguous ?? false,
        }
      }
    }
  }

  if (exact && exactIsFullDate) {
    return {
      date: utc(
        exact.start.get("year")!,
        exact.start.get("month")! - 1,
        exact.start.get("day")!,
      ),
      phrase: exact.text,
      ambiguous: false,
    }
  }

  return null
}
