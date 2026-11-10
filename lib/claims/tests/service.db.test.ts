/**
 * @jest-environment node
 *
 * Runs the claim service against a real Postgres database. Skipped unless
 * you ask for it, because it needs the local database running:
 *
 *   RUN_DB_TESTS=1 npx dotenv -- npx jest service.db
 *
 * Note: it leaves its test claims behind. History rows cannot be deleted,
 * by design, so neither can a claim that has history.
 */
// Two libraries Fatebook pulls in (for Slack, and for its browser client)
// cannot be loaded by Jest as-is. Nothing tested here uses them, so
// stand-ins are enough.
jest.mock("node-fetch", () => ({ __esModule: true, default: jest.fn() }))
jest.mock("trpc-transformer", () => ({ __esModule: true, default: {} }))

import {
  ClaimError,
  confirmPart,
  getTimeline,
  listClaims,
  logClaim,
  notifyReadyToResolve,
  resolveClaim,
  setPart,
  setPublic,
  updateConfidence,
  verifyHistory,
  withdrawClaim,
} from "../service"
import { Extraction } from "../extract"
import { loadPublicRecord } from "../public_record"
import prisma from "../../prisma"

const db = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip

const x = (value: string | number) => ({ value, status: "extracted" as const })
const unemployment: Extraction = {
  source: "ai",
  shape: "NUMBER_BY_DATE",
  parts: {
    measure: x("unemployment"),
    comparison: x("at_least"),
    value: x(6),
    unit: x("%"),
  },
  deadline: null,
}

