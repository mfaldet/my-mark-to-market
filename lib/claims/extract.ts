/**
 * The AI step of the rigor engine. One function: extractClaim.
 *
 *   in:  the claim text (never rewritten) and the date the claim was made
 *   out: which of the five shapes it is, and whatever outcome parts the
 *        text actually states, each marked "extracted" (not yet confirmed)
 *
 * This is the only place the app calls an AI model. It does not grade,
 * does not read confidence and does not have the final say on the
 * deadline: plain code does those (grade.ts, confidence.ts, dates.ts), so
 * they give the same answer every time.
 *
 * The key comes from ANTHROPIC_API_KEY. With no key, or if the call fails
 * for any reason, the function returns an empty result marked "manual"
 * and the claim is saved as free text for me to fill in by hand. Logging
 * a claim never depends on the AI being available.
 *
 * Server-side only.
 */
import Anthropic from "@anthropic-ai/sdk"
import { ClaimShape } from "@prisma/client"
import {
  allowedParts,
  COMPARISONS,
  OutcomeParts,
  parseOutcomeParts,
} from "./types"

/** A small, cheap model by default. Override with CLAIM_AI_MODEL. */
export const DEFAULT_CLAIM_AI_MODEL = "claude-haiku-5-5"

export type ExtractInput = {
  /** my words, exactly as I said them */
  text: string
  /** when I made the claim; relative dates are read against this */
  claimDate: Date
}

export type Extraction = {
  /** "ai" if the model filled this in; "manual" if I need to */
  source: "ai" | "manual"
  /** null when source is "manual": no shape has been picked */
  shape: ClaimShape | null
  /** every part here has status "extracted" */
  parts: OutcomeParts
  /**
   * The deadline the model read, as YYYY-MM-DD. Only used when plain code
   * (dates.ts) finds no deadline phrase itself.
   */
  deadline: string | null
  /**
   * A clean, sharp one-sentence statement of the claim, proposed by the AI
   * or an agent. Shown in a preview; saved only if I approve it.
   */
  headline?: string | null
  /** why the AI was not used, when source is "manual" */
  note?: string
}

/** The one method of the Anthropic client this file uses (so tests can fake it). */
export type ClaimAiClient = {
  messages: Pick<Anthropic["messages"], "create">
}

const SHAPES: ClaimShape[] = [
  "NUMBER_BY_DATE",
  "EVENT_BY_DATE",
  "A_BEATS_B",
  "RANK_OR_AWARD",
  "FREE_TEXT",
]

const nullableString = { type: ["string", "null"] } as const

/** What the model must return. Every field is required; unknowns are null. */
export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    shape: { type: "string", enum: SHAPES },
    headline: nullableString,
    measure: nullableString,
    comparison: { type: ["string", "null"], enum: [...COMPARISONS, null] },
    value: { type: ["number", "null"] },
    valueHigh: { type: ["number", "null"] },
    unit: nullableString,
    baseline: nullableString,
    event: nullableString,
    howToTell: nullableString,
    a: nullableString,
    b: nullableString,
    metric: nullableString,
    subject: nullableString,
    rankOrAward: nullableString,
    deadline: nullableString,
  },
  required: [
    "shape",
    "headline",
    "measure",
    "comparison",
    "value",
    "valueHigh",
    "unit",
    "baseline",
    "event",
    "howToTell",
    "a",
    "b",
    "metric",
    "subject",
    "rankOrAward",
    "deadline",
  ],
  additionalProperties: false,
} as const

export const EXTRACTION_SYSTEM_PROMPT = `You read one claim or prediction that a person has written in their own words, and describe what would have to be observed for it to be true. Your output is checked by code and shown back to the person to confirm, so the most useful thing you can do is report exactly what their words say and leave everything else empty. A gap you leave empty gets asked about; a gap you fill with a guess looks like something they said.

Pick the one shape that fits:

- NUMBER_BY_DATE: a measurable quantity compared with a number by some date. Parts: measure (the thing measured), comparison, value, unit, and optionally valueHigh (the upper number, only for "between") and baseline (what a change is measured from, such as "today's close").
- EVENT_BY_DATE: something happens or does not happen by some date. Parts: event, and howToTell (where anyone could look to see whether it happened).
- A_BEATS_B: one thing outdoes another. Parts: a, b, and metric (how "beats" is measured).
- RANK_OR_AWARD: someone or something reaches a rank or wins an award. Parts: subject, rankOrAward.
- FREE_TEXT: a general view with nothing specific to observe, such as "the labor market is weakening". No parts.

Also write a headline: one clear, sharp sentence that says what the person means, in plain words, naming who or what, the measure, the threshold and the date where the text gives them. This is a rewrite, so here you should tidy loose phrasing and use precise terms; but do not add a number, a date or a claim the text does not contain. The person approves or changes the headline before it is used, and their original words are kept alongside it. If the text is too vague to restate more clearly, set headline to null.

How to fill the parts:

- Use the person's own wording for text parts, trimmed to the relevant phrase. Do not rewrite, sharpen or name a specific data series they did not name. If they wrote "unemployment", measure is "unemployment", not "U-3 unemployment rate".
- comparison is one of above, below, at_least, at_most, between. Words like "hit", "reach" or "get to" mean at_least. "Falls 20%" or "drops by 20%" is a decline of at_least 20, with the direction in the unit ("% decline"). If the text gives a number with no direction at all, such as "margins of 70.6%", leave comparison null.
- value is the bare number. unit is what it is counted in ("%", "USD", "index points", "% decline"). Ignore hedges like "about" or "roughly"; they are handled elsewhere.
- A percentage that states how sure the person is ("70% chance", "likely") is their confidence, not part of the outcome. Leave it out entirely.
- deadline is a date in YYYY-MM-DD form, only if the text says when. Work out relative phrases from the claim date you are given, never from today: "this year" is December 31 of the claim date's year, "next month" is the last day of the month after the claim date. If the text gives no time, deadline is null.
- event is one thing that happens. If the text holds several ("X, and Y, but Z"), do not join them with "and" or write "if ... then": keep the person's wording for the first or main one and leave the rest out. The person will be asked to split it.
- howToTell is the one part you may propose rather than report, because an event cannot be checked without it. If the text names a source, a measure or an observable fact, use that. Otherwise propose the most obvious public place to look, named plainly: "the Federal Reserve's rate announcements", "the BLS monthly jobs report", "the company's investor-relations leadership page". Do not use it to swap in a different thing from the one the person named. If nothing sensible comes to mind, leave it null. The person confirms or changes it before it counts.
- Set every part that does not belong to the shape you picked, and every part the text does not state, to null.`

