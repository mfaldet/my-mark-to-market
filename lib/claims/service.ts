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
import {
  describeDue,
  dueSoonCutoff,
  dueStatus,
  DueStatus,
  startOfToday,
} from "./due"
import { extractClaim, Extraction } from "./extract"
import { isImported, Kind, kindChanges, kindForGrade } from "./kind"
import { canPublish, gradeClaim } from "./grade"
import {
  ChainCheck,
  ClaimState,
  nextVersion,
  VersionRecord,
  verifyChain,
} from "./history"
import {
  applyAnswer,
  EngineAnswer,
  EngineClaim,
  EngineQuestion,
  nextQuestion,
} from "./next_question"
import {
  dayIn,
  isValidTimeZone,
  localToday,
  timeZoneOrDefault,
} from "./timezone"
import { evaluateNumber } from "./tolerance"
import { Result, resultFor } from "./words"
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
  children?: { id: string; title: string; headline: string | null }[]
  parent?: { id: string; title: string; headline: string | null } | null
  user?: { timeZone: string } | null
}

const CLAIM_INCLUDE = {
  forecasts: { select: { forecast: true, createdAt: true, userId: true } },
  children: {
    where: { withdrawnAt: null },
    select: { id: true, title: true, headline: true },
  },
  parent: { select: { id: true, title: true, headline: true } },
  // "today" is worked out in the owner's time zone
  user: { select: { timeZone: true } },
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
    hasCheckLink: !!row.checkLinkUrl,
  }
}

/** Everything the grading code looks at, for a stored row. */
function gradeInputOf(row: Question) {
  return {
    shape: row.claimShape,
    parts: partsOf(row),
    checkLinkConfirmed: !!row.checkLinkConfirmedAt,
    hasCheckLink: !!row.checkLinkUrl,
  }
}

/** What the UI, API and MCP server are given for one claim. */
export type ClaimView = {
  id: string
  url: string
  /** "hunch" (grades 1-3) or "prediction" (grades 4-5) */
  kind: Kind
  /** true for entries brought in by an importer: not logged here in advance */
  imported: boolean
  /** my raw words, never rewritten: "Originally said" */
  text: string
  /** the approved clean statement shown everywhere, or null if there is none yet */
  headline: string | null
  /** what to show as the item's name: the headline, or my words when there is none */
  shown: string
  claimDate: string
  loggedAt: string
  /** true when I logged it after the day I made it */
  backDated: boolean
  entrySource: EntrySource | null
  /** YYYY-MM-DD */
  deadline: string
  /** for unresolved claims: "overdue", "due soon" (within 7 days), or null */
  due: DueStatus
  /** for unresolved claims: "overdue by 3 days", "due today", "due in 5 days" */
  dueText: string | null
  /** "check back by" when the deadline is missing or only a working default */
  deadlineKind: "deadline" | "check back by"
  shape: ClaimShape | null
  parts: OutcomeParts
  approximate: boolean
  grade: number
  gradeReason: string
  /** true when the outcome holds more than one prediction and should be split */
  compound: boolean
  /**
   * Only on the answer to logging or previewing: why the AI step added
   * nothing, when it was asked to read my words and could not. Not stored.
   */
  aiNote?: string | null
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
  /** when it was withdrawn, or null */
  withdrawnAt: string | null
  resolved: boolean
  resolution: Resolution | null
  /** the same thing in the app's words: "right", "wrong" or "can't tell" */
  result: Result | null
  closeCall: boolean
  actualResult: string | null
  /** the engine's one open question, or null */
  nextQuestion: EngineQuestion | null
  questionsAsked: number
}

export function toClaimView(
  row: ClaimRow,
  now = new Date(),
  /** overrides the owner's saved time zone for this one call */
  timeZone?: string,
): ClaimView {
  const parts = partsOf(row)
  const gradeInput = gradeInputOf(row)
  const grade = gradeClaim(gradeInput)
  const zone = timeZoneOrDefault(timeZone ?? row.user?.timeZone)
  // today's date where I am, so "due today" turns over at my midnight
  const today = localToday(zone, now)

  const publish = canPublish(gradeInput)
  const claimDate = row.claimDate ?? row.createdAt
  const mine = row.forecasts
    .filter((f) => f.userId === row.userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

  return {
    id: row.id,
    url: getQuestionUrl(row, false),
    kind: kindForGrade(grade.grade),
    imported: isImported(row.id),
    text: row.title,
    headline: row.headline ?? null,
    shown: row.headline ?? row.title,
    claimDate: isoDay(claimDate),
    loggedAt: row.createdAt.toISOString(),
    backDated: isoDay(claimDate) < dayIn(zone, row.createdAt),
    entrySource: row.entrySource,
    deadline: isoDay(row.resolveBy),
    due:
      row.resolved || row.withdrawnAt ? null : dueStatus(row.resolveBy, today),
    dueText:
      row.resolved || row.withdrawnAt
        ? null
        : describeDue(row.resolveBy, today),
    deadlineKind:
      parts.deadline && parts.deadline.status !== "working"
        ? "deadline"
        : "check back by",
    shape: row.claimShape,
    parts,
    approximate: row.approximate,
    grade: grade.grade,
    gradeReason: grade.reason,
    compound: grade.compound,
    missing: grade.missing,
    canPublish: publish.ok,
    publishBlockers: publish.ok ? [] : publish.reasons,
    confidenceWord: row.confidenceWord,
    probability: mine ? mine.forecast.toNumber() : null,
    sharedPublicly: row.sharedPublicly,
    checkLinkUrl: row.checkLinkUrl,
    checkLinkConfirmed: !!row.checkLinkConfirmedAt,
    parent: row.parent
      ? { id: row.parent.id, text: row.parent.headline ?? row.parent.title }
      : null,
    children: (row.children ?? []).map((c) => ({
      id: c.id,
      text: c.headline ?? c.title,
    })),
    withdrawn: !!row.withdrawnAt,
    withdrawnAt: isoOrNull(row.withdrawnAt),
    resolved: row.resolved,
    resolution: row.resolution,
    result: resultFor(row.resolution),
    closeCall: row.closeCall,
    actualResult: row.actualResult,
    nextQuestion:
      row.resolved || row.withdrawnAt ? null : nextQuestion(engineClaim(row)),
    questionsAsked: row.engineQuestionsAsked,
  }
}

// --- History -----------------------------------------------------------------

type Db = Prisma.TransactionClient

const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null)

