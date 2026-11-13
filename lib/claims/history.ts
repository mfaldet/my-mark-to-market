/**
 * The append-only history of a claim, and the hash chain that makes
 * after-the-fact edits detectable. Plain code: no database in this file.
 *
 * Every change to a claim writes a new ClaimVersion row holding the full
 * state of the claim. Each row stores:
 *   prevHash - the hash of the row before it (null for version 1)
 *   hash     - SHA-256 of this row's contents, which include prevHash
 *
 * So each row vouches for the one before it. Change, remove or reorder any
 * row and every hash after it stops matching; verifyChain finds the first
 * row where that happens.
 *
 * What this does and does not give you: it DETECTS tampering, it cannot
 * PREVENT it. Someone with full access to the database could rewrite a row
 * and recompute every later hash. Publishing the latest hash somewhere
 * outside the database (it is included in the public feed) is what makes
 * such a rewrite visible.
 */
import { createHash } from "crypto"

/** The full state of a claim at one moment. Dates are ISO strings. */
export type ClaimState = {
  /** my raw words */
  text: string
  /**
   * The approved clean statement, or null. Added later than the other
   * fields, so older rows do not have it at all; a missing value is read
   * as null.
   */
  headline?: string | null
  notes: string | null
  claimDate: string | null
  deadline: string
  shape: string | null
  parts: Record<string, { value: string | number; status: string }>
  approximate: boolean
  confidenceWord: string | null
  grade: number | null
  checkLinkUrl: string | null
  checkLinkConfirmedAt: string | null
  parentId: string | null
  sharedPublicly: boolean
  withdrawnAt: string | null
  resolution: string | null
  closeCall: boolean
  actualResult: string | null
  /**
   * The story it belongs to, by name, or null. Added later than the fields
   * above, like the two below: a missing value is read as null.
   */
  story?: string | null
  /**
   * The notes that are public at this moment, with their text, so the
   * history shows when a note was made public or private again and locks
   * what it said. Null when none is public. Private notes are not here.
   */
  publicNotes?: { id: number; text: string; link: string | null }[] | null
}

/** One row of history, as stored. */
export type VersionRecord = {
  questionId: string
  version: number
  createdAt: string
  userId: string
  source: string
  changedFields: string[]
  state: ClaimState
  prevHash: string | null
  hash: string
}

/**
 * JSON with object keys in alphabetical order at every level, so the same
 * data always gives the same text - and so the same hash - whatever order
 * the database hands the keys back in.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`
}

/** The hash of one row: everything in it except the hash itself. */
export function hashVersion(row: Omit<VersionRecord, "hash">): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        questionId: row.questionId,
        version: row.version,
        createdAt: row.createdAt,
        userId: row.userId,
        source: row.source,
        changedFields: row.changedFields,
        state: row.state,
        prevHash: row.prevHash,
      }),
      "utf8",
    )
    .digest("hex")
}

/** Names of the fields that differ between two states (all of them for version 1). */
export function changedFields(
  previous: ClaimState | null,
  next: ClaimState,
): string[] {
  const keys = Object.keys(next) as (keyof ClaimState)[]
  if (!previous)
    return keys.filter((k) => next[k] !== null && next[k] !== false)
  // a field an older row never had counts as null, not as a change
  return keys.filter(
    (k) =>
      canonicalJson(previous[k] ?? null) !== canonicalJson(next[k] ?? null),
  )
}

/** Builds the next row of a chain. Returns null if nothing changed. */
export function nextVersion(
  previous: VersionRecord | null,
  input: {
    questionId: string
    userId: string
    source: string
    createdAt: Date
    state: ClaimState
  },
): VersionRecord | null {
  const changed = changedFields(previous?.state ?? null, input.state)
  if (previous && changed.length === 0) return null

  const row = {
    questionId: input.questionId,
    version: (previous?.version ?? 0) + 1,
    createdAt: input.createdAt.toISOString(),
    userId: input.userId,
    source: input.source,
    changedFields: changed,
    state: input.state,
    prevHash: previous?.hash ?? null,
  }
  return { ...row, hash: hashVersion(row) }
}

export type ChainCheck =
  | { ok: true; versions: number; latestHash: string | null }
  | { ok: false; versions: number; brokenAtVersion: number; problem: string }

/**
 * Recomputes the whole chain. `rows` can be in any order; they are sorted
 * by version number first.
 */
export function verifyChain(rows: VersionRecord[]): ChainCheck {
  const sorted = [...rows].sort((a, b) => a.version - b.version)
  let previous: VersionRecord | null = null

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    const fail = (problem: string): ChainCheck => ({
      ok: false,
      versions: sorted.length,
      brokenAtVersion: row.version,
      problem,
    })

    if (row.version !== i + 1) {
      return fail(
        `Expected version ${i + 1} here but found version ${row.version}: a version is missing or duplicated.`,
      )
    }
    if (row.prevHash !== (previous?.hash ?? null)) {
      return fail(
        "This version does not point at the version before it: something earlier was changed or removed.",
      )
    }
    if (hashVersion(row) !== row.hash) {
      return fail(
        "This version's contents do not match its hash: it was changed after it was written.",
      )
    }
    previous = row
  }

  return {
    ok: true,
    versions: sorted.length,
    latestHash: previous?.hash ?? null,
  }
}
