/** Plain-language labels for the claim standard, shared by the claim UI. */
import { ClaimShape, ConfidenceWord, EntrySource } from "@prisma/client"

export const SHAPE_LABELS: Record<ClaimShape, string> = {
  NUMBER_BY_DATE: "Number by date",
  EVENT_BY_DATE: "Event by date",
  A_BEATS_B: "A beats B",
  RANK_OR_AWARD: "Rank or award",
  FREE_TEXT: "Free text",
}

export const PART_LABELS: Record<string, string> = {
  measure: "What's measured",
  comparison: "Comparison",
  value: "Number",
  valueHigh: "Upper number",
  unit: "Unit",
  baseline: "Measured from",
  event: "What happens",
  a: "A",
  b: "B",
  metric: 'How "beats" is measured',
  subject: "Who or what",
  rankOrAward: "Rank or award",
  deadline: "Deadline",
}

export const COMPARISON_LABELS: Record<string, string> = {
  above: "above",
  below: "below",
  at_least: "at least",
  at_most: "at most",
  between: "between",
}

export const CONFIDENCE_LABELS: Record<ConfidenceWord, string> = {
  ALMOST_CERTAIN: "almost certain (90–99%)",
  VERY_LIKELY: "very likely (80–90%)",
  LIKELY: "likely (60–80%)",
  TOSS_UP: "toss-up (40–60%)",
  UNLIKELY: "unlikely (20–40%)",
  VERY_UNLIKELY: "very unlikely (10–20%)",
  ALMOST_NO_CHANCE: "almost no chance (1–10%)",
}

export const SOURCE_LABELS: Record<EntrySource, string> = {
  WEB: "web",
  API: "API",
  PHONE: "phone",
  AGENT: "agent",
}

export const STATUS_HELP: Record<string, string> = {
  stated: "You said or confirmed this",
  extracted: "Read from your text by the AI. Not yet confirmed",
  working: "A default the engine suggested. Not yet confirmed",
}

export function formatDay(isoDay: string) {
  return new Date(`${isoDay}T00:00:00.000Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}
