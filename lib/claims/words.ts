/**
 * The words the screen uses for things the code names differently.
 *
 * In the database and the API a result is YES, NO or AMBIGUOUS (Fatebook's
 * names, kept so nothing has to be migrated). On screen it is right, wrong
 * or can't tell.
 */
import { Resolution } from "@prisma/client"

export type Result = "right" | "wrong" | "can't tell"

const RESULT: Record<Resolution, Result> = {
  YES: "right",
  NO: "wrong",
  AMBIGUOUS: "can't tell",
}

export function resultFor(resolution: Resolution | null | undefined) {
  return resolution ? RESULT[resolution] : null
}

/** "Right", "Wrong", "Can't tell"; anything else is shown as it is. */
export function resultLabel(resolution: string | null | undefined): string {
  const word = RESULT[resolution as Resolution]
  if (!word) return resolution ?? ""
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * Reads a result however it is written: "right", "Wrong", "can't tell",
 * "cant_tell", or the stored names YES / NO / AMBIGUOUS.
 */
export function parseResult(raw: string): Resolution | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "")
  if (["right", "yes", "true", "correct"].includes(key)) return "YES"
  if (["wrong", "no", "false", "incorrect"].includes(key)) return "NO"
  if (["canttell", "cannottell", "ambiguous", "unclear"].includes(key)) {
    return "AMBIGUOUS"
  }
  return null
}

/** Plain names for the outcome parts, used in messages as well as labels. */
export const PART_WORDS: Record<string, string> = {
  measure: "what's measured",
  comparison: "the comparison",
  value: "the number",
  valueHigh: "the upper number",
  unit: "the unit",
  baseline: "what it's measured from",
  event: "what happens",
  a: "the first side",
  b: "the second side",
  metric: 'how "beats" is measured',
  subject: "who or what",
  rankOrAward: "the rank or award",
  deadline: "the deadline",
  howToTell: "a way to tell",
}

export function partWords(names: readonly string[]): string {
  const words = names.map((name) => PART_WORDS[name] ?? name)
  if (words.length <= 1) return words.join("")
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
}

/**
 * The standard Brier score for one yes/no outcome: 0 is perfect, 0.25 is a
 * coin flip, 1 is certain and wrong. Lower is better.
 *
 * Fatebook stores twice this (it adds the "yes" and "no" sides together,
 * so its coin flip is 0.5). Halving it on the way to the screen gives the
 * figure most people mean by "Brier score".
 */
export function standardBrier(stored: number): number {
  return stored / 2
}

export const BRIER_LINE = "0 is perfect, 0.25 is a coin flip; lower is better"