/** The full state of a claim, as stored in each history row. */
export function claimState(row: Question): ClaimState {
  return {
    text: row.title,
    headline: row.headline ?? null,
    notes: row.notes,
    claimDate: isoOrNull(row.claimDate),
    deadline: row.resolveBy.toISOString(),
    shape: row.claimShape,
    parts: partsOf(row) as ClaimState["parts"],
    approximate: row.approximate,
    confidenceWord: row.confidenceWord,
    grade: row.grade,
    checkLinkUrl: row.checkLinkUrl,
    checkLinkConfirmedAt: isoOrNull(row.checkLinkConfirmedAt),
    parentId: row.parentId,
    sharedPublicly: row.sharedPublicly,
    withdrawnAt: isoOrNull(row.withdrawnAt),
    resolution: row.resolution,
    closeCall: row.closeCall,
    actualResult: row.actualResult,
  }
}

function toRecord(v: {
  questionId: string
  version: number
  createdAt: Date
  userId: string
  source: EntrySource
  changedFields: string[]
  state: Prisma.JsonValue
  prevHash: string | null
  hash: string
}): VersionRecord {
  return {
    ...v,
    createdAt: v.createdAt.toISOString(),
    state: v.state as unknown as ClaimState,
  }
}

/**
 * Appends a history row for the claim as it now stands, chained to the row
 * before it. Does nothing if the claim has not changed since the last row.
 * Call it inside the same transaction as the change itself.
 */
export async function writeVersion(
  db: Db,
  row: Question,
  userId: string,
  source: EntrySource,
) {
  const last = await db.claimVersion.findFirst({
    where: { questionId: row.id },
    orderBy: { version: "desc" },
  })
  const next = nextVersion(last ? toRecord(last) : null, {
    questionId: row.id,
    userId,
    source,
    createdAt: new Date(),
    state: claimState(row),
  })
  if (!next) return
  await db.claimVersion.create({
    data: {
      questionId: next.questionId,
      version: next.version,
      createdAt: new Date(next.createdAt),
      userId: next.userId,
      source,
      changedFields: next.changedFields,
      state: next.state as unknown as Prisma.InputJsonValue,
      prevHash: next.prevHash,
      hash: next.hash,
    },
  })
}

/**
 * For changes made by Fatebook's own code paths (editing the title or
 * notes, resolving, undoing a resolution): record the claim as it now is.
 */
export async function recordVersion(
  claimId: string,
  userId: string,
  source: EntrySource,
) {
  await prisma.$transaction(async (tx) => {
    const row = await tx.question.findUnique({ where: { id: claimId } })
    if (row) await writeVersion(tx, row, userId, source)
  })
}

/** "Verify history": recomputes the hash chain from the stored rows. */
export async function verifyHistory(
  userId: string,
  claimId: string,
): Promise<ChainCheck> {
  await loadOwned(userId, claimId)
  const rows = await prisma.claimVersion.findMany({
    where: { questionId: claimId },
  })
  return verifyChain(rows.map(toRecord))
}

export type TimelineEvent =
  | {
      kind: "version"
      at: string
      version: number
      source: EntrySource
      changedFields: string[]
      /** for each changed field: what it was and what it became */
      changes: { field: string; from: unknown; to: unknown }[]
      hash: string
    }
  | {
      kind: "confidence"
      at: string
      probability: number
      word: ConfidenceWord | null
      note: string | null
    }
  | {
      /** the item changed kind: "Became a prediction" / back to a hunch */
      kind: "became"
      at: string
      became: Kind
    }

