/**
 * The public track record: only claims I have shared publicly.
 *
 * buildPublicRecord is plain code that turns claim rows into the feed.
 * loadPublicRecord fetches the rows, and is the one place that decides
 * what is allowed out: a claim must be public AND not withdrawn. Private
 * claims, withdrawn claims, the notes on why I changed my mind, and
 * unconfirmed check links never leave the app.
 *
 * Used by the JSON feed (pages/api/public/track-record/[userId].ts) and
 * the embeddable page (pages/embed/track-record/[userId].tsx).
 */
import { APP_NAME, UPSTREAM } from "../app_name"
import { getBaseUrl } from "../base_url"
import prisma from "../prisma"
import { CONFIDENCE_RANGES } from "./confidence"

/** One public claim, as plain data. */
export type PublicClaimInput = {
  id: string
  url: string
  text: string
  claimDate: Date
  loggedAt: Date
  entrySource: string | null
  deadline: Date
  shape: string | null
  parts: Record<string, { value: string | number; status: string }>
  approximate: boolean
  grade: number | null
  checkLinkUrl: string | null
  confidenceWord: string | null
  /** my forecasts, oldest first */
  forecasts: { at: Date; probability: number; word: string | null }[]
  resolved: boolean
  resolution: string | null
  resolvedAt: Date | null
  closeCall: boolean
  actualResult: string | null
  brierScore: number | null
  /** only set when the parent is itself public */
  parentId: string | null
  versions: number
  latestHash: string | null
}

const day = (d: Date) => d.toISOString().slice(0, 10)
const round = (n: number, places = 3) =>
  Math.round(n * 10 ** places) / 10 ** places

/** Calibration bands: the same ranges as the confidence words. */
const BANDS = Object.values(CONFIDENCE_RANGES)
  .map((r) => ({ label: r.label, low: r.low, high: r.high }))
  .sort((a, b) => a.low - b.low)

function bandFor(probability: number) {
  const percent = probability * 100
  // a value on a boundary (e.g. 60%) goes in the higher band
  return [...BANDS].reverse().find((b) => percent >= b.low) ?? BANDS[0]
}

