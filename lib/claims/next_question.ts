/**
 * The one-question rule of the rigor engine. Plain code, no AI.
 *
 * Given a claim, nextQuestion returns ONE plain question about the most
 * important gap, with a suggested default where a sensible one exists -
 * never a list. After three questions it stops; the claim keeps its grade.
 *
 * There are two kinds of question:
 *   fill    - a part is missing. Accepting the suggested default stores it
 *             as "working"; typing my own answer stores it as "stated".
 *   confirm - a part is there but uncertain (e.g. "by 2028" was read as
 *             Dec 31, 2028). Saying yes is me confirming it: "stated".
 *
 * applyAnswer is the other half: it returns the claim with the answer
 * applied. Neither function touches the database.
 */
import { ClaimShape } from "@prisma/client"
import { requiredParts } from "./grade"
import { COMPARISONS, OutcomePart, OutcomeParts, PartName } from "./types"

export const MAX_ENGINE_QUESTIONS = 3

export type EngineClaim = {
  text: string
  claimDate: Date
  /** null = never shaped; treated as free text */
  shape: ClaimShape | null
  parts: OutcomeParts
  /** how many questions have been answered or skipped so far */
  questionsAsked: number
}

export type EngineQuestion = {
  part: PartName
  kind: "fill" | "confirm"
  /** the question, in plain words */
  question: string
  /** the one-tap default, if there is a sensible one */
  suggestion: { value: string | number; label: string } | null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const pretty = (isoDay: string) =>
  new Date(`${isoDay}T00:00:00.000Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })

const COMPARISON_WORDS: Record<string, string> = {
  above: "above",
  below: "below",
  at_least: "at least",
  at_most: "at most",
  between: "between",
}

/** "6%" or "20 index points" */
function amount(parts: OutcomeParts) {
  const value = parts.value?.value
  const unit = String(parts.unit?.value ?? "")
  if (value === undefined) return "that number"
  return unit.startsWith("%") ? `${value}${unit}` : `${value} ${unit}`.trim()
}

/** A change ("falls 20%") needs to say what it is measured from. */
function looksLikeAChange(claim: EngineClaim) {
  const unit = String(claim.parts.unit?.value ?? "")
  return (
    /declin|increas|change|drop|fall|rise|gain|loss/i.test(unit) ||
    /\b(falls?|drops?|rises?|gains?|loses?|up|down|increases?|decreases?|declines?)\b[^.]*\d/i.test(
      claim.text,
    )
  )
}

/** The question for one missing part. */
function fillQuestion(part: PartName, claim: EngineClaim): EngineQuestion {
  const { parts, claimDate } = claim
  const ask = (
    question: string,
    suggestion: EngineQuestion["suggestion"] = null,
  ): EngineQuestion => ({ part, kind: "fill", question, suggestion })

  switch (part) {
    case "measure":
      return ask("What exactly is being measured?")
    case "event":
      return ask("What would you see happen if this is true?")
    case "deadline": {
      // default: the end of the year after the claim was made
      const day = iso(
        new Date(Date.UTC(claimDate.getUTCFullYear() + 1, 11, 31)),
      )
      return ask("When does this come due?", {
        value: day,
        label: `By ${pretty(day)}?`,
      })
    }
    case "value":
      return ask("What number would make this true?")
    case "comparison":
      return ask(`How does it compare with ${amount(parts)}?`, {
        value: "at_least",
        label: `At least ${amount(parts)}?`,
      })
    case "unit":
      return ask(`${parts.value?.value ?? "The number"} of what?`)
    case "valueHigh":
      return ask(
        `Between ${parts.value?.value ?? "the first number"} and what?`,
      )
    case "a":
      return ask("Who or what comes out ahead?")
    case "b":
      return ask("Ahead of who or what?")
    case "metric":
      return ask(
        `How is "beats" measured between ${parts.a?.value ?? "A"} and ${parts.b?.value ?? "B"}?`,
      )
    case "subject":
      return ask("Who or what is this about?")
    case "rankOrAward":
      return ask("Which rank or award?")
    case "baseline": {
      const day = iso(claimDate)
      return ask("Measured from where?", {
        value: `close on ${day}`,
        label: `From the close on ${pretty(day)}?`,
      })
    }
  }
}

/**
 * The single most important question for this claim, or null when there
 * is nothing left to ask or three have already been asked.
 */
export function nextQuestion(claim: EngineClaim): EngineQuestion | null {
  if (claim.questionsAsked >= MAX_ENGINE_QUESTIONS) return null

  const shape = claim.shape ?? "FREE_TEXT"
  const { parts } = claim
  const present = (name: PartName) =>
    parts[name] !== undefined && parts[name]!.value !== ""

  // 1. Free text: the gap is that nothing is observable at all.
  if (shape === "FREE_TEXT") {
    return fillQuestion("event", claim)
  }

  // 2. A needed part is missing. requiredParts lists them most important first.
  const missing = requiredParts(shape, parts).find((p) => !present(p))
  if (missing) return fillQuestion(missing, claim)

  // 3. A change with no starting point ("falls 20%" - from where?).
  if (
    shape === "NUMBER_BY_DATE" &&
    !present("baseline") &&
    looksLikeAChange(claim)
  ) {
    return fillQuestion("baseline", claim)
  }

  // 4. A deadline the engine was unsure of ("by 2028").
  if (parts.deadline?.status === "working") {
    const day = String(parts.deadline.value)
    return {
      part: "deadline",
      kind: "confirm",
      question: "Is this the deadline you meant?",
      suggestion: { value: day, label: `By ${pretty(day)}?` },
    }
  }

  return null
}

export type EngineAnswer =
  /** one tap on the suggested default */
  | { accept: true }
  /** my own answer */
  | { value: string | number }
  /** move on without answering */
  | { skip: true }

export type AnswerResult =
  | { ok: true; claim: EngineClaim }
  | { ok: false; error: string }

function coerce(part: PartName, raw: string | number): string | number | null {
  if (part === "value" || part === "valueHigh") {
    const n = typeof raw === "number" ? raw : parseFloat(raw.replace(/,/g, ""))
    return Number.isFinite(n) ? n : null
  }
  if (part === "comparison") {
    const key = String(raw).trim().toLowerCase().replace(/\s+/g, "_")
    return (COMPARISONS as readonly string[]).includes(key) ? key : null
  }
  if (part === "deadline") {
    const text = String(raw).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(text) &&
      !isNaN(Date.parse(`${text}T00:00:00.000Z`))
      ? text
      : null
  }
  const text = String(raw).trim()
  return text === "" ? null : text
}

/**
 * Applies my answer to the current question and counts it. Returns a new
 * claim; the one passed in is not changed.
 */
export function applyAnswer(
  claim: EngineClaim,
  answer: EngineAnswer,
): AnswerResult {
  const question = nextQuestion(claim)
  if (!question) {
    return { ok: false, error: "There is no open question on this claim." }
  }
  const counted = { ...claim, questionsAsked: claim.questionsAsked + 1 }

  if ("skip" in answer) {
    return { ok: true, claim: counted }
  }

  let part: OutcomePart
  if ("accept" in answer) {
    if (!question.suggestion) {
      return {
        ok: false,
        error: "This question has no suggested default. Give an answer.",
      }
    }
    part = {
      value: question.suggestion.value,
      // accepting a default leaves it "working"; confirming makes it mine
      status: question.kind === "confirm" ? "stated" : "working",
    }
  } else {
    const value = coerce(question.part, answer.value)
    if (value === null) {
      const hint =
        question.part === "deadline"
          ? "a date like 2027-12-31"
          : question.part === "comparison"
            ? `one of: ${Object.values(COMPARISON_WORDS).join(", ")}`
            : question.part === "value" || question.part === "valueHigh"
              ? "a number"
              : "an answer"
      return { ok: false, error: `Expected ${hint}.` }
    }
    part = { value, status: "stated" }
  }

  return {
    ok: true,
    claim: {
      ...counted,
      // answering "what would you see?" turns free text into an event claim
      shape:
        (claim.shape ?? "FREE_TEXT") === "FREE_TEXT"
          ? "EVENT_BY_DATE"
          : claim.shape,
      parts: { ...claim.parts, [question.part]: part },
    },
  }
}
