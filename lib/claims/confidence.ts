/**
 * Confidence words and the "is this percentage a confidence?" rule.
 * Plain code, no AI: the same text always gives the same answer.
 */
import { ConfidenceWord } from "@prisma/client"

/** The fixed list. low/high are percentages; strongest first. */
export const CONFIDENCE_RANGES: Record<
  ConfidenceWord,
  { label: string; low: number; high: number }
> = {
  ALMOST_CERTAIN: { label: "almost certain", low: 90, high: 99 },
  VERY_LIKELY: { label: "very likely", low: 80, high: 90 },
  LIKELY: { label: "likely", low: 60, high: 80 },
  TOSS_UP: { label: "toss-up", low: 40, high: 60 },
  UNLIKELY: { label: "unlikely", low: 20, high: 40 },
  VERY_UNLIKELY: { label: "very unlikely", low: 10, high: 20 },
  ALMOST_NO_CHANCE: { label: "almost no chance", low: 1, high: 10 },
}

/**
 * The single number Fatebook stores for a word: the midpoint of its range,
 * as a probability between 0 and 1. "likely" (60-80) -> 0.7
 */
export function probabilityForWord(word: ConfidenceWord): number {
  const { low, high } = CONFIDENCE_RANGES[word]
  return (low + high) / 200
}

export type ParsedConfidence =
  // a word from the fixed list
  | { kind: "word"; word: ConfidenceWord; probability: number; match: string }
  // a percentage said as odds ("70% chance")
  | { kind: "percent"; probability: number; match: string }
  // a flat "will", "I think" on its own, or nothing
  | { kind: "not_given" }

// Longer phrases first, so "very likely" is not read as "likely" and
// "unlikely" is not read as "likely".
const WORD_PATTERNS: [ConfidenceWord, RegExp][] = [
  ["ALMOST_NO_CHANCE", /\balmost no chance\b/i],
  ["ALMOST_CERTAIN", /\balmost certain(ly)?\b/i],
  ["VERY_UNLIKELY", /\bvery unlikely\b/i],
  ["VERY_LIKELY", /\bvery likely\b/i],
  ["TOSS_UP", /\btoss[- ]?up\b/i],
  ["UNLIKELY", /\b(unlikely|not likely|I doubt)\b/i],
  ["LIKELY", /\b(likely|probably)\b/i],
]

// Words that turn a percentage into odds.
const ODDS =
  "chance|likely|likelihood|probability|probable|odds|confident|confidence|sure|certain"
// "70% chance", "70 percent likely", "70% sure"
const PERCENT_THEN_ODDS = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*(?:%|percent)\\s+(?:${ODDS})\\b`,
  "i",
)
// "odds of 70%", "probability: 70%", "chance is 70%"
const ODDS_THEN_PERCENT = new RegExp(
  `\\b(?:${ODDS})\\s*(?:of|at|is|are|:|=)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:%|percent)`,
  "i",
)

/**
 * Reads the confidence out of claim text.
 *
 * - A percentage only counts when it is said as odds ("70% chance",
 *   "70% likely"). Otherwise it is a number in the claim:
 *   "Margins of 70.6% next quarter" -> not given.
 * - A percentage said as odds wins over a word ("70% likely" is 70%, not
 *   the word "likely").
 * - "probably" counts as likely and "I doubt" as unlikely.
 * - A flat "will" with no hedge, or "I think" on its own -> not given.
 */
export function parseConfidence(text: string): ParsedConfidence {
  const percent = PERCENT_THEN_ODDS.exec(text) ?? ODDS_THEN_PERCENT.exec(text)
  if (percent) {
    const value = parseFloat(percent[1])
    if (value >= 0 && value <= 100) {
      return { kind: "percent", probability: value / 100, match: percent[0] }
    }
  }

  for (const [word, pattern] of WORD_PATTERNS) {
    const found = pattern.exec(text)
    if (found) {
      return {
        kind: "word",
        word,
        probability: probabilityForWord(word),
        match: found[0],
      }
    }
  }

  return { kind: "not_given" }
}

/** "likely", "Very Likely", "toss-up", "TOSS_UP" -> the stored word, or null */
export function parseConfidenceWord(raw: string): ConfidenceWord | null {
  const key = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
  return key in CONFIDENCE_RANGES ? (key as ConfidenceWord) : null
}
