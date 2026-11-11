/**
 * Checks on what an outcome SAYS. Plain code, no AI, no database.
 *
 * Grading used to look only at whether each part was filled in, so an
 * "event" with any text at all counted as complete. These checks read the
 * text:
 *
 *   findCompound  - is this more than one prediction in a trench coat?
 *                   ("if ... then", "and/or", two results joined by "and")
 *   findMismatch  - does the outcome name something my own words did not?
 *                   (my words say "Mag 7 average", the outcome says "S&P 500")
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

// --- Does the outcome name something my words did not? -----------------------

const NOT_NAMES = new Set(
  (
    "a an the this that these those if then and or but not no so it its it's " +
    "i my we our you your he she they his her their there here " +
    "is are was were be been will would won't wouldn't does doesn't do don't did " +
    "by on in at of to for from over under through throughout during before after until since " +
    "when what which who how why yes still " +
    "jan january feb february mar march apr april may jun june jul july aug august " +
    "sep sept september oct october nov november dec december " +
    "monday tuesday wednesday thursday friday saturday sunday q1 q2 q3 q4 " +
    "ceo cfo ipo gdp cpi"
  ) // roles and measures everyone abbreviates; too generic to be a contradiction
    .split(" "),
)

/**
 * The proper names in a piece of text: capitalised words and runs of them,
 * with a trailing number kept ("S&P 500", "Mag 7", "Jensen Huang").
 */
export function namesIn(text: string): string[] {
  const names: string[] = []
  const pattern =
    /[A-Z][A-Za-z0-9&]*(?:[-'’.][A-Za-z0-9&]+)*(?:\s+(?:[A-Z][A-Za-z0-9&]*(?:[-'’.][A-Za-z0-9&]+)*|\d+(?![\d,]*\s*(?:%|percent))))*/g
  for (const match of Array.from(withoutAsides(text).matchAll(pattern))) {
    // drop possessives and leading filler words ("If the", "The")
    const words = match[0]
      .replace(/['’]s\b/g, "")
      .split(/\s+/)
      .filter(Boolean)
    while (words.length && NOT_NAMES.has(words[0].toLowerCase())) words.shift()
    while (
      words.length &&
      (NOT_NAMES.has(words[words.length - 1].toLowerCase()) ||
        // a bare year or day number left at the end ("Dec 31, 2027")
        (/^\d+$/.test(words[words.length - 1]) && words.length === 1))
    ) {
      words.pop()
    }
    // a trailing 4-digit year is a date, not part of a name
    if (words.length > 1 && /^(19|20)\d\d$/.test(words[words.length - 1])) {
      words.pop()
    }
    const name = words.join(" ")
    if (name.length >= 2 && !/^\d+$/.test(name)) names.push(name)
  }
  return Array.from(new Set(names))
}

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim()

/**
 * Names the outcome uses that my own words never mention. An empty list
 * means no mismatch. This is a flag for me to look at, not a verdict:
 * naming a source ("per the BLS") is a legitimate addition.
 */
export function findMismatch(
  text: string,
  parts: OutcomeParts | null,
): string[] {
  const mine = ` ${squash(text)} `
  const added: string[] = []
  // what is being measured or compared; not howToTell, where a new name is a source
  for (const name of ["event", "measure", "a", "b", "metric", "subject"]) {
    const value = (parts as Record<string, { value: unknown }> | null)?.[name]
      ?.value
    if (typeof value !== "string") continue
    for (const found of namesIn(value)) {
      const whole = mine.includes(` ${squash(found)} `)
      // "Jensen Huang" when I said "this Jensen scandal": the same name, fuller
      const partly = squash(found)
        .split(" ")
        .some(
          (word) =>
            word.length >= 3 &&
            !/^\d+$/.test(word) &&
            !NOT_NAMES.has(word) &&
            mine.includes(` ${word} `),
        )
      if (!whole && !partly && !added.includes(found)) added.push(found)
    }
  }
  return added
}

/** One plain sentence for the flag, or null. */
export function mismatchFlag(text: string, parts: OutcomeParts | null) {
  const added = findMismatch(text, parts)
  if (added.length === 0) return null
  const list =
    added.length === 1
      ? added[0]
      : `${added.slice(0, -1).join(", ")} and ${added[added.length - 1]}`
  return `The outcome mentions ${list}, which your own words don't. Check it says what you meant.`
}