db("claim service, against the database", () => {
  jest.setTimeout(60_000)
  let userId: string
  let otherUserId: string

  beforeAll(async () => {
    const stamp = Date.now()
    userId = (
      await prisma.user.create({ data: { email: `owner-${stamp}@test.local` } })
    ).id
    otherUserId = (
      await prisma.user.create({ data: { email: `other-${stamp}@test.local` } })
    ).id
  })
  afterAll(() => prisma.$disconnect())

  const log = (text = "Unemployment will hit about 6% by end of 2028") =>
    logClaim({
      userId,
      text,
      claimDate: "2025-07-14",
      source: "AGENT",
      extraction: unemployment,
    })

  const confirmAll = async (id: string) => {
    for (const part of ["measure", "comparison", "value", "unit", "deadline"]) {
      await confirmPart(userId, id, part, "WEB")
    }
  }

  it("logs a claim private, graded, with version 1 recording how it came in", async () => {
    const claim = await log()
    expect(claim).toMatchObject({
      grade: 4,
      sharedPublicly: false,
      entrySource: "AGENT",
      backDated: true,
      deadline: "2028-12-31",
      approximate: true,
      canPublish: false,
    })
    const timeline = await getTimeline(userId, claim.id)
    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({
      kind: "version",
      version: 1,
      source: "AGENT",
    })
  })

  it("only the owner can read or change a claim", async () => {
    const claim = await log()
    await expect(
      confirmPart(otherUserId, claim.id, "measure", "WEB"),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })

  it("publish gate: blocked until every part is confirmed, then allowed", async () => {
    const claim = await log()
    await expect(
      setPublic(userId, claim.id, true, "WEB"),
    ).rejects.toMatchObject({
      code: "BLOCKED",
      reasons: [
        "Not yet confirmed: measure, deadline, value, comparison, unit.",
      ],
    })
    await confirmAll(claim.id)
    expect(
      (await setPublic(userId, claim.id, true, "WEB")).sharedPublicly,
    ).toBe(true)
  })

  it("an edit that drops a public claim below grade 4 is blocked, and the claim stays public and unchanged", async () => {
    const claim = await log()
    await confirmAll(claim.id)
    await setPublic(userId, claim.id, true, "WEB")

    const attempt = setPart(userId, claim.id, "value", null, "WEB")
    await expect(attempt).rejects.toBeInstanceOf(ClaimError)
    await expect(attempt).rejects.toMatchObject({
      code: "BLOCKED",
      reasons: [expect.stringContaining("Grade 3")],
    })

    const row = await prisma.question.findUniqueOrThrow({
      where: { id: claim.id },
    })
    expect(row.sharedPublicly).toBe(true) // never made private automatically
    expect((row.outcomeParts as any).value).toEqual({
      value: 6,
      status: "stated",
    })

    // I can make it private myself, and then the edit goes through
    await setPublic(userId, claim.id, false, "WEB")
    expect((await setPart(userId, claim.id, "value", null, "WEB")).grade).toBe(
      3,
    )
  })

  it("editing a part of a public claim keeps it public when it still qualifies", async () => {
    const claim = await log()
    await confirmAll(claim.id)
    await setPublic(userId, claim.id, true, "WEB")
    const edited = await setPart(userId, claim.id, "value", 6.5, "WEB")
    expect(edited).toMatchObject({ sharedPublicly: true, grade: 4 })
  })

  it("every change adds one history row and the chain verifies", async () => {
    const claim = await log()
    await confirmPart(userId, claim.id, "measure", "PHONE")
    await updateConfidence(
      userId,
      claim.id,
      { word: "LIKELY", note: "why" },
      "API",
    )
    await confirmPart(userId, claim.id, "measure", "WEB") // no change: no row

    const check = await verifyHistory(userId, claim.id)
    expect(check).toMatchObject({ ok: true, versions: 3 })

    const versions = (await getTimeline(userId, claim.id)).filter(
      (e) => e.kind === "version",
    )
    expect(versions.map((v) => v.kind === "version" && v.source)).toEqual([
      "AGENT",
      "PHONE",
      "API",
    ])
  })

  it("the database refuses to edit or delete a history row, or delete the claim", async () => {
    const claim = await log()
    await expect(
      prisma.claimVersion.updateMany({
        where: { questionId: claim.id },
        data: { hash: "forged" },
      }),
    ).rejects.toThrow(/append-only/)
    await expect(
      prisma.claimVersion.deleteMany({ where: { questionId: claim.id } }),
    ).rejects.toThrow(/append-only/)
    await expect(
      prisma.question.delete({ where: { id: claim.id } }),
    ).rejects.toThrow()
  })

  it("withdrawing hides the claim, keeps it and its history, and makes it private", async () => {
    const claim = await log()
    const withdrawn = await withdrawClaim(userId, claim.id, "WEB")
    expect(withdrawn).toMatchObject({ withdrawn: true, sharedPublicly: false })
    expect((await verifyHistory(userId, claim.id)).versions).toBe(2)
    await expect(
      confirmPart(userId, claim.id, "measure", "WEB"),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("'about 6%' landing at 5.8% resolves NO for the score, marked a close call", async () => {
    const claim = await log()
    const resolved = await resolveClaim(
      userId,
      claim.id,
      { actual: 5.8 },
      "API",
    )
    expect(resolved).toMatchObject({
      resolved: true,
      resolution: "NO",
      closeCall: true,
      actualResult: "5.8",
    })
  })

  it("no confidence given: no forecast row, so it is left out of calibration", async () => {
    const claim = await log("Unemployment will hit 6% by end of 2028")
    expect(claim.probability).toBeNull()
    expect(
      await prisma.forecast.count({ where: { questionId: claim.id } }),
    ).toBe(0)
  })

  it("the public track record shows public claims only: never private or withdrawn ones", async () => {
    const stamp = Date.now()
    const owner = (
      await prisma.user.create({
        data: { email: `public-${stamp}@test.local` },
      })
    ).id
    const make = (text: string) =>
      logClaim({
        userId: owner,
        text,
        claimDate: "2025-07-14",
        source: "WEB",
        extraction: unemployment,
      })
    const publish = async (id: string) => {
      for (const part of [
        "measure",
        "comparison",
        "value",
        "unit",
        "deadline",
      ]) {
        await confirmPart(owner, id, part, "WEB")
      }
      await setPublic(owner, id, true, "WEB")
    }

    const shown = await make("PUBLIC unemployment will hit 6% by end of 2028")
    const hidden = await make("PRIVATE unemployment will hit 6% by end of 2028")
    const gone = await make("WITHDRAWN unemployment will hit 6% by end of 2028")
    await publish(shown.id)
    await publish(gone.id)
    await withdrawClaim(owner, gone.id, "WEB")
    await updateConfidence(
      owner,
      shown.id,
      { word: "LIKELY", note: "SECRET-NOTE" },
      "WEB",
    )

    const record = await loadPublicRecord(owner)
    expect(record!.claims.map((c) => c.id)).toEqual([shown.id])
    expect(record!.summary.publicClaims).toBe(1)

    const everything = JSON.stringify(record)
    expect(everything).not.toContain(hidden.id)
    expect(everything).not.toContain("PRIVATE")
    expect(everything).not.toContain("WITHDRAWN")
    expect(everything).not.toContain("SECRET-NOTE")

    // the published hash is the real latest hash of the claim's history
    const check = await verifyHistory(owner, shown.id)
    expect(check.ok && check.latestHash).toBe(
      record!.claims[0].history.latestHash,
    )
    expect(await loadPublicRecord("no-such-user")).toBeNull()
  })

  describe("what's due, and the daily job", () => {
    const now = new Date("2030-06-15T01:00:00.000Z")
    let owner: string
    const ids: Record<string, string> = {}

    beforeAll(async () => {
      owner = (
        await prisma.user.create({
          data: { email: `due-${Date.now()}@test.local` },
        })
      ).id
      const make = async (key: string, deadline: string) => {
        const claim = await logClaim({
          userId: owner,
          // neutral wording: "today" or "yesterday" in a claim is read as its deadline
          text: `Test claim ${Object.keys(ids).length + 1}`,
          source: "WEB",
          extraction: { ...unemployment, deadline },
        })
        ids[key] = claim.id
      }
      await make("longOverdue", "2030-05-01")
      await make("yesterday", "2030-06-14")
      await make("today", "2030-06-15")
      await make("inFive", "2030-06-20")
      await make("inSeven", "2030-06-22")
      await make("inEight", "2030-06-23")
      await make("overdueResolved", "2030-06-01")
      await make("overdueWithdrawn", "2030-06-02")
      await resolveClaim(
        owner,
        ids.overdueResolved,
        { resolution: "YES" },
        "WEB",
      )
      await withdrawClaim(owner, ids.overdueWithdrawn, "WEB")
    })

    const list = async (
      due: "soon" | "overdue" | "soon_or_overdue",
      withinDays?: number,
    ) => (await listClaims(owner, { due, withinDays, now })).map((c) => c.id)

    it("overdue: deadline passed and not resolved, oldest first", async () => {
      expect(await list("overdue")).toEqual([ids.longOverdue, ids.yesterday])
    })

    it("due soon: today through 7 days ahead, soonest first", async () => {
      expect(await list("soon")).toEqual([ids.today, ids.inFive, ids.inSeven])
      expect(await list("soon", 5)).toEqual([ids.today, ids.inFive])
    })

    it("both together, most pressing first, with a plain 'due' line", async () => {
      const claims = await listClaims(owner, { due: "soon_or_overdue", now })
      expect(claims.map((c) => c.dueText)).toEqual([
        "overdue by 45 days",
        "overdue by 1 day",
        "due today",
        "due in 5 days",
        "due in 7 days",
      ])
      expect(claims.map((c) => c.due)).toEqual([
        "overdue",
        "overdue",
        "due soon",
        "due soon",
        "due soon",
      ])
    })

    it("the daily job adds one bell note per overdue claim and marks it pinged", async () => {
      const mine = () =>
        prisma.notification.findMany({ where: { userId: owner } })

      await notifyReadyToResolve(now, owner)
      const notes = await mine()
      expect(notes.map((n) => n.questionId).sort()).toEqual(
        [ids.longOverdue, ids.yesterday].sort(),
      )
      expect(notes[0]).toMatchObject({
        tags: ["ready_to_resolve"],
        read: false,
        emailSentAt: null,
      })
      expect(notes.map((n) => n.title)).toContain(
        "Ready to resolve: Test claim 2",
      )

      const pinged = await prisma.question.findMany({
        where: { userId: owner, pingedForResolution: true },
      })
      expect(pinged.map((q) => q.id).sort()).toEqual(
        [ids.longOverdue, ids.yesterday].sort(),
      )
    })

    it("running it again announces nothing twice", async () => {
      await notifyReadyToResolve(now, owner)
      await notifyReadyToResolve(now, owner)
      expect(
        await prisma.notification.count({ where: { userId: owner } }),
      ).toBe(2)
    })

    it("the next day it picks up the claim that was due 'today'", async () => {
      await notifyReadyToResolve(new Date("2030-06-16T01:00:00.000Z"), owner)
      const notes = await prisma.notification.findMany({
        where: { userId: owner },
      })
      expect(notes).toHaveLength(3)
      expect(notes.map((n) => n.questionId)).toContain(ids.today)
      // never the resolved or the withdrawn claim
      expect(notes.map((n) => n.questionId)).not.toContain(ids.overdueResolved)
      expect(notes.map((n) => n.questionId)).not.toContain(ids.overdueWithdrawn)
    })
  })
})
