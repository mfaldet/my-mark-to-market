/**
 * Everything that reads or changes a claim in the database goes through
 * this file. The web UI, the API and the MCP server all call these
 * functions, so the rules are enforced in one place:
 *
 *   - only the owner can see or change a claim
 *   - the grade is recalculated on every save (plain code, grade.ts)
 *   - a claim can only be public at grade 4+ with every part confirmed;
 *     a save that would break that on a public claim is BLOCKED with the
 *     reason, never fixed by quietly making the claim private
 *   - claims are withdrawn, not deleted
 *
 * Server-side only.
 */
import {
  ClaimShape,
  ConfidenceWord,
  EntrySource,
  Prisma,
  Question,
  Resolution,
} from "@prisma/client"
import { handleQuestionResolution } from "../interactive_handlers/resolve"
import prisma from "../prisma"
import { getQuestionUrl } from "../web/question_url"
import { analyzeClaim } from "./analyze"
import { CONFIDENCE_RANGES, probabilityForWord } from "./confidence"
import { extractClaim, Extraction } from "./extract"
import { canPublish, gradeClaim } from "./grade"
import {
  applyAnswer,
  EngineAnswer,
  EngineClaim,
  EngineQuestion,
  nextQuestion,
} from "./next_question"
import { evaluateNumber } from "./tolerance"
import {
  allowedParts,
  Comparison,
  OutcomePart,
  OutcomeParts,
  parseOutcomeParts,
  PartName,
} from "./types"

