/**
 * Puts the engine's pieces together for one claim.
 *
 *   extractClaim (AI, optional)  -> shape and outcome parts
 *   resolveDeadline (plain code) -> the deadline, from the claim date
 *   parseConfidence (plain code) -> confidence word or percentage
 *   isApproximate   (plain code) -> "about / roughly / around"
 *   gradeClaim      (plain code) -> grade 1-5
 *
 * analyzeClaim itself is plain code: given the same text, claim date and
 * extraction it always returns the same thing. The only non-deterministic
 * step, the AI, happens before it and is passed in.
 */
import { ClaimShape } from "@prisma/client"
import { ParsedConfidence, parseConfidence } from "./confidence"
import { resolveDeadline } from "./dates"
import { Extraction } from "./extract"
import { canPublish, gradeClaim, GradeResult, PublishCheck } from "./grade"
import { isApproximate } from "./tolerance"
import { OutcomeParts } from "./types"

export type ClaimAnalysis = {
  shape: ClaimShape
  parts: OutcomeParts
  /** calendar day at 00:00 UTC, or null if no deadline could be found */
  deadline: Date | null
  confidence: ParsedConfidence
  approximate: boolean
  grade: GradeResult
  publish: PublishCheck
  /** "ai" if the AI picked the shape and parts, "manual" if I must */
  source: Extraction["source"]
  note?: string
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10)

export function analyzeClaim(
  text: string,
  claimDate: Date,
  extraction: Extraction,
): ClaimAnalysis {
  // With no AI answer the claim is free text until I fill it in.
  const shape = extraction.shape ?? "FREE_TEXT"
  const parts: OutcomeParts = { ...extraction.parts }

  // The deadline. Plain code reads the text first, because it applies the
  // claim-date rule the same way every time. The AI's date is only a
  // fallback for phrasings the code does not know.
  let deadline: Date | null = null
  const fromText = resolveDeadline(text, claimDate)
  if (fromText) {
    deadline = fromText.date
    parts.deadline = {
      value: isoDay(fromText.date),
      // an ambiguous phrase ("by 2028") is a suggestion to confirm
      status: fromText.ambiguous ? "working" : "extracted",
    }
  } else if (extraction.deadline) {
    deadline = new Date(`${extraction.deadline}T00:00:00.000Z`)
    parts.deadline = { value: extraction.deadline, status: "extracted" }
  }

  const gradeInput = { shape, parts, checkLinkConfirmed: false }
  return {
    shape,
    parts,
    deadline,
    confidence: parseConfidence(text),
    approximate: isApproximate(text),
    grade: gradeClaim(gradeInput),
    publish: canPublish(gradeInput),
    source: extraction.source,
    note: extraction.note,
  }
}
