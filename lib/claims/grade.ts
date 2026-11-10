/**
 * The grading rules. Plain code, no AI, no database, no clock:
 * the same claim always gets the same grade.
 *
 *   1  free text: nothing observable
 *   2  shape picked, but missing the thing being observed or the deadline
 *   3  thing and deadline present, but another needed part is missing
 *      (the number, the comparison, the unit, how "beats" is measured...)
 *   4  complete and checkable, no confirmed check link
 *   5  complete and checkable, with a check link I have opened and confirmed
 *
 * Parts count toward the grade whatever their status (stated, extracted or
 * working). Publishing is stricter: see canPublish.
 */
import { ClaimShape } from "@prisma/client"
import { OutcomeParts, PartName, SHAPE_PARTS } from "./types"

export type Grade = 1 | 2 | 3 | 4 | 5

export type GradeInput = {
  /** null = never went through the engine; graded like free text */
  shape: ClaimShape | null
  parts: OutcomeParts | null
  /** true only once I have opened the check link and confirmed it */
  checkLinkConfirmed: boolean
}

export type GradeResult = {
  grade: Grade
  /** required parts that are missing, most important first */
  missing: PartName[]
  /** one plain sentence saying why it got this grade */
  reason: string
}

function has(parts: OutcomeParts, name: PartName) {
  const part = parts[name]
  return part !== undefined && part.value !== ""
}

/** The parts this claim needs, most important first. */
export function requiredParts(
  shape: ClaimShape,
  parts: OutcomeParts,
): PartName[] {
  const required: PartName[] = [...SHAPE_PARTS[shape].required]
  // "between 5 and 6" needs the upper number too
  if (shape === "NUMBER_BY_DATE" && parts.comparison?.value === "between") {
    required.splice(required.indexOf("value") + 1, 0, "valueHigh")
  }
  return required
}

export function gradeClaim(input: GradeInput): GradeResult {
  const shape = input.shape ?? "FREE_TEXT"
  const parts = input.parts ?? {}

  if (shape === "FREE_TEXT") {
    return {
      grade: 1,
      missing: [],
      reason: "Free text: nothing here can be checked yet.",
    }
  }

  const missing = requiredParts(shape, parts).filter((p) => !has(parts, p))
  const core: readonly PartName[] = SHAPE_PARTS[shape].core
  const missingCoreOrDeadline = missing.filter(
    (p) => core.includes(p) || p === "deadline",
  )

  if (missingCoreOrDeadline.length > 0) {
    return {
      grade: 2,
      missing,
      reason: `Missing ${missingCoreOrDeadline.join(" and ")}.`,
    }
  }
  if (missing.length > 0) {
    return { grade: 3, missing, reason: `Missing ${missing.join(" and ")}.` }
  }
  if (!input.checkLinkConfirmed) {
    return {
      grade: 4,
      missing,
      reason: "Complete and checkable. No confirmed check link.",
    }
  }
  return {
    grade: 5,
    missing,
    reason: "Complete and checkable, with a confirmed check link.",
  }
}

export type PublishCheck = { ok: true } | { ok: false; reasons: string[] }

/**
 * The publish gate. A claim can be shared publicly only if:
 *   - it is grade 4 or 5, and
 *   - every part it needs is "stated" (I said it or confirmed it).
 *     Extracted and working parts must be confirmed first.
 *
 * Used both when sharing and when saving an edit to a claim that is
 * already public: if this fails, the save is blocked and the reasons are
 * shown. A claim is never made private automatically.
 */
export function canPublish(input: GradeInput): PublishCheck {
  const { grade, reason } = gradeClaim(input)
  const reasons: string[] = []

  if (grade < 4) {
    reasons.push(`Grade ${grade}, needs 4 or 5 to be public. ${reason}`)
  }

  const shape = input.shape ?? "FREE_TEXT"
  const parts = input.parts ?? {}
  const unconfirmed = requiredParts(shape, parts).filter(
    (p) => has(parts, p) && parts[p]!.status !== "stated",
  )
  if (unconfirmed.length > 0) {
    reasons.push(`Not yet confirmed: ${unconfirmed.join(", ")}.`)
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
}