export class ClaimError extends Error {
  constructor(
    public code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST" | "BLOCKED",
    message: string,
    /** for BLOCKED: each reason, in plain words */
    public reasons: string[] = [],
  ) {
    super(message)
    this.name = "ClaimError"
  }
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const isoDay = (date: Date) => date.toISOString().slice(0, 10)

/** Fatebook needs a date on every question. With no deadline yet, check back at the end of next year. */
export function defaultCheckBackBy(claimDate: Date) {
  return new Date(Date.UTC(claimDate.getUTCFullYear() + 1, 11, 31))
}

type ClaimRow = Question & {
  forecasts: { forecast: Prisma.Decimal; createdAt: Date; userId: string }[]
  children?: { id: string; title: string }[]
  parent?: { id: string; title: string } | null
}

const CLAIM_INCLUDE = {
  forecasts: { select: { forecast: true, createdAt: true, userId: true } },
  children: {
    where: { withdrawnAt: null },
    select: { id: true, title: true },
  },
  parent: { select: { id: true, title: true } },
} satisfies Prisma.QuestionInclude

function partsOf(row: Question): OutcomeParts {
  return (row.outcomeParts as OutcomeParts | null) ?? {}
}

function engineClaim(row: Question): EngineClaim {
  return {
    text: row.title,
    claimDate: row.claimDate ?? row.createdAt,
    shape: row.claimShape,
    parts: partsOf(row),
    questionsAsked: row.engineQuestionsAsked,
  }
}

/** What the UI, API and MCP server are given for one claim. */
export type ClaimView = {
  id: string
  url: string
  /** my words, never rewritten */
  text: string
  claimDate: string
  loggedAt: string
  /** true when I logged it after the day I made it */
  backDated: boolean
  entrySource: EntrySource | null
  /** YYYY-MM-DD */
  deadline: string
  /** "check back by" when the deadline is missing or only a working default */
  deadlineKind: "deadline" | "check back by"
  shape: ClaimShape | null
  parts: OutcomeParts
  approximate: boolean
  grade: number
  gradeReason: string
  missing: PartName[]
  canPublish: boolean
  publishBlockers: string[]
  confidenceWord: ConfidenceWord | null
  /** latest forecast, 0-1, or null when no confidence was given */
  probability: number | null
  sharedPublicly: boolean
  checkLinkUrl: string | null
  checkLinkConfirmed: boolean
  parent: { id: string; text: string } | null
  children: { id: string; text: string }[]
  withdrawn: boolean
  resolved: boolean
  resolution: Resolution | null
  closeCall: boolean
  actualResult: string | null
  /** the engine's one open question, or null */
  nextQuestion: EngineQuestion | null
  questionsAsked: number
}

export function toClaimView(row: ClaimRow): ClaimView {
  const parts = partsOf(row)
  const gradeInput = {
    shape: row.claimShape,
    parts,
    checkLinkConfirmed: !!row.checkLinkConfirmedAt,
  }
  const grade = gradeClaim(gradeInput)
  const publish = canPublish(gradeInput)
  const claimDate = row.claimDate ?? row.createdAt
  const mine = row.forecasts
    .filter((f) => f.userId === row.userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

  return {
    id: row.id,
    url: getQuestionUrl(row, false),
    text: row.title,
    claimDate: isoDay(claimDate),
    loggedAt: row.createdAt.toISOString(),
    backDated: isoDay(claimDate) < isoDay(row.createdAt),
    entrySource: row.entrySource,
    deadline: isoDay(row.resolveBy),
    deadlineKind:
      parts.deadline && parts.deadline.status !== "working"
        ? "deadline"
        : "check back by",
    shape: row.claimShape,
    parts,
    approximate: row.approximate,
    grade: grade.grade,
    gradeReason: grade.reason,
    missing: grade.missing,
    canPublish: publish.ok,
    publishBlockers: publish.ok ? [] : publish.reasons,
    confidenceWord: row.confidenceWord,
    probability: mine ? mine.forecast.toNumber() : null,
    sharedPublicly: row.sharedPublicly,
    checkLinkUrl: row.checkLinkUrl,
    checkLinkConfirmed: !!row.checkLinkConfirmedAt,
    parent: row.parent ? { id: row.parent.id, text: row.parent.title } : null,
    children: (row.children ?? []).map((c) => ({ id: c.id, text: c.title })),
    withdrawn: !!row.withdrawnAt,
    resolved: row.resolved,
    resolution: row.resolution,
    closeCall: row.closeCall,
    actualResult: row.actualResult,
    nextQuestion:
      row.resolved || row.withdrawnAt ? null : nextQuestion(engineClaim(row)),
    questionsAsked: row.engineQuestionsAsked,
  }
}

async function loadOwned(userId: string, claimId: string): Promise<ClaimRow> {
  const row = await prisma.question.findUnique({
    where: { id: claimId },
    include: CLAIM_INCLUDE,
  })
  if (!row) throw new ClaimError("NOT_FOUND", "Claim not found.")
  if (row.userId !== userId) {
    throw new ClaimError("FORBIDDEN", "Only the claim's owner can do that.")
  }
  return row
}

/**
 * The single place a claim is changed. `change` returns the fields to
 * update; this function regrades, applies the publish gate, and saves.
 */
async function updateClaim(
  userId: string,
  claimId: string,
  _source: EntrySource,
  change: (
    row: ClaimRow,
  ) =>
    | Prisma.QuestionUncheckedUpdateInput
    | Promise<Prisma.QuestionUncheckedUpdateInput>,
): Promise<ClaimView> {
  const row = await loadOwned(userId, claimId)
  if (row.withdrawnAt) {
    throw new ClaimError("BAD_REQUEST", "This claim has been withdrawn.")
  }
  const data = await change(row)

  // What the claim will look like after this save
  const shape =
    data.claimShape !== undefined
      ? (data.claimShape as ClaimShape | null)
      : row.claimShape
  const parts =
    data.outcomeParts !== undefined
      ? (data.outcomeParts as OutcomeParts)
      : partsOf(row)
  const checkLinkConfirmed =
    data.checkLinkConfirmedAt !== undefined
      ? !!data.checkLinkConfirmedAt
      : !!row.checkLinkConfirmedAt
  const willBePublic =
    data.sharedPublicly !== undefined
      ? !!data.sharedPublicly
      : row.sharedPublicly

  const gradeInput = { shape, parts, checkLinkConfirmed }
  const publish = canPublish(gradeInput)
  if (willBePublic && !publish.ok) {
    throw new ClaimError(
      "BLOCKED",
      row.sharedPublicly
        ? "This claim is public, and that change would leave it below the bar for public claims. Fix the points below, or make the claim private first."
        : "This claim can't be made public yet.",
      publish.reasons,
    )
  }

  const saved = await prisma.question.update({
    where: { id: claimId },
    data: { ...data, grade: gradeClaim(gradeInput).grade },
    include: CLAIM_INCLUDE,
  })
  return toClaimView(saved)
}

// --- Logging ---------------------------------------------------------------

export type LogClaimInput = {
  userId: string
  /** my words, saved exactly as given */
  text: string
  /** YYYY-MM-DD; defaults to today. Earlier = back-dated. */
  claimDate?: string
  source: EntrySource
  parentId?: string
  /** only tests pass this, to avoid calling the AI */
  extraction?: Extraction
}

export async function logClaim(input: LogClaimInput): Promise<ClaimView> {
  const text = input.text.trim()
  if (!text) throw new ClaimError("BAD_REQUEST", "The claim is empty.")

  const now = new Date()
  const claimDate = input.claimDate ? day(input.claimDate) : day(isoDay(now))
  if (isNaN(claimDate.getTime())) {
    throw new ClaimError("BAD_REQUEST", "claimDate must be YYYY-MM-DD.")
  }
  if (isoDay(claimDate) > isoDay(now)) {
    throw new ClaimError(
      "BAD_REQUEST",
      "The claim date can't be in the future.",
    )
  }
  if (input.parentId) await loadOwned(input.userId, input.parentId)

  const extraction =
    input.extraction ?? (await extractClaim({ text, claimDate }))
  const analysis = analyzeClaim(text, claimDate, extraction)

  const confidence = analysis.confidence
  const probability =
    confidence.kind === "not_given" ? null : confidence.probability
  const confidenceWord = confidence.kind === "word" ? confidence.word : null

  const row = await prisma.question.create({
    data: {
      title: text,
      userId: input.userId,
      resolveBy: analysis.deadline ?? defaultCheckBackBy(claimDate),
      claimDate,
      // null when the AI was not used, so the UI offers the shape picker
      claimShape: extraction.source === "ai" ? analysis.shape : null,
      entrySource: input.source,
      outcomeParts: analysis.parts as Prisma.InputJsonValue,
      approximate: analysis.approximate,
      confidenceWord,
      grade: analysis.grade.grade,
      parentId: input.parentId,
      // no confidence given -> no forecast row: scored right or wrong only
      forecasts:
        probability === null
          ? undefined
          : {
              create: {
                userId: input.userId,
                forecast: probability,
                confidenceWord,
              },
            },
    },
    include: CLAIM_INCLUDE,
  })
  return toClaimView(row)
}

// --- Reading ---------------------------------------------------------------

export async function getClaim(userId: string, claimId: string) {
  return toClaimView(await loadOwned(userId, claimId))
}

export async function listClaims(
  userId: string,
  options: {
    status?: "open" | "resolved" | "all"
    includeWithdrawn?: boolean
    limit?: number
  } = {},
): Promise<ClaimView[]> {
  const rows = await prisma.question.findMany({
    where: {
      userId,
      withdrawnAt: options.includeWithdrawn ? undefined : null,
      resolved:
        options.status === "open"
          ? false
          : options.status === "resolved"
            ? true
            : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 50, 200),
    include: CLAIM_INCLUDE,
  })
  return rows.map(toClaimView)
}

// --- The engine's question -------------------------------------------------

export async function answerQuestion(
  userId: string,
  claimId: string,
  answer: EngineAnswer,
  source: EntrySource,
) {
  return await updateClaim(userId, claimId, source, (row) => {
    const result = applyAnswer(engineClaim(row), answer)
    if (!result.ok) throw new ClaimError("BAD_REQUEST", result.error)
    const { claim } = result
    const deadline = claim.parts.deadline
    return {
      claimShape: claim.shape,
      outcomeParts: claim.parts as Prisma.InputJsonValue,
      engineQuestionsAsked: claim.questionsAsked,
      // the deadline's value lives in resolveBy
      resolveBy: deadline ? day(String(deadline.value)) : undefined,
    }
  })
}

// --- Editing the outcome ---------------------------------------------------

/** Pick or change the shape by hand. Parts the new shape has no use for are dropped. */
export async function setShape(
  userId: string,
  claimId: string,
  shape: ClaimShape,
  source: EntrySource,
) {
  return await updateClaim(userId, claimId, source, (row) => {
    const allowed = allowedParts(shape)
    const kept = Object.fromEntries(
      Object.entries(partsOf(row)).filter(([name]) => allowed.includes(name)),
    )
    return { claimShape: shape, outcomeParts: kept as Prisma.InputJsonValue }
  })
}

/** Set a part to my own value ("stated"), or remove it with value null. */
export async function setPart(
  userId: string,
  claimId: string,
  part: string,
  value: string | number | null,
  source: EntrySource,
) {
  return await updateClaim(userId, claimId, source, (row) => {
    const shape = row.claimShape ?? "FREE_TEXT"
    const parts: Record<string, OutcomePart> = { ...partsOf(row) }
    if (value === null || value === "") {
      delete parts[part]
    } else {
      parts[part] = { value, status: "stated" }
    }
    const checked = parseOutcomeParts(shape, parts)
    if (!checked.ok) throw new ClaimError("BAD_REQUEST", checked.error)
    if (part === "deadline" && value !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        throw new ClaimError("BAD_REQUEST", "The deadline must be YYYY-MM-DD.")
      }
      return {
        outcomeParts: checked.parts as Prisma.InputJsonValue,
        resolveBy: day(String(value)),
      }
    }
    return { outcomeParts: checked.parts as Prisma.InputJsonValue }
  })
}

/** Confirm an extracted or working part as it stands: it becomes "stated". */
export async function confirmPart(
  userId: string,
  claimId: string,
  part: string,
  source: EntrySource,
) {
  return await updateClaim(userId, claimId, source, (row) => {
    const parts: Record<string, OutcomePart> = { ...partsOf(row) }
    if (!parts[part]) {
      throw new ClaimError("BAD_REQUEST", `This claim has no "${part}" yet.`)
    }
    parts[part] = { ...parts[part], status: "stated" }
    return { outcomeParts: parts as Prisma.InputJsonValue }
  })
}

// --- Confidence ------------------------------------------------------------

export type ConfidenceUpdate = {
  /** a word from the fixed list... */
  word?: ConfidenceWord
  /** ...or a number from 0 to 1 */
  probability?: number
  /** why I changed my mind */
  note?: string
}

export async function updateConfidence(
  userId: string,
  claimId: string,
  update: ConfidenceUpdate,
  source: EntrySource,
) {
  if ((update.word === undefined) === (update.probability === undefined)) {
    throw new ClaimError(
      "BAD_REQUEST",
      "Give either a confidence word or a probability, not both.",
    )
  }
  if (update.word !== undefined && !(update.word in CONFIDENCE_RANGES)) {
    throw new ClaimError("BAD_REQUEST", "Unknown confidence word.")
  }
  const probability =
    update.word !== undefined
      ? probabilityForWord(update.word)
      : update.probability!
  if (!(probability >= 0 && probability <= 1)) {
    throw new ClaimError("BAD_REQUEST", "Probability must be between 0 and 1.")
  }

  const view = await updateClaim(userId, claimId, source, (row) => {
    if (row.resolved) {
      throw new ClaimError("BAD_REQUEST", "This claim is already resolved.")
    }
    return {
      confidenceWord: update.word ?? null,
      forecasts: {
        create: {
          userId,
          forecast: probability,
          confidenceWord: update.word ?? null,
          comment: update.note?.trim() || null,
        },
      },
    }
  })
  return view
}

// --- Check link, parent, sharing, withdrawing -------------------------------

export async function setCheckLink(
  userId: string,
  claimId: string,
  url: string | null,
  source: EntrySource,
) {
  if (url !== null && !/^https?:\/\/\S+$/i.test(url.trim())) {
    throw new ClaimError("BAD_REQUEST", "The check link must be a web address.")
  }
  // a new link has not been opened and confirmed yet
  return await updateClaim(userId, claimId, source, () => ({
    checkLinkUrl: url?.trim() ?? null,
    checkLinkConfirmedAt: null,
  }))
}

/** "I opened the link and it shows the thing being measured." */
export async function confirmCheckLink(
  userId: string,
  claimId: string,
  source: EntrySource,
) {
  return await updateClaim(userId, claimId, source, (row) => {
    if (!row.checkLinkUrl) {
      throw new ClaimError("BAD_REQUEST", "Add a check link first.")
    }
    return { checkLinkConfirmedAt: new Date() }
  })
}

export async function linkParent(
  userId: string,
  claimId: string,
  parentId: string | null,
  source: EntrySource,
) {
  if (parentId) {
    if (parentId === claimId) {
      throw new ClaimError("BAD_REQUEST", "A claim can't be its own parent.")
    }
    // walk up from the proposed parent: this claim must not already be above it
    let cursor: string | null = parentId
    for (let depth = 0; cursor && depth < 100; depth++) {
      const ancestor: ClaimRow = await loadOwned(userId, cursor)
      if (ancestor.id === claimId) {
        throw new ClaimError(
          "BAD_REQUEST",
          "That claim grew out of this one, so it can't also be its parent.",
        )
      }
      cursor = ancestor.parentId
    }
  }
  return await updateClaim(userId, claimId, source, () => ({ parentId }))
}

export async function setPublic(
  userId: string,
  claimId: string,
  sharedPublicly: boolean,
  source: EntrySource,
) {
  // updateClaim applies the publish gate
  return await updateClaim(userId, claimId, source, () => ({ sharedPublicly }))
}

/** Replaces delete: the claim is hidden everywhere but kept, with its history. */
export async function withdrawClaim(
  userId: string,
  claimId: string,
  source: EntrySource,
) {
  return await updateClaim(userId, claimId, source, () => ({
    withdrawnAt: new Date(),
    sharedPublicly: false,
  }))
}

// --- Resolving ---------------------------------------------------------------

export type ResolveInput = {
  /** YES, NO or AMBIGUOUS. Optional when `actual` settles a number claim. */
  resolution?: Resolution
  /** what actually happened: a number for number claims, or my own words */
  actual?: number | string
}

/**
 * Resolves a claim. The score is strict YES/NO. For a number claim with a
 * numeric actual result, the code works out YES or NO itself, and marks a
 * near miss on an "about" claim as a close call.
 */
export async function resolveClaim(
  userId: string,
  claimId: string,
  input: ResolveInput,
  // eslint-disable-next-line no-unused-vars -- written to the history table by the version-history change
  _source: EntrySource,
): Promise<ClaimView> {
  const row = await loadOwned(userId, claimId)
  if (row.withdrawnAt) {
    throw new ClaimError("BAD_REQUEST", "This claim has been withdrawn.")
  }
  if (row.resolved) {
    throw new ClaimError("BAD_REQUEST", "This claim is already resolved.")
  }

  const parts = partsOf(row)
  let resolution = input.resolution
  let closeCall = false

  const actualNumber =
    typeof input.actual === "number"
      ? input.actual
      : typeof input.actual === "string" &&
          /^-?[\d,]*\.?\d+$/.test(input.actual.trim())
        ? parseFloat(input.actual.replace(/,/g, ""))
        : null

  const numberClaim =
    row.claimShape === "NUMBER_BY_DATE" &&
    parts.comparison &&
    typeof parts.value?.value === "number"

  if (numberClaim && actualNumber !== null) {
    const outcome = evaluateNumber(
      {
        comparison: parts.comparison!.value as Comparison,
        value: parts.value!.value as number,
        valueHigh:
          typeof parts.valueHigh?.value === "number"
            ? parts.valueHigh.value
            : undefined,
        unit: String(parts.unit?.value ?? ""),
        approximate: row.approximate,
      },
      actualNumber,
    )
    // an explicit resolution wins; otherwise the number decides
    resolution = resolution ?? (outcome.met ? "YES" : "NO")
    closeCall = resolution === "NO" && outcome.closeCall
  }

  if (!resolution) {
    throw new ClaimError(
      "BAD_REQUEST",
      "Say how it resolved (YES, NO or AMBIGUOUS), or give the actual number for a number claim.",
    )
  }

  await prisma.question.update({
    where: { id: claimId },
    data: {
      closeCall,
      actualResult:
        input.actual === undefined ? null : String(input.actual).trim(),
    },
  })
  // Fatebook's own resolution: sets resolved, scores the forecasts
  await handleQuestionResolution(claimId, resolution, row.type)

  return getClaim(userId, claimId)
}
