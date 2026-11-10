/**
 * @jest-environment node
 */
import {
  canonicalJson,
  changedFields,
  ClaimState,
  hashVersion,
  nextVersion,
  VersionRecord,
  verifyChain,
} from "../history"

const base: ClaimState = {
  text: "Unemployment will hit 6% by 2028",
  notes: null,
  claimDate: "2025-07-14T00:00:00.000Z",
  deadline: "2028-12-31T00:00:00.000Z",
  shape: "NUMBER_BY_DATE",
  parts: {
    measure: { value: "unemployment", status: "extracted" },
    value: { value: 6, status: "extracted" },
  },
  approximate: false,
  confidenceWord: null,
  grade: 3,
  checkLinkUrl: null,
  checkLinkConfirmedAt: null,
  parentId: null,
  sharedPublicly: false,
  withdrawnAt: null,
  resolution: null,
  closeCall: false,
  actualResult: null,
}

/** Builds a chain by applying one change after another. */
function buildChain(changes: Partial<ClaimState>[]): VersionRecord[] {
  const rows: VersionRecord[] = []
  let state = base
  changes.forEach((change, i) => {
    state = { ...state, ...change }
    const row = nextVersion(rows[rows.length - 1] ?? null, {
      questionId: "claim1",
      userId: "user1",
      source: i === 0 ? "AGENT" : "WEB",
      createdAt: new Date(Date.UTC(2025, 6, 14 + i)),
      state,
    })
    if (row) rows.push(row)
  })
  return rows
}

const chain = () =>
  buildChain([
    {},
    { confidenceWord: "LIKELY" },
    {
      parts: {
        ...base.parts,
        measure: { value: "unemployment", status: "stated" },
      },
    },
    { sharedPublicly: true, grade: 4 },
  ])

/** What a forger would do: recompute a row's own hash after changing it. */
function rehash(row: VersionRecord) {
  const copy: Partial<VersionRecord> = { ...row }
  delete copy.hash
  return hashVersion(copy as Omit<VersionRecord, "hash">)
}

/** A deep copy, as if freshly read back from the database. */
const reload = (rows: VersionRecord[]): VersionRecord[] =>
  JSON.parse(JSON.stringify(rows))

describe("canonicalJson", () => {
  it("gives the same text whatever order the keys are in", () => {
    expect(
      canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }),
    ).toBe(canonicalJson({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }))
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it("keeps array order, because order there means something", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]))
  })
})

describe("building the chain", () => {
  it("numbers versions 1, 2, 3... and links each to the one before", () => {
    const rows = chain()
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4])
    expect(rows[0].prevHash).toBeNull()
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].prevHash).toBe(rows[i - 1].hash)
    }
    expect(new Set(rows.map((r) => r.hash)).size).toBe(4)
    expect(rows[0].hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("records which fields changed", () => {
    const rows = chain()
    expect(rows[1].changedFields).toEqual(["confidenceWord"])
    expect(rows[2].changedFields).toEqual(["parts"])
    expect(rows[3].changedFields.sort()).toEqual(["grade", "sharedPublicly"])
  })

  it("writes nothing when nothing changed", () => {
    const rows = chain()
    expect(
      nextVersion(rows[3], {
        questionId: "claim1",
        userId: "user1",
        source: "WEB",
        createdAt: new Date(),
        state: rows[3].state,
      }),
    ).toBeNull()
  })

  it("the same row always hashes the same", () => {
    const [first] = chain()
    const { hash, ...rest } = first
    expect(hashVersion(rest)).toBe(hash)
    expect(hashVersion(JSON.parse(JSON.stringify(rest)))).toBe(hash)
  })
})

describe("verifyChain", () => {
  it("passes an untouched chain and reports the latest hash", () => {
    const rows = chain()
    expect(verifyChain(reload(rows))).toEqual({
      ok: true,
      versions: 4,
      latestHash: rows[3].hash,
    })
  })

  it("passes an empty history", () => {
    expect(verifyChain([])).toEqual({ ok: true, versions: 0, latestHash: null })
  })

  it("does not care what order the rows arrive in, or the key order inside them", () => {
    const rows = reload(chain()).reverse()
    rows[0].state = Object.fromEntries(
      Object.entries(rows[0].state).reverse(),
    ) as ClaimState
    expect(verifyChain(rows).ok).toBe(true)
  })

  it("catches the claim text being rewritten after the fact", () => {
    const rows = reload(chain())
    rows[1].state.text = "Unemployment will hit 5% by 2028"
    expect(verifyChain(rows)).toMatchObject({
      ok: false,
      brokenAtVersion: 2,
      problem: expect.stringContaining("changed after it was written"),
    })
  })

  it.each([
    [
      "the deadline",
      (r: VersionRecord) => (r.state.deadline = "2030-12-31T00:00:00.000Z"),
    ],
    ["an outcome part", (r: VersionRecord) => (r.state.parts.value.value = 5)],
    [
      "the confidence word",
      (r: VersionRecord) => (r.state.confidenceWord = "ALMOST_CERTAIN"),
    ],
    [
      "the sharing state",
      (r: VersionRecord) => (r.state.sharedPublicly = true),
    ],
    ["the parent link", (r: VersionRecord) => (r.state.parentId = "other")],
    [
      "the date",
      (r: VersionRecord) => (r.createdAt = "2020-01-01T00:00:00.000Z"),
    ],
    ["the entry source", (r: VersionRecord) => (r.source = "WEB")],
  ])("catches a change to %s", (_name, tamper) => {
    const rows = reload(chain())
    tamper(rows[0])
    expect(verifyChain(rows)).toMatchObject({ ok: false, brokenAtVersion: 1 })
  })

  it("catches a rewrite even when that row's own hash is recomputed", () => {
    const rows = reload(chain())
    rows[1].state.confidenceWord = "ALMOST_CERTAIN"
    rows[1].hash = rehash(rows[1])
    // row 2 now looks fine on its own, but row 3 no longer points at it
    expect(verifyChain(rows)).toMatchObject({
      ok: false,
      brokenAtVersion: 3,
      problem: expect.stringContaining("does not point at the version before"),
    })
  })

  it("catches a version being removed", () => {
    const rows = reload(chain())
    rows.splice(1, 1)
    expect(verifyChain(rows)).toMatchObject({
      ok: false,
      brokenAtVersion: 3,
      problem: expect.stringContaining("missing or duplicated"),
    })
  })

  it("catches the first version being removed", () => {
    expect(verifyChain(reload(chain()).slice(1))).toMatchObject({
      ok: false,
      brokenAtVersion: 2,
    })
  })

  it("catches a version being inserted", () => {
    const rows = reload(chain())
    const forged = { ...rows[1], version: 5, prevHash: rows[3].hash }
    rows.push({ ...forged, hash: "0".repeat(64) })
    expect(verifyChain(rows)).toMatchObject({ ok: false, brokenAtVersion: 5 })
    // ...a correctly hashed extra row is a genuine new version, by design
    rows[4].hash = rehash(forged)
    expect(verifyChain(rows).ok).toBe(true)
  })
})

describe("changedFields", () => {
  it("for version 1, lists what the claim started with", () => {
    expect(changedFields(null, base)).toEqual(
      expect.arrayContaining(["text", "deadline", "shape", "parts", "grade"]),
    )
    expect(changedFields(null, base)).not.toContain("confidenceWord")
  })

  it("sees a change inside the outcome parts", () => {
    expect(
      changedFields(base, {
        ...base,
        parts: { ...base.parts, value: { value: 6, status: "stated" } },
      }),
    ).toEqual(["parts"])
  })
})