/** Every version and every confidence change, oldest first. */
export async function getTimeline(
  userId: string,
  claimId: string,
): Promise<TimelineEvent[]> {
  await loadOwned(userId, claimId)
  const [versions, forecasts] = await Promise.all([
    prisma.claimVersion.findMany({
      where: { questionId: claimId },
      orderBy: { version: "asc" },
    }),
    prisma.forecast.findMany({
      where: { questionId: claimId, userId },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const events: TimelineEvent[] = []
  let previous: ClaimState | null = null
  for (const v of versions) {
    const state = v.state as unknown as ClaimState
    const before: Partial<ClaimState> = previous ?? {}
    events.push({
      kind: "version",
      at: v.createdAt.toISOString(),
      version: v.version,
      source: v.source,
      changedFields: v.changedFields,
      changes: v.changedFields.map((field) => ({
        field,
        from: before[field as keyof ClaimState] ?? null,
        to: state[field as keyof ClaimState] ?? null,
      })),
      hash: v.hash,
    })
    previous = state
  }
  // "Became a prediction": read from the grades already in the history
  for (const change of kindChanges(
    versions.map((v) => ({
      grade: (v.state as unknown as ClaimState).grade,
      at: v.createdAt,
    })),
  )) {
    events.push({
      kind: "became",
      at: change.entry.at.toISOString(),
      became: change.became,
    })
  }
  for (const f of forecasts) {
    events.push({
      kind: "confidence",
      at: f.createdAt.toISOString(),
      probability: f.forecast.toNumber(),
      word: f.confidenceWord,
      note: f.comment,
    })
  }
  // same-instant events keep the order they were added in:
  // the version first, then "became a prediction"
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.at.localeCompare(b.event.at) || a.index - b.index)
    .map(({ event }) => event)
}

async function loadOwned(userId: string, claimId: string): Promise<ClaimRow> {
  const row = await prisma.question.findUnique({
    where: { id: claimId },
    include: CLAIM_INCLUDE,
  })
  if (!row) throw new ClaimError("NOT_FOUND", "Not found.")
  if (row.userId !== userId) {
    throw new ClaimError("FORBIDDEN", "Only the owner can do that.")
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
  source: EntrySource,
  change: (
    row: ClaimRow,
  ) =>
    | Prisma.QuestionUncheckedUpdateInput
    | Promise<Prisma.QuestionUncheckedUpdateInput>,
): Promise<ClaimView> {
  const row = await loadOwned(userId, claimId)
  if (row.withdrawnAt) {
    throw new ClaimError("BAD_REQUEST", "This has been withdrawn.")
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

  const hasCheckLink =
    data.checkLinkUrl !== undefined ? !!data.checkLinkUrl : !!row.checkLinkUrl
  const gradeInput = { shape, parts, checkLinkConfirmed, hasCheckLink }
  const publish = canPublish(gradeInput)
  if (willBePublic && !publish.ok) {
    throw new ClaimError(
      "BLOCKED",
      row.sharedPublicly
        ? "This prediction is public, and that change would turn it back into a hunch or leave a part unconfirmed. Fix the points below, or make it private first."
        : "This can't be made public yet.",
      publish.reasons,
    )
  }

  // the change and its history row are saved together, or not at all
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.question.update({
      where: { id: claimId },
      data: { ...data, grade: gradeClaim(gradeInput).grade },
      include: CLAIM_INCLUDE,
    })
    await writeVersion(tx, updated, userId, source)
    return updated
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
  /**
   * A shape and outcome parts proposed by an AI agent in conversation.
   * Saved as "extracted": nothing here counts as mine until I confirm it.
   * When given, the app's own AI step is skipped.
   */
  proposal?: Proposal
  /**
   * "stated" when I have seen the proposal and approved it: every part is
   * saved as mine, and my deadline wins over one read from the text.
   * Default "extracted": not mine until I confirm.
   */
  proposalStatus?: "extracted" | "stated"
  /**
   * A clean, sharp statement of what I said. Saved only because I approved
   * it; my raw words are kept in `text` regardless.
   */
  headline?: string
  /**
   * true for a piece of a split: `text` is then the whole original
   * sentence, shared with its sibling pieces, so nothing (deadline,
   * confidence, "about") is read out of it. The headline is read instead.
   */
  sharedText?: boolean
  /** how sure I said I am; wins over a confidence read out of the text */
  confidence?: ConfidenceUpdate
  /** IANA name, e.g. "America/Chicago". Defaults to the one saved on my account. */
  timeZone?: string
  /** only tests pass this */
  now?: Date
}

/** What an agent may propose for one item. Every part is saved as "extracted". */
export type Proposal = {
  shape: ClaimShape
  /** part name -> value, e.g. { event: "...", howToTell: "..." } */
  parts?: Record<string, string | number>
  /** YYYY-MM-DD */
  deadline?: string
}

function extractionFrom(proposal: Proposal): Extraction {
  const parts: Record<string, OutcomePart> = {}
  for (const [name, value] of Object.entries(proposal.parts ?? {})) {
    if (name === "deadline" || value === "" || value === null) continue
    parts[name] = { value, status: "extracted" }
  }
  const checked = parseOutcomeParts(proposal.shape, parts)
  if (!checked.ok) throw new ClaimError("BAD_REQUEST", checked.error)
  const deadline = proposal.deadline ?? proposal.parts?.deadline
  if (deadline !== undefined && !isIsoDay(String(deadline))) {
    throw new ClaimError("BAD_REQUEST", "The deadline must be YYYY-MM-DD.")
  }
  return {
    source: "ai",
    shape: proposal.shape,
    parts: checked.parts,
    deadline: deadline === undefined ? null : String(deadline),
  }
}

const isIsoDay = (text: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(text) &&
  !isNaN(Date.parse(`${text}T00:00:00.000Z`))

/** The time zone saved on an account. */
export async function timeZoneOf(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timeZone: true },
  })
  return timeZoneOrDefault(user?.timeZone)
}

export async function setTimeZone(userId: string, timeZone: string) {
  if (!isValidTimeZone(timeZone)) {
    throw new ClaimError(
      "BAD_REQUEST",
      'That is not a time zone I know. Use a name like "America/Chicago".',
    )
  }
  await prisma.user.update({ where: { id: userId }, data: { timeZone } })
  return { timeZone }
}

/**
 * Works out everything logClaim would save, without saving it. Both
 * logging and previewing go through here, so a preview shows exactly what
 * logging the same input would store.
 */
async function planClaim(input: LogClaimInput) {
  const text = input.text.trim()
  if (!text) throw new ClaimError("BAD_REQUEST", "There is nothing to log.")

  const now = input.now ?? new Date()
  if (input.timeZone !== undefined && !isValidTimeZone(input.timeZone)) {
    throw new ClaimError(
      "BAD_REQUEST",
      'That is not a time zone I know. Use a name like "America/Chicago".',
    )
  }
  const zone = input.timeZone ?? (await timeZoneOf(input.userId))
  // "today" is today where I am, not in UTC
  const today = dayIn(zone, now)
  const claimDate = input.claimDate ? day(input.claimDate) : day(today)
  if (isNaN(claimDate.getTime())) {
    throw new ClaimError("BAD_REQUEST", "claimDate must be YYYY-MM-DD.")
  }
  if (isoDay(claimDate) > today) {
    throw new ClaimError(
      "BAD_REQUEST",
      "The date you said it can't be in the future.",
    )
  }
  const parent = input.parentId
    ? await loadOwned(input.userId, input.parentId)
    : null

  const approved = input.proposalStatus === "stated"
  const extraction =
    input.extraction ??
    (input.proposal
      ? extractionFrom(input.proposal)
      : await extractClaim({ text, claimDate }))
  // the AI step was asked and came back empty-handed: say why
  const aiNote =
    !input.extraction && !input.proposal && extraction.source === "manual"
      ? extraction.note ?? null
      : null
  const headline = input.headline?.trim() || null
  // what a preview shows: my approved headline, or the one the AI proposes
  const proposedHeadline = headline ?? extraction.headline?.trim() ?? null
  const analysis = analyzeClaim(
    input.sharedText ? proposedHeadline ?? "" : text,
    claimDate,
    extraction,
  )

  let parts: OutcomeParts = analysis.parts
  let deadline = analysis.deadline
  let grade = analysis.grade.grade
  if (approved) {
    // I have seen and approved this: my deadline wins over one read from
    // the text, and every part is mine.
    const proposed = input.proposal?.deadline ?? input.proposal?.parts?.deadline
    if (proposed !== undefined) {
      deadline = day(String(proposed))
      parts = {
        ...parts,
        deadline: { value: String(proposed), status: "stated" },
      }
    }
    parts = Object.fromEntries(
      Object.entries(parts).map(([name, part]) => [
        name,
        { ...part!, status: "stated" as const },
      ]),
    ) as OutcomeParts
    grade = gradeClaim({
      shape: analysis.shape,
      parts,
      checkLinkConfirmed: false,
    }).grade
  }

  // a confidence I gave on its own wins over one read out of the text
  let probability: number | null =
    analysis.confidence.kind === "not_given"
      ? null
      : analysis.confidence.probability
  let confidenceWord: ConfidenceWord | null =
    analysis.confidence.kind === "word" ? analysis.confidence.word : null
  if (input.confidence) {
    const given = input.confidence
    if ((given.word === undefined) === (given.probability === undefined)) {
      throw new ClaimError(
        "BAD_REQUEST",
        "Give either a confidence word or a probability, not both.",
      )
    }
    confidenceWord = given.word ?? null
    probability =
      given.word !== undefined
        ? probabilityForWord(given.word)
        : given.probability!
    if (!(probability >= 0 && probability <= 1)) {
      throw new ClaimError(
        "BAD_REQUEST",
        "Probability must be between 0 and 1.",
      )
    }
  }

  return {
    text,
    now,
    zone,
    claimDate,
    parent,
    extraction,
    aiNote,
    analysis,
    probability,
    confidenceWord,
    proposedHeadline,
    fields: {
      title: text,
      // saved only when it was passed in, which callers do only on approval
      headline,
      userId: input.userId,
      resolveBy: deadline ?? defaultCheckBackBy(claimDate),
      claimDate,
      // null when the AI was not used, so the UI offers the shape picker
      claimShape: extraction.source === "ai" ? analysis.shape : null,
      entrySource: input.source,
      outcomeParts: parts,
      approximate: analysis.approximate,
      confidenceWord,
      grade,
      parentId: input.parentId ?? null,
    },
  }
}

export async function logClaim(input: LogClaimInput): Promise<ClaimView> {
  const plan = await planClaim(input)
  const { fields, probability, confidenceWord } = plan

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.question.create({
      data: {
        ...fields,
        outcomeParts: fields.outcomeParts as Prisma.InputJsonValue,
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
    // version 1 of the history
    await writeVersion(tx, created, input.userId, input.source)
    return created
  })
  return { ...toClaimView(row, plan.now, plan.zone), aiNote: plan.aiNote }
}

/** What a preview returns: the same view logging would, minus an id. Nothing is saved. */
export type ClaimPreview = Omit<ClaimView, "id" | "url"> & { saved: false }

/**
 * Shows how the app would grade and save this, without saving anything.
 * No row, no history, no id.
 */
export async function previewClaim(
  input: LogClaimInput,
): Promise<ClaimPreview> {
  const plan = await planClaim(input)
  const { fields } = plan
  // an unsaved row, shaped like a stored one, so it is graded by the same code
  const row = {
    ...fields,
    // a preview shows the proposed headline; logging saves only an approved one
    headline: plan.proposedHeadline,
    id: "preview",
    createdAt: plan.now,
    notes: null,
    resolved: false,
    resolution: null,
    resolvedAt: null,
    withdrawnAt: null,
    sharedPublicly: false,
    checkLinkUrl: null,
    checkLinkConfirmedAt: null,
    closeCall: false,
    actualResult: null,
    engineQuestionsAsked: 0,
    forecasts:
      plan.probability === null
        ? []
        : [
            {
              forecast: new Prisma.Decimal(plan.probability),
              createdAt: plan.now,
              userId: input.userId,
            },
          ],
    parent: plan.parent
      ? {
          id: plan.parent.id,
          title: plan.parent.title,
          headline: plan.parent.headline,
        }
      : null,
    children: [],
    user: { timeZone: plan.zone },
  } as unknown as ClaimRow
  // eslint-disable-next-line no-unused-vars
  const { id, url, ...view } = toClaimView(row, plan.now, plan.zone)
  return { ...view, aiNote: plan.aiNote, saved: false }
}

/**
 * "Sharpen this hunch": runs the same proposal step a preview uses, on the
 * raw words of an item I already saved. Saves nothing and records nothing.
 * Approving it is an ordinary edit of that same item.
 */
export async function proposeSharpening(
  userId: string,
  claimId: string,
): Promise<{
  preview: ClaimPreview | null
  reason: "failed" | "nothing" | null
}> {
  const row = await loadOwned(userId, claimId)
  if (row.resolved || row.withdrawnAt) {
    throw new ClaimError("BAD_REQUEST", "This can no longer be changed.")
  }
  // the date I first said it: relative dates in my words are read from it
  const claimDate = isoDay(row.claimDate ?? row.createdAt)
  const extraction = await extractClaim({
    text: row.title,
    claimDate: day(claimDate),
  })
  if (extraction.source !== "ai") return { preview: null, reason: "failed" }
  if (!extraction.shape || extraction.shape === "FREE_TEXT") {
    return { preview: null, reason: "nothing" }
  }
  const preview = await previewClaim({
    userId,
    text: row.title,
    claimDate,
    extraction,
    source: row.entrySource ?? "WEB",
  })
  return { preview, reason: null }
}

// --- Reading ---------------------------------------------------------------

export async function getClaim(userId: string, claimId: string) {
  await applyRuleUpdates(userId)
  return toClaimView(await loadOwned(userId, claimId))
}

export type DueFilter = "soon" | "overdue" | "soon_or_overdue"

export async function listClaims(
  userId: string,
  options: {
    status?: "open" | "resolved" | "all"
    /**
     * "What's due?" Only unresolved claims:
     *   soon            - deadline today or within `withinDays`
     *   overdue         - deadline has passed
     *   soon_or_overdue - both
     * The result is then ordered by deadline, most pressing first.
     */
    due?: DueFilter
    /** how far ahead "soon" looks; default 7 days */
    withinDays?: number
    includeWithdrawn?: boolean
    limit?: number
    /** IANA name; defaults to the one saved on my account */
    timeZone?: string
    /** only tests pass this */
    now?: Date
  } = {},
): Promise<ClaimView[]> {
  const now = options.now ?? new Date()
  if (options.timeZone !== undefined && !isValidTimeZone(options.timeZone)) {
    throw new ClaimError(
      "BAD_REQUEST",
      'That is not a time zone I know. Use a name like "America/Chicago".',
    )
  }
  const zone = options.timeZone ?? (await timeZoneOf(userId))
  await applyRuleUpdates(userId)
  // what is due is judged by today's date where I am
  const localNow = localToday(zone, now)
  const today = startOfToday(localNow)
  const cutoff = dueSoonCutoff(localNow, options.withinDays)
  const deadline: Prisma.DateTimeFilter | undefined =
    options.due === "overdue"
      ? { lt: today }
      : options.due === "soon"
        ? { gte: today, lte: cutoff }
        : options.due === "soon_or_overdue"
          ? { lte: cutoff }
          : undefined

  const rows = await prisma.question.findMany({
    where: {
      userId,
      withdrawnAt: options.includeWithdrawn ? undefined : null,
      resolved: options.due
        ? false
        : options.status === "open"
          ? false
          : options.status === "resolved"
            ? true
            : undefined,
      resolveBy: deadline,
    },
    orderBy: options.due ? { resolveBy: "asc" } : { createdAt: "desc" },
    take: Math.min(options.limit ?? 50, 200),
    include: CLAIM_INCLUDE,
  })
  return rows.map((row) => toClaimView(row, now, zone))
}

/**
 * The daily job's one step: for every claim whose deadline has passed and
 * that I have not yet been told about, put a "ready to resolve" note in
 * the web app's notification bell and mark the claim as pinged, so it is
 * only announced once. No email, no Slack.
 */
export async function notifyReadyToResolve(
  now = new Date(),
  /** only tests pass this, to stay inside their own test user */
  onlyUserId?: string,
) {
  // Fetch a day wide, then keep only what has passed in each owner's own
  // time zone: 7pm in Chicago is already tomorrow in UTC.
  const candidates = await prisma.question.findMany({
    where: {
      userId: onlyUserId,
      resolveBy: { lt: new Date(startOfToday(now).getTime() + 86_400_000) },
      resolved: false,
      pingedForResolution: false,
      withdrawnAt: null,
    },
    orderBy: { resolveBy: "asc" },
    include: { user: { select: { timeZone: true } } },
  })
  const due = candidates.filter(
    (claim) =>
      claim.resolveBy <
      startOfToday(localToday(timeZoneOrDefault(claim.user?.timeZone), now)),
  )

  const notified: string[] = []
  for (const claim of due) {
    // the note and the "pinged" mark are saved together, or not at all
    await prisma.$transaction([
      prisma.notification.create({
        data: {
          title:
            kindForGrade(claim.grade) === "prediction" || isImported(claim.id)
              ? `Ready to resolve: ${claim.headline ?? claim.title}`
              : `Time to check back: ${claim.headline ?? claim.title}`,
          content:
            kindForGrade(claim.grade) === "prediction" || isImported(claim.id)
              ? `This prediction came due on ${isoDay(claim.resolveBy)}. How did it turn out?`
              : `This hunch's check-back date was ${isoDay(claim.resolveBy)}. Sharpen it into a prediction, move the date, or withdraw it.`,
          url: getQuestionUrl(claim),
          tags: ["ready_to_resolve"],
          userId: claim.userId,
          questionId: claim.id,
        },
      }),
      prisma.question.update({
        where: { id: claim.id },
        data: { pingedForResolution: true },
      }),
    ])
    notified.push(claim.id)
  }
  return { notified }
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
      throw new ClaimError(
        "BAD_REQUEST",
        `There is no "${part}" to confirm yet.`,
      )
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
    throw new ClaimError(
      "BAD_REQUEST",
      "That is not one of the confidence words.",
    )
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
      throw new ClaimError("BAD_REQUEST", "This is already resolved.")
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
      throw new ClaimError("BAD_REQUEST", "It can't grow out of itself.")
    }
    // walk up from the proposed parent: this claim must not already be above it
    let cursor: string | null = parentId
    for (let depth = 0; cursor && depth < 100; depth++) {
      const ancestor: ClaimRow = await loadOwned(userId, cursor)
      if (ancestor.id === claimId) {
        throw new ClaimError(
          "BAD_REQUEST",
          "That one grew out of this one, so this can't also have grown out of it.",
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

/**
 * Brings a withdrawn item back, as a recorded version. It comes back
 * private: sharing is switched off when something is withdrawn, and
 * restoring never makes anything public by itself.
 */
export async function restoreClaim(
  userId: string,
  claimId: string,
  source: EntrySource,
) {
  const row = await loadOwned(userId, claimId)
  if (!row.withdrawnAt) {
    throw new ClaimError("BAD_REQUEST", "This has not been withdrawn.")
  }
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.question.update({
      where: { id: claimId },
      data: { withdrawnAt: null },
      include: CLAIM_INCLUDE,
    })
    await writeVersion(tx, updated, userId, source)
    return updated
  })
  return toClaimView(saved)
}

// --- Resolving ---------------------------------------------------------------

/**
 * Only predictions can be resolved and scored. A hunch has nothing agreed
 * to check it against: sharpen it into a prediction, move its "check back
 * by" date, or withdraw it. Imported entries are exempt - they arrive
 * without an outcome and may still need their result recorded.
 */
export function assertCanResolve(row: Question) {
  if (isImported(row.id)) return
  const grade = gradeClaim(gradeInputOf(row))
  if (kindForGrade(grade.grade) === "hunch") {
    throw new ClaimError(
      "BLOCKED",
      "This is still a hunch, so it can't be marked right or wrong. Sharpen it into a prediction, move its check-back date, or withdraw it.",
      [grade.reason],
    )
  }
}

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
  source: EntrySource,
): Promise<ClaimView> {
  const row = await loadOwned(userId, claimId)
  if (row.withdrawnAt) {
    throw new ClaimError("BAD_REQUEST", "This has been withdrawn.")
  }
  if (row.resolved) {
    throw new ClaimError("BAD_REQUEST", "This is already resolved.")
  }
  assertCanResolve(row)

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
      "Say how it turned out (right, wrong or can't tell), or give the actual number.",
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
  await recordVersion(claimId, userId, source)

  return getClaim(userId, claimId)
}

// --- A whole proposal at once (for an agent sharpening in conversation) ----

export type SplitItem = Proposal & {
  /** the clean, sharp statement of this one prediction */
  headline: string
  /**
   * Optional: the part of my words this piece comes from. When left out,
   * the piece keeps my whole original sentence as its "originally said".
   */
  text?: string
  /** how sure I said I am of this piece */
  confidence?: ConfidenceUpdate
}

type SplitInput = LogClaimInput & { split: SplitItem[] }

function checkSplit(input: SplitInput) {
  for (const item of input.split) {
    if (!item.headline?.trim()) {
      throw new ClaimError(
        "BAD_REQUEST",
        "Each piece needs a headline: one clear sentence saying what is predicted.",
      )
    }
    extractionFrom(item) // check every piece before saving anything
  }
}

/** The original stays as the hunch I said; its pieces carry the predictions. */
function originalOf(input: SplitInput): LogClaimInput {
  // eslint-disable-next-line no-unused-vars
  const { split, ...rest } = input
  return {
    ...rest,
    // no confidence on the original: each piece has its own
    confidence: undefined,
    extraction:
      rest.extraction ??
      (rest.proposal
        ? undefined
        : { source: "manual", shape: null, parts: {}, deadline: null }),
  }
}

const pieceOf = (
  input: SplitInput,
  item: SplitItem,
  claimDate: string,
  parentId?: string,
): LogClaimInput => ({
  userId: input.userId,
  // my raw words stay underneath every piece
  text: item.text?.trim() || input.text.trim(),
  headline: item.headline,
  sharedText: !item.text?.trim(),
  claimDate,
  source: input.source,
  parentId,
  proposal: { shape: item.shape, parts: item.parts, deadline: item.deadline },
  proposalStatus: input.proposalStatus,
  confidence: item.confidence,
  timeZone: input.timeZone,
  now: input.now,
})

/**
 * Logs a hunch in my exact words and, when it is really several
 * predictions, one child for each piece, linked back to it. Each child's
 * text must be an excerpt of my own words: the sharpened wording goes in
 * the outcome parts.
 */
export async function logWithSplit(
  input: SplitInput,
): Promise<{ original: ClaimView; pieces: ClaimView[] }> {
  checkSplit(input)
  const original = await logClaim(originalOf(input))
  const pieces: ClaimView[] = []
  for (const item of input.split) {
    pieces.push(
      await logClaim(pieceOf(input, item, original.claimDate, original.id)),
    )
  }
  return { original: await getClaim(input.userId, original.id), pieces }
}

/** The same, saving nothing: how the original and each piece would be graded and stored. */
export async function previewWithSplit(
  input: SplitInput,
): Promise<{ original: ClaimPreview; pieces: ClaimPreview[] }> {
  checkSplit(input)
  const original = await previewClaim(originalOf(input))
  const pieces: ClaimPreview[] = []
  for (const item of input.split) {
    pieces.push(await previewClaim(pieceOf(input, item, original.claimDate)))
  }
  return { original, pieces }
}

export type ClaimEdit = {
  shape?: ClaimShape
  /** part name -> my value, or null to remove it */
  parts?: Record<string, string | number | null>
  /** the deadline, or for a hunch the check-back date: YYYY-MM-DD */
  deadline?: string
  /** only when I explicitly correct what I said; otherwise my words stay as they are */
  correctedText?: string
  /** set or replace the headline I approved; null removes it */
  headline?: string | null
  /**
   * Set, replace or (null) remove the check link in the same save. A link
   * that changed has not been opened and confirmed yet.
   */
  checkLinkUrl?: string | null
}

function applyEdit(row: ClaimRow, edit: ClaimEdit) {
  const shape = edit.shape ?? row.claimShape ?? "FREE_TEXT"
  const allowed = allowedParts(shape)
  const parts: Record<string, OutcomePart> = Object.fromEntries(
    Object.entries(partsOf(row)).filter(([name]) => allowed.includes(name)),
  ) as Record<string, OutcomePart>
  for (const [name, value] of Object.entries(edit.parts ?? {})) {
    if (name === "deadline") continue
    if (value === null || value === "") delete parts[name]
    else parts[name] = { value, status: "stated" }
  }
  const deadline = edit.deadline ?? edit.parts?.deadline
  if (deadline !== undefined && deadline !== null) {
    if (!isIsoDay(String(deadline))) {
      throw new ClaimError("BAD_REQUEST", "The date must be YYYY-MM-DD.")
    }
    parts.deadline = { value: String(deadline), status: "stated" }
  }
  const checked = parseOutcomeParts(shape, parts)
  if (!checked.ok) throw new ClaimError("BAD_REQUEST", checked.error)
  const link =
    edit.checkLinkUrl === undefined
      ? undefined
      : edit.checkLinkUrl?.trim() || null
  if (link && !/^https?:\/\/\S+$/i.test(link)) {
    throw new ClaimError("BAD_REQUEST", "The check link must be a web address.")
  }
  const linkChanged = link !== undefined && link !== (row.checkLinkUrl ?? null)
  const text = edit.correctedText?.trim()
  if (edit.correctedText !== undefined && !text) {
    throw new ClaimError("BAD_REQUEST", "The corrected text is empty.")
  }
  return {
    data: {
      claimShape: edit.shape ?? row.claimShape,
      outcomeParts: checked.parts as Prisma.InputJsonValue,
      resolveBy:
        deadline !== undefined && deadline !== null
          ? day(String(deadline))
          : undefined,
      title: text || undefined,
      headline:
        edit.headline === undefined ? undefined : edit.headline?.trim() || null,
      ...(linkChanged
        ? { checkLinkUrl: link, checkLinkConfirmedAt: null }
        : {}),
    } satisfies Prisma.QuestionUncheckedUpdateInput,
    parts: checked.parts as Record<string, OutcomePart>,
  }
}

/** Change the shape, outcome parts, date or (explicitly) the text: one recorded version. */
export async function editClaim(
  userId: string,
  claimId: string,
  edit: ClaimEdit,
  source: EntrySource,
) {
  return await updateClaim(userId, claimId, source, (row) => {
    if (row.resolved) {
      throw new ClaimError("BAD_REQUEST", "This is already resolved.")
    }
    return applyEdit(row, edit).data
  })
}

/**
 * "Yes, that's right" to a whole proposal: apply any edits I made, then
 * mark every remaining extracted or working part as stated, in one recorded
 * version. A confidence given here is mine, so it is recorded too.
 */
export async function confirmProposal(
  userId: string,
  claimId: string,
  input: { edit?: ClaimEdit; confidence?: ConfidenceUpdate },
  source: EntrySource,
) {
  let view = await updateClaim(userId, claimId, source, (row) => {
    if (row.resolved) {
      throw new ClaimError("BAD_REQUEST", "This is already resolved.")
    }
    const { data, parts } = applyEdit(row, input.edit ?? {})
    const confirmed = Object.fromEntries(
      Object.entries(parts).map(([name, part]) => [
        name,
        { ...part, status: "stated" as const },
      ]),
    )
    return { ...data, outcomeParts: confirmed as Prisma.InputJsonValue }
  })
  if (input.confidence) {
    view = await updateConfidence(userId, claimId, input.confidence, source)
  }
  return view
}

// --- Corrections the app makes itself ---------------------------------------

/** Bump when the grading rules change, so every account is re-graded once. */
const RULES_VERSION = 2
const rulesApplied = new Map<string, number>()

/**
 * Brings stored entries in line with the current rules. Each change is a
 * recorded version marked "by the app", never a silent edit.
 *
 *  1. Dates stamped a day ahead. Before time zones, "today" was UTC, so an
 *     entry logged in the evening in Chicago got tomorrow's date. A claim
 *     date later than the day it was logged (in my zone) can only be that
 *     bug, since a date in the future is never accepted; it is set back to
 *     the day it was logged.
 *  2. Grades. The stored grade is recomputed under today's rules.
 *
 * Open entries only. Sharing is never changed here.
 */
export async function applyRuleUpdates(
  userId: string,
  { force = false } = {},
): Promise<{ changed: string[] }> {
  if (!force && rulesApplied.get(userId) === RULES_VERSION) {
    return { changed: [] }
  }
  const zone = await timeZoneOf(userId)
  const rows = await prisma.question.findMany({
    where: {
      userId,
      resolved: false,
      withdrawnAt: null,
      grade: { not: null },
    },
  })
  const changed: string[] = []
  for (const row of rows) {
    const data: Prisma.QuestionUncheckedUpdateInput = {}
    if (row.claimDate) {
      const logged = dayIn(zone, row.createdAt)
      if (isoDay(row.claimDate) > logged) {
        data.claimDate = day(logged)
        // a check-back date that was only the default moves with it
        if (
          !partsOf(row).deadline &&
          row.resolveBy.getTime() ===
            defaultCheckBackBy(row.claimDate).getTime()
        ) {
          data.resolveBy = defaultCheckBackBy(day(logged))
        }
      }
    }
    const grade = gradeClaim(gradeInputOf(row)).grade
    if (grade !== row.grade) data.grade = grade
    if (Object.keys(data).length === 0) continue

    await prisma.$transaction(async (tx) => {
      const updated = await tx.question.update({ where: { id: row.id }, data })
      await writeVersion(tx, updated, userId, "SYSTEM")
    })
    changed.push(row.id)
  }
  rulesApplied.set(userId, RULES_VERSION)
  return { changed }
}

/** The daily job runs this for every account. */
export async function applyRuleUpdatesForEveryone() {
  const owners = await prisma.question.findMany({
    where: { grade: { not: null }, resolved: false, withdrawnAt: null },
    select: { userId: true },
    distinct: ["userId"],
  })
  let changed = 0
  for (const { userId } of owners) {
    changed += (await applyRuleUpdates(userId, { force: true })).changed.length
  }
  return { changed }
}