export function buildPublicRecord(
  owner: { name: string | null },
  claims: PublicClaimInput[],
  now: Date,
) {
  const resolved = claims.filter((c) => c.resolved)
  const right = resolved.filter((c) => c.resolution === "YES")
  const wrong = resolved.filter((c) => c.resolution === "NO")
  const scored = resolved.filter((c) => c.brierScore !== null)

  // Calibration uses my last stated confidence before the claim resolved.
  // Claims with no confidence given are scored right or wrong only, and
  // are left out here.
  const calibration = BANDS.map((band) => {
    const inBand = [...right, ...wrong].filter((c) => {
      const last = c.forecasts[c.forecasts.length - 1]
      return last !== undefined && bandFor(last.probability) === band
    })
    const cameTrue = inBand.filter((c) => c.resolution === "YES").length
    return {
      band: band.label,
      low: band.low,
      high: band.high,
      claims: inBand.length,
      cameTrue,
      rate: inBand.length ? round(cameTrue / inBand.length) : null,
    }
  })

  return {
    owner: { name: owner.name },
    app: {
      name: APP_NAME,
      url: getBaseUrl(),
      builtOn: `${UPSTREAM.name} by ${UPSTREAM.author}`,
      builtOnUrl: UPSTREAM.url,
    },
    generatedAt: now.toISOString(),
    about:
      "Only claims the owner has chosen to share publicly. A claim can be public only once it is complete and checkable (grade 4 or 5).",
    summary: {
      publicClaims: claims.length,
      open: claims.length - resolved.length,
      resolved: resolved.length,
      right: right.length,
      wrong: wrong.length,
      ambiguous: resolved.filter((c) => c.resolution === "AMBIGUOUS").length,
      closeCalls: resolved.filter((c) => c.closeCall).length,
      /** right / (right + wrong); null until something has resolved */
      accuracy:
        right.length + wrong.length
          ? round(right.length / (right.length + wrong.length))
          : null,
      /** average Brier score (0 is perfect, 0.25 is a coin flip); lower is better */
      brierScore: scored.length
        ? round(
            scored.reduce((sum, c) => sum + c.brierScore!, 0) / scored.length,
          )
        : null,
      scoredWithConfidence: scored.length,
    },
    calibration,
    claims: claims.map((c) => {
      const last = c.forecasts[c.forecasts.length - 1]
      return {
        id: c.id,
        url: c.url,
        text: c.text,
        claimDate: day(c.claimDate),
        loggedAt: c.loggedAt.toISOString(),
        backDated: day(c.claimDate) < day(c.loggedAt),
        enteredVia: c.entrySource?.toLowerCase() ?? null,
        deadline: day(c.deadline),
        shape: c.shape,
        outcome: Object.fromEntries(
          Object.entries(c.parts).map(([name, part]) => [name, part.value]),
        ),
        approximate: c.approximate,
        grade: c.grade,
        checkLink: c.checkLinkUrl,
        confidence: last
          ? { probability: round(last.probability), word: c.confidenceWord }
          : null,
        confidenceHistory: c.forecasts.map((f) => ({
          at: f.at.toISOString(),
          probability: round(f.probability),
          word: f.word,
        })),
        status: !c.resolved
          ? "open"
          : c.resolution === "YES"
            ? "right"
            : c.resolution === "NO"
              ? "wrong"
              : "ambiguous",
        resolvedAt: c.resolvedAt?.toISOString() ?? null,
        closeCall: c.closeCall,
        actualResult: c.actualResult,
        brierScore: c.brierScore === null ? null : round(c.brierScore),
        parentId: c.parentId,
        /**
         * The claim's history: how many versions, and the hash of the
         * latest. Because this hash is published here, outside the
         * database, a later rewrite of the history would not match it.
         */
        history: { versions: c.versions, latestHash: c.latestHash },
      }
    }),
  }
}

export type PublicRecord = ReturnType<typeof buildPublicRecord>

/** Loads a user's public track record, or null if there is no such user. */
export async function loadPublicRecord(
  userId: string,
): Promise<PublicRecord | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null

  const rows = await prisma.question.findMany({
    // the gate: public, and not withdrawn
    where: { userId, sharedPublicly: true, withdrawnAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      forecasts: { where: { userId }, orderBy: { createdAt: "asc" } },
      questionScores: { where: { userId } },
      versions: { orderBy: { version: "desc" }, take: 1 },
      _count: { select: { versions: true } },
    },
  })
  const publicIds = new Set(rows.map((r) => r.id))

  return buildPublicRecord(
    { name: user.name },
    rows.map((r) => ({
      id: r.id,
      url: `${getBaseUrl()}/q/${r.id}`,
      text: r.title,
      claimDate: r.claimDate ?? r.createdAt,
      loggedAt: r.createdAt,
      entrySource: r.entrySource,
      deadline: r.resolveBy,
      shape: r.claimShape,
      parts: (r.outcomeParts ?? {}) as PublicClaimInput["parts"],
      approximate: r.approximate,
      grade: r.grade,
      // a check link only counts once I have opened and confirmed it
      checkLinkUrl: r.checkLinkConfirmedAt ? r.checkLinkUrl : null,
      confidenceWord: r.confidenceWord,
      forecasts: r.forecasts.map((f) => ({
        at: f.createdAt,
        probability: f.forecast.toNumber(),
        word: f.confidenceWord,
      })),
      resolved: r.resolved,
      resolution: r.resolution,
      resolvedAt: r.resolvedAt,
      closeCall: r.closeCall,
      actualResult: r.actualResult,
      brierScore: r.questionScores[0]?.absoluteScore.toNumber() ?? null,
      parentId: r.parentId && publicIds.has(r.parentId) ? r.parentId : null,
      versions: r._count.versions,
      latestHash: r.versions[0]?.hash ?? null,
    })),
    new Date(),
  )
}