function buildUserMessage(input: ExtractInput) {
  const claimDate = input.claimDate.toISOString().slice(0, 10)
  return `Claim date: ${claimDate}\n\nClaim:\n${input.text}`
}

const manual = (note: string): Extraction => ({
  source: "manual",
  shape: null,
  parts: {},
  deadline: null,
  note,
})

/**
 * Turns the model's flat answer into outcome parts for the chosen shape:
 * drops nulls and anything that shape does not use, and marks the rest
 * "extracted". Exported for tests.
 */
export function toExtraction(raw: Record<string, unknown>): Extraction {
  const shape = raw.shape as ClaimShape
  if (!SHAPES.includes(shape)) {
    return manual("The AI returned a shape this app does not know.")
  }

  const parts: Record<string, { value: string | number; status: "extracted" }> =
    {}
  for (const name of allowedParts(shape)) {
    if (name === "deadline") continue // kept separately; see Extraction.deadline
    const value = raw[name]
    if (typeof value === "number" && Number.isFinite(value)) {
      parts[name] = { value, status: "extracted" }
    } else if (typeof value === "string" && value.trim() !== "") {
      parts[name] = { value: value.trim(), status: "extracted" }
    }
  }
  // "between" is the only comparison that uses an upper number
  if (parts.comparison?.value !== "between") delete parts.valueHigh

  const checked = parseOutcomeParts(shape, parts)
  if (!checked.ok) {
    return manual(
      `The AI's answer did not fit the claim shape: ${checked.error}`,
    )
  }

  const deadline =
    typeof raw.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.deadline)
      ? raw.deadline
      : null

  const headline =
    typeof raw.headline === "string" && raw.headline.trim() !== ""
      ? raw.headline.trim()
      : null

  return { source: "ai", shape, parts: checked.parts, deadline, headline }
}

/**
 * The AI step. Never throws: any failure comes back as a "manual" result
 * with a note, so a claim can always be saved.
 */
export async function extractClaim(
  input: ExtractInput,
  options: { client?: ClaimAiClient; model?: string } = {},
): Promise<Extraction> {
  if (!input.text.trim()) {
    return manual("Empty claim.")
  }
  if (!options.client && !process.env.ANTHROPIC_API_KEY) {
    return manual("No ANTHROPIC_API_KEY set: fill the fields by hand.")
  }

  const client: ClaimAiClient = options.client ?? new Anthropic()
  const model =
    options.model || process.env.CLAIM_AI_MODEL || DEFAULT_CLAIM_AI_MODEL

  try {
    const response = await client.messages.create({
      model,
      // The answer is short, but the model thinks first and that counts
      // against this limit too: leave room so the answer is not cut off.
      max_tokens: 8000,
      // a short extraction: keep the model's reasoning brief and cheap
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
      },
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(input) }],
    })

    if (response.stop_reason === "refusal") {
      return manual("The AI declined to read this claim.")
    }
    if (response.stop_reason === "max_tokens") {
      return manual("The AI's answer was cut off.")
    }

    const text = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    )?.text
    if (!text) {
      return manual("The AI returned no answer.")
    }
    return toExtraction(JSON.parse(text))
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return manual("The ANTHROPIC_API_KEY was rejected.")
    }
    if (error instanceof Anthropic.RateLimitError) {
      return manual("The AI is rate limited right now.")
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return manual("Could not reach the AI.")
    }
    if (error instanceof Anthropic.APIError) {
      // the server's own words say what was wrong with the request
      console.error("extractClaim: API error", error.status, error.message)
      return manual(
        `The AI returned an error (${error.status ?? "unknown"}): ${String(
          error.message,
        ).slice(0, 200)}`,
      )
    }
    if (error instanceof SyntaxError) {
      return manual("The AI's answer could not be read.")
    }
    console.error("extractClaim failed", error)
    return manual("The AI step failed.")
  }
}
