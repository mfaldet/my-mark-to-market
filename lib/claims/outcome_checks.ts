/**
 * Checks on what an outcome SAYS. Plain code, no AI, no database.
 *
 * Grading used to look only at whether each part was filled in, so an
 * "event" with any text at all counted as complete. This reads the text:
 *
 *   findCompound  - is this more than one prediction in a trench coat?
 *                   ("if ... then", "and/or", two results joined by "and")
 *
 * There used to be a second check here that flagged an outcome naming
 * something my own words did not. It was removed on purpose: sharpening
 * loose words into different, more precise terms is the point.
 */
import { OutcomeParts } from "./types"

/** The parts whose value is a sentence I (or the AI) wrote. */
const TEXT_PARTS = ["event", "measure", "metric", "rankOrAward"] as const

/** Words that mark the start of something that can happen or be true. */
const RESULT_VERB =
  "(?:will|won't|will not|would|wouldn't|is going to|are going to|isn't going to|does|doesn't|does not|do|don't|stays?|remains?|beats?|outperforms?|out performs?|underperforms?|falls?|rises?|hits?|reaches?|drops?|gets?|wins?|loses?|fires?|cuts?|raises?|is|are|was|were|has|have)"

/** Brackets are asides ("(i.e. the scandal doesn't matter)"), not results. */
function withoutAsides(text: string) {
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function sentences(text: string) {
  return text
    .split(/(?<=[.!?;])\s+(?=[A-Z"“])/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3)
}

export type CompoundCheck =
  | { compound: false }
  | {
      compound: true
      /** which rule caught it */
      why: "if-then" | "and/or" | "two results" | "two sentences"
      /** one plain sentence for the grade line */
      reason: string
    }

/** Is this one outcome, or several? */
export function findCompoundIn(raw: string): CompoundCheck {
  const text = withoutAsides(raw)
  if (!text) return { compound: false }

  if (/\bif\b[^.;]*?(,|\bthen\b)/i.test(text) || /\bif not\b/i.test(text)) {
    return {
      compound: true,
      why: "if-then",
      reason:
        'This says "if … then", which is two things: a condition and a result. Split it, so each can be marked right or wrong on its own.',
    }
  }
  if (/\band\s*\/\s*or\b/i.test(text)) {
    return {
      compound: true,
      why: "and/or",
      reason:
        'This says "and/or", so it could come true in more than one way. Split it into separate predictions.',
    }
  }
  if (sentences(text).length > 1) {
    return {
      compound: true,
      why: "two sentences",
      reason:
        "This holds more than one checkable statement. Split it into separate predictions.",
    }
  }
  // two results joined by and / but / or / while: a verb on each side
  const joined = new RegExp(
    `\\b${RESULT_VERB}\\b[^.;]*?(?:,\\s*|\\s+)(?:and|but|or|while)\\s+(?:[^.;]*?\\s)?${RESULT_VERB}\\b`,
    "i",
  )
  if (joined.test(text)) {
    return {
      compound: true,
      why: "two results",
      reason:
        "This joins two results in one outcome. Split it, so each can be marked right or wrong on its own.",
    }
  }
  return { compound: false }
}

/** Checks every sentence-like part of an outcome. */
export function findCompound(parts: OutcomeParts | null): CompoundCheck {
  for (const name of TEXT_PARTS) {
    const value = (parts as Record<string, { value: unknown }> | null)?.[name]
      ?.value
    if (typeof value !== "string") continue
    const check = findCompoundIn(value)
    if (check.compound) return check
  }
  return { compound: false }
}
