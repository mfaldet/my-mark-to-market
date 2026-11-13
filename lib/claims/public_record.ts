/**
 * The public track record: only claims I have shared publicly.
 *
 * buildPublicRecord is plain code that turns claim rows into the feed.
 * loadPublicRecord fetches the rows, and is the one place that decides
 * what is allowed out: a prediction must be published AND not withdrawn.
 * With it go the name of its story and the notes I have made public.
 * Private predictions, withdrawn ones, private notes, every note on an
 * unpublished prediction, a story holding only private predictions, and
 * unconfirmed check links never leave the app.
 *
 * Used by the JSON feed (pages/api/public/track-record/[userId].ts) and
 * the embeddable page (pages/embed/track-record/[userId].tsx).
 */
import { APP_NAME, UPSTREAM } from "../app_name"
import { getBaseUrl } from "../base_url"
import prisma from "../prisma"
import { CONFIDENCE_RANGES } from "./confidence"
import { isImported } from "./kind"
import { standardBrier } from "./words"

/** One public claim, as plain data. */
export type PublicClaimInput = {
  id: string
  url: string
  text: string
  /** true when text is an approved headline, not the raw words */
  isHeadline?: boolean
  /** my raw words, when a headline is shown in their place */
  originallySaid?: string | null
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
  forecasts: {
    /** only needed to tie a public note to the change it explains */
    id?: number
    at: Date
    probability: number
    word: string | null
  }[]
  /** the story it belongs to, by name */
  story?: string | null
  /** ONLY the notes I have made public. Private notes are never passed in. */
  publicNotes?: {
    at: Date
    text: string
    link: string | null
    forecastId: number | null
  }[]
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
      predictions: inBand.length,
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
      "Only predictions the owner has published, each with the story it belongs to and the notes the owner has chosen to make public. A prediction can be published only once it is checkable (grade 4 or 5). Private notes, and every note on an unpublished prediction, are never included.",
    summary: {
      publicPredictions: claims.length,
      open: claims.length - resolved.length,
      resolved: resolved.length,
      right: right.length,
      wrong: wrong.length,
      cantTell: resolved.filter((c) => c.resolution === "AMBIGUOUS").length,
      closeCalls: resolved.filter((c) => c.closeCall).length,
      /** right / (right + wrong); null until something has resolved */
      accuracy:
        right.length + wrong.length
          ? round(right.length / (right.length + wrong.length))
          : null,
      /** average Brier score: 0 is perfect, 0.25 is a coin flip; lower is better */
      brierScore: scored.length
        ? round(
            scored.reduce((sum, c) => sum + c.brierScore!, 0) / scored.length,
          )
        : null,
      scoredWithConfidence: scored.length,
    },
    calibration,
    /** The stories that hold at least one published prediction, by name. */
    stories: Array.from(
      claims.reduce(
        (count, c) =>
          c.story ? count.set(c.story, (count.get(c.story) ?? 0) + 1) : count,
        new Map<string, number>(),
      ),
    )
      .map(([name, predictions]) => ({ name, predictions }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    predictions: claims.map((c) => {
      const last = c.forecasts[c.forecasts.length - 1]
      return {
        id: c.id,
        url: c.url,
        // brought in by an importer, so not logged here in advance
        imported: isImported(c.id),
        text: c.text,
        // the larger story this belongs to, or null
        story: c.story ?? null,
        // a headline is a cleaned statement, so it is not shown in quote marks
        isHeadline: !!c.isHeadline,
        // my raw words sit under the headline, so anyone can compare the two
        originallySaid: c.isHeadline ? c.originallySaid ?? null : null,
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
        /**
         * The notes I chose to make public, newest first. A note written
         * with a change in how sure I was carries that change.
         */
        notes: [...(c.publicNotes ?? [])]
          .sort((a, b) => b.at.getTime() - a.at.getTime())
          .map((n) => {
            const i =
              n.forecastId === null
                ? -1
                : c.forecasts.findIndex((f) => f.id === n.forecastId)
            return {
              at: n.at.toISOString(),
              text: n.text,
              link: n.link,
              confidenceChange:
                i < 0
                  ? null
                  : {
                      from:
                        i > 0 ? round(c.forecasts[i - 1].probability) : null,
                      to: round(c.forecasts[i].probability),
                    },
            }
          }),
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
              : "can't tell",
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
      story: { select: { name: true } },
      // the gate for notes: only the ones I made public are even read
      comments: {
        where: { isPublic: true, userId },
        select: {
          createdAt: true,
          comment: true,
          sourceUrl: true,
          forecastId: true,
        },
      },
      _count: { select: { versions: true } },
    },
  })
  const publicIds = new Set(rows.map((r) => r.id))

  return buildPublicRecord(
    { name: user.name },
    rows.map((r) => ({
      id: r.id,
      url: `${getBaseUrl()}/q/${r.id}`,
      // the approved headline is what shows; my raw words go underneath
      text: r.headline ?? r.title,
      isHeadline: r.headline != null,
      originallySaid: r.headline != null ? r.title : null,
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
      story: r.story?.name ?? null,
      publicNotes: r.comments.map((n) => ({
        at: n.createdAt,
        text: n.comment,
        link: n.sourceUrl,
        forecastId: n.forecastId,
      })),
      forecasts: r.forecasts.map((f) => ({
        id: f.id,
        at: f.createdAt,
        probability: f.forecast.toNumber(),
        word: f.confidenceWord,
      })),
      resolved: r.resolved,
      resolution: r.resolution,
      resolvedAt: r.resolvedAt,
      closeCall: r.closeCall,
      actualResult: r.actualResult,
      // Fatebook stores twice the standard Brier score; show the standard one
      brierScore:
        r.questionScores[0] !== undefined
          ? standardBrier(r.questionScores[0].absoluteScore.toNumber())
          : null,
      parentId: r.parentId && publicIds.has(r.parentId) ? r.parentId : null,
      versions: r._count.versions,
      latestHash: r.versions[0]?.hash ?? null,
    })),
    new Date(),
  )
}
