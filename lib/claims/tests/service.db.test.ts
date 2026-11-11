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
  answerQuestion,
  applyRuleUpdates,
  confirmProposal,
  editClaim,
  getClaim,
  logWithSplit,
  previewClaim,
  previewWithSplit,
  restoreClaim,
  setTimeZone,
  SplitItem,
  writeVersion,
  assertCanResolve,
  ClaimError,
  confirmPart,
  getTimeline,
  listClaims,
  logClaim,
  notifyReadyToResolve,
  resolveClaim,
  setPart,
  setPublic,
  toClaimView,
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
        "Not yet confirmed: what's measured, the deadline, the number, the comparison and the unit.",
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
      reasons: [expect.stringContaining("still a hunch (grade 3)")],
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
    expect(record!.predictions.map((c) => c.id)).toEqual([shown.id])
    expect(record!.summary.publicPredictions).toBe(1)

    const everything = JSON.stringify(record)
    expect(everything).not.toContain(hidden.id)
    expect(everything).not.toContain("PRIVATE")
    expect(everything).not.toContain("WITHDRAWN")
    expect(everything).not.toContain("SECRET-NOTE")

    // the published hash is the real latest hash of the claim's history
    const check = await verifyHistory(owner, shown.id)
    expect(check.ok && check.latestHash).toBe(
      record!.predictions[0].history.latestHash,
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
          // these tests are written in UTC days; time zones have their own tests below
          data: { email: `due-${Date.now()}@test.local`, timeZone: "UTC" },
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

  describe("hunches and predictions", () => {
    const hunch = () =>
      logClaim({
        userId,
        text: "The labor market is weakening",
        claimDate: "2025-07-14",
        source: "WEB",
        extraction: {
          source: "ai",
          shape: "FREE_TEXT",
          parts: {},
          deadline: null,
        },
      })

    it("a loose entry is a hunch; a complete one is a prediction", async () => {
      expect((await hunch()).kind).toBe("hunch")
      expect((await log()).kind).toBe("prediction")
    })

    it("a hunch cannot be resolved or scored, by either route", async () => {
      const claim = await hunch()
      await expect(
        resolveClaim(userId, claim.id, { resolution: "YES" }, "WEB"),
      ).rejects.toMatchObject({
        code: "BLOCKED",
        message: expect.stringContaining("still a hunch"),
      })
      const row = await prisma.question.findUniqueOrThrow({
        where: { id: claim.id },
      })
      expect(row.resolved).toBe(false)
      expect(() => assertCanResolve(row)).toThrow(/still a hunch/)
      expect(
        await prisma.questionScore.count({ where: { questionId: claim.id } }),
      ).toBe(0)
    })

    it("the timeline shows the moment a hunch became a prediction, and when it dropped back", async () => {
      const claim = await hunch()
      // answer the engine: what would I see, and by when
      await answerQuestion(
        userId,
        claim.id,
        { value: "Unemployment above 5%" },
        "WEB",
      )
      const dated = await answerQuestion(
        userId,
        claim.id,
        { accept: true },
        "WEB",
      )
      // an event with a date but no way to tell is still a hunch
      expect(dated.kind).toBe("hunch")
      const sharpened = await answerQuestion(
        userId,
        claim.id,
        { value: "the BLS monthly jobs report" },
        "WEB",
      )
      expect(sharpened.kind).toBe("prediction")

      const became = async () =>
        (await getTimeline(userId, claim.id)).flatMap((e) =>
          e.kind === "became" ? [e.became] : [],
        )
      expect(await became()).toEqual(["prediction"])

      // taking the deadline away drops it back to a hunch
      const dropped = await setPart(userId, claim.id, "deadline", null, "WEB")
      expect(dropped.kind).toBe("hunch")
      expect(await became()).toEqual(["prediction", "hunch"])

      // same item, same history throughout
      expect((await verifyHistory(userId, claim.id)).ok).toBe(true)
    })

    it("a prediction logged complete from the start shows no 'became' entry", async () => {
      const claim = await log()
      await confirmPart(userId, claim.id, "measure", "WEB")
      const timeline = await getTimeline(userId, claim.id)
      expect(timeline.some((e) => e.kind === "became")).toBe(false)
    })

    it("an imported entry is labelled imported and may still be resolved", async () => {
      const row = await prisma.question.create({
        data: {
          id: `cs__${userId}_${Date.now()}`,
          title: "Imported from a spreadsheet",
          resolveBy: new Date("2025-01-01"),
          userId,
        },
        include: { forecasts: true },
      })
      const view = toClaimView(row)
      expect(view).toMatchObject({ imported: true, kind: "hunch" })
      expect(() => assertCanResolve(row)).not.toThrow()
    })
  })

  describe("time zones (from the first real entries, logged at 8:30pm Central on Nov 10)", () => {
    // 8:30pm on Nov 10 in Chicago is 02:30 on Nov 11 in UTC
    const evening = new Date("2026-11-11T02:30:00.000Z")
    let chicago: string
    const noAi: Extraction = {
      source: "ai",
      shape: "FREE_TEXT",
      parts: {},
      deadline: null,
    }

    beforeAll(async () => {
      chicago = (
        await prisma.user.create({
          data: { email: `tz-${Date.now()}@test.local` },
        })
      ).id
    })

    it("a new account is in America/Chicago, and an unknown zone is refused", async () => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: chicago },
      })
      expect(user.timeZone).toBe("America/Chicago")
      await expect(setTimeZone(chicago, "Mars/Olympus")).rejects.toMatchObject({
        code: "BAD_REQUEST",
      })
    })

    it("an entry logged that evening is dated Nov 10, not Nov 11", async () => {
      const claim = await logClaim({
        userId: chicago,
        text: "The board won't fire Jensen Huang at NVIDIA",
        source: "AGENT",
        extraction: noAi,
        now: evening,
      })
      expect(claim.claimDate).toBe("2026-11-10")
      // the default check-back date counts from my date too
      expect(claim.deadline).toBe("2027-12-31")
    })

    it('"this year" said on New Year\'s Eve evening means the year it still is for me', async () => {
      const claim = await logClaim({
        userId: chicago,
        text: "Rates get cut this year",
        source: "AGENT",
        extraction: { ...noAi, shape: "EVENT_BY_DATE" },
        now: new Date("2027-01-01T03:00:00.000Z"), // 9pm on Dec 31, 2026 in Chicago
      })
      expect(claim.claimDate).toBe("2026-12-31")
      expect(claim.deadline).toBe("2026-12-31")
    })

    it("a call can pass its own time zone", async () => {
      const claim = await logClaim({
        userId: chicago,
        text: "Logged while travelling",
        source: "API",
        extraction: noAi,
        timeZone: "Asia/Tokyo",
        now: evening,
      })
      expect(claim.claimDate).toBe("2026-11-11")
      await expect(
        logClaim({
          userId: chicago,
          text: "x",
          source: "API",
          extraction: noAi,
          timeZone: "Not/AZone",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    })

    it("my date can't be in my future, even if it is already that day in UTC", async () => {
      await expect(
        logClaim({
          userId: chicago,
          text: "x",
          claimDate: "2026-11-11",
          source: "API",
          extraction: noAi,
          now: evening,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    })

    it('"due today" and the daily job turn over at my midnight', async () => {
      const dueNov10 = await logClaim({
        userId: chicago,
        text: "Something due on the tenth",
        source: "WEB",
        extraction: {
          source: "ai",
          shape: "EVENT_BY_DATE",
          parts: {
            event: x("it happens"),
            howToTell: x("the announcement"),
          },
          deadline: "2026-11-10",
        },
        now: new Date("2026-11-10T18:00:00.000Z"),
      })
      const due = async (now: Date) =>
        (await listClaims(chicago, { due: "soon_or_overdue", now })).find(
          (c) => c.id === dueNov10.id,
        )?.dueText
      // 8:30pm on the 10th: still due today, though UTC says the 11th
      expect(await due(evening)).toBe("due today")
      expect((await notifyReadyToResolve(evening, chicago)).notified).toEqual(
        [],
      )
      // 12:30am on the 11th in Chicago: now overdue, and announced
      const afterMidnight = new Date("2026-11-11T06:30:00.000Z")
      expect(await due(afterMidnight)).toBe("overdue by 1 day")
      expect(
        (await notifyReadyToResolve(afterMidnight, chicago)).notified,
      ).toEqual([dueNov10.id])
    })
  })

  describe("bringing the first real entries up to date", () => {
    let owner: string
    let claimId: string

    beforeAll(async () => {
      owner = (
        await prisma.user.create({
          data: { email: `fix-${Date.now()}@test.local` },
        })
      ).id
      // Recreate exactly what the old code stored: logged at 8:30pm Central
      // on Nov 10, dated Nov 11, an "if ... then" event graded 4, with
      // version 1 of its history saying the same.
      const row = await prisma.question.create({
        data: {
          title: "The board won't fire Jensen Huang at NVIDIA",
          userId: owner,
          createdAt: new Date("2026-11-11T02:30:00.000Z"),
          claimDate: new Date("2026-11-11T00:00:00.000Z"),
          resolveBy: new Date("2027-12-31T00:00:00.000Z"),
          claimShape: "EVENT_BY_DATE",
          entrySource: "AGENT",
          grade: 4,
          outcomeParts: {
            event: {
              value:
                "If the board doesn't fire Jensen Huang at NVIDIA, then NVIDIA will beat the S&P 500 over 2027. If not, then NVIDIA doesn't outperform the S&P 500 over 2027.",
              status: "stated",
            },
            deadline: { value: "2027-12-31", status: "stated" },
          },
        },
      })
      claimId = row.id
      await prisma.$transaction((tx) => writeVersion(tx, row, owner, "AGENT"))
    })

    it("corrects the date and the grade as one recorded version, by the app", async () => {
      const before = await prisma.claimVersion.count({
        where: { questionId: claimId },
      })
      const { changed } = await applyRuleUpdates(owner, { force: true })
      expect(changed).toEqual([claimId])

      const row = await prisma.question.findUniqueOrThrow({
        where: { id: claimId },
      })
      expect(row.claimDate?.toISOString().slice(0, 10)).toBe("2026-11-10")
      expect(row.grade).toBe(3)
      // my words are untouched
      expect(row.title).toBe("The board won't fire Jensen Huang at NVIDIA")

      const versions = await prisma.claimVersion.findMany({
        where: { questionId: claimId },
        orderBy: { version: "asc" },
      })
      expect(versions).toHaveLength(before + 1)
      const last = versions[versions.length - 1]
      expect(last.source).toBe("SYSTEM")
      expect([...last.changedFields].sort()).toEqual(["claimDate", "grade"])
      expect(await verifyHistory(owner, claimId)).toMatchObject({ ok: true })
    })

    it("says why it is no longer a prediction, and flags the measure my words never named", async () => {
      const claim = await getClaim(owner, claimId)
      expect(claim.kind).toBe("hunch")
      expect(claim.compound).toBe(true)
      expect(claim.gradeReason).toMatch(/if … then/)
      expect(claim.flags).toEqual([expect.stringContaining("mentions S&P 500")])
      expect(claim.nextQuestion?.question).toMatch(/more than one prediction/)
    })

    it("does nothing the second time", async () => {
      expect((await applyRuleUpdates(owner, { force: true })).changed).toEqual(
        [],
      )
    })
  })

  describe("an agent proposing the sharpening in one go", () => {
    const original =
      "The board won't fire Jensen Huang at NVIDIA, and NVIDIA stock price will still out perform Mag 7 average over 2027, but this Jensen scandal will be a huge WMD (weapon of mass distraction) for the new capitol hill."
    const split: SplitItem[] = [
      {
        text: "The board won't fire Jensen Huang at NVIDIA",
        shape: "EVENT_BY_DATE" as const,
        parts: {
          event: "Jensen Huang is still NVIDIA's CEO on Dec 31, 2027",
          howToTell: "NVIDIA's leadership page",
        },
        deadline: "2027-12-31",
      },
      {
        text: "NVIDIA stock price will still out perform Mag 7 average over 2027",
        shape: "A_BEATS_B" as const,
        parts: {
          a: "NVIDIA stock",
          b: "the Mag 7 average",
          metric: "total return over calendar 2027",
        },
        deadline: "2027-12-31",
      },
    ]

    it("keeps my exact words as the hunch, and saves each piece as extracted, linked to it", async () => {
      const { original: parent, pieces } = await logWithSplit({
        userId,
        text: original,
        source: "AGENT",
        split,
      })
      expect(parent.text).toBe(original)
      expect(parent.kind).toBe("hunch")
      expect(parent.children.map((c) => c.id).sort()).toEqual(
        pieces.map((p) => p.id).sort(),
      )
      expect(pieces.map((p) => p.text)).toEqual(split.map((s) => s.text))
      for (const piece of pieces) {
        expect(piece.parent?.id).toBe(parent.id)
        expect(piece.entrySource).toBe("AGENT")
        // complete enough to grade 4, but nothing is mine yet
        expect(piece.grade).toBe(4)
        expect(Object.values(piece.parts).map((p) => p.status)).toEqual(
          Object.values(piece.parts).map(() => "extracted"),
        )
        expect(piece.canPublish).toBe(false)
        expect(piece.flags).toEqual([])
      }
    })

    it("refuses a piece whose text is not my own words, and saves nothing", async () => {
      const count = () => prisma.question.count({ where: { userId } })
      const before = await count()
      await expect(
        logWithSplit({
          userId,
          text: original,
          source: "AGENT",
          split: [
            {
              ...split[0],
              text: "Jensen Huang is still NVIDIA's CEO on Dec 31, 2027.",
            },
          ],
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("excerpt of the user's own words"),
      })
      expect(await count()).toBe(before)
    })

    it("one confirmation applies my corrections, makes every part mine and records my confidence", async () => {
      const { pieces } = await logWithSplit({
        userId,
        text: original,
        source: "AGENT",
        split,
      })
      const confirmed = await confirmProposal(
        userId,
        pieces[1].id,
        {
          edit: { parts: { metric: "price return over calendar 2027" } },
          confidence: { word: "LIKELY" },
        },
        "AGENT",
      )
      expect(confirmed.parts.metric).toEqual({
        value: "price return over calendar 2027",
        status: "stated",
      })
      expect(
        Object.values(confirmed.parts).every((p) => p.status === "stated"),
      ).toBe(true)
      expect(confirmed.confidenceWord).toBe("LIKELY")
      expect(confirmed.kind).toBe("prediction")
      expect(confirmed.text).toBe(split[1].text)
    })

    it("an edit is a recorded version; my text changes only when I correct it", async () => {
      const claim = await logClaim({
        userId,
        text: "Jensen stays",
        source: "AGENT",
        proposal: {
          shape: "EVENT_BY_DATE",
          parts: { event: "Jensen Huang is still NVIDIA's CEO" },
          deadline: "2027-12-31",
        },
      })
      const count = () =>
        prisma.claimVersion.count({ where: { questionId: claim.id } })
      const before = await count()

      const edited = await editClaim(
        userId,
        claim.id,
        {
          parts: { howToTell: "NVIDIA's leadership page" },
          deadline: "2028-06-30",
        },
        "AGENT",
      )
      expect(edited.text).toBe("Jensen stays")
      expect(edited.deadline).toBe("2028-06-30")
      expect(edited.parts.howToTell?.status).toBe("stated")
      expect(await count()).toBe(before + 1)

      const corrected = await editClaim(
        userId,
        claim.id,
        { correctedText: "Jensen stays as CEO" },
        "AGENT",
      )
      expect(corrected.text).toBe("Jensen stays as CEO")
      expect(await count()).toBe(before + 2)
      const timeline = await getTimeline(userId, claim.id)
      expect(
        timeline.some(
          (e) => e.kind === "version" && e.changedFields.includes("text"),
        ),
      ).toBe(true)
      expect(await verifyHistory(userId, claim.id)).toMatchObject({ ok: true })
    })
  })

  describe("preview first: nothing is saved until I approve", () => {
    const original =
      "The board won't fire Jensen Huang at NVIDIA, and NVIDIA stock price will still out perform Mag 7 average over 2027, but this Jensen scandal will be a huge WMD (weapon of mass distraction) for the new capitol hill."
    const split: SplitItem[] = [
      {
        text: "The board won't fire Jensen Huang at NVIDIA",
        shape: "EVENT_BY_DATE",
        parts: {
          event: "Jensen Huang is still NVIDIA's CEO on Dec 31, 2027",
          howToTell: "NVIDIA's leadership page",
        },
        deadline: "2027-12-31",
        confidence: { word: "VERY_LIKELY" },
      },
      {
        text: "NVIDIA stock price will still out perform Mag 7 average over 2027",
        shape: "A_BEATS_B",
        parts: {
          a: "NVIDIA stock",
          b: "the Mag 7 average",
          metric: "price return over calendar 2027",
        },
        deadline: "2027-12-31",
        confidence: { probability: 0.5 },
      },
    ]
    let previewer: string
    const counts = async () => ({
      items: await prisma.question.count({ where: { userId: previewer } }),
      versions: await prisma.claimVersion.count({
        where: { userId: previewer },
      }),
      confidence: await prisma.forecast.count({ where: { userId: previewer } }),
    })
    // 8:30pm Central on Nov 10
    const said = new Date("2026-11-11T02:30:00.000Z")

    beforeAll(async () => {
      previewer = (
        await prisma.user.create({
          data: { email: `preview-${Date.now()}@test.local` },
        })
      ).id
    })

    it("a preview grades it exactly as logging would, and saves nothing at all", async () => {
      const before = await counts()
      const preview = await previewWithSplit({
        userId: previewer,
        text: original,
        source: "AGENT",
        split,
        now: said,
      })
      expect(await counts()).toEqual(before)

      expect(preview.original).toMatchObject({
        saved: false,
        text: original,
        kind: "hunch",
        claimDate: "2026-11-10",
      })
      expect(preview.original).not.toHaveProperty("id")
      expect(preview.pieces.map((p) => p.text)).toEqual(
        split.map((s) => s.text),
      )
      for (const piece of preview.pieces) {
        expect(piece).not.toHaveProperty("id")
        expect(piece.saved).toBe(false)
        expect(piece.kind).toBe("prediction")
        expect(piece.grade).toBe(4)
        expect(piece.claimDate).toBe("2026-11-10")
        // a proposal: nothing here is mine yet
        expect(Object.values(piece.parts).map((p) => p.status)).toEqual(
          Object.values(piece.parts).map(() => "extracted"),
        )
      }
      expect(preview.pieces[0].probability).toBeCloseTo(0.85)
      expect(preview.pieces[0].confidenceWord).toBe("VERY_LIKELY")
      expect(preview.pieces[1].probability).toBe(0.5)
    })

    it("a preview shows a flaw before anything is stored", async () => {
      const before = await counts()
      const preview = await previewClaim({
        userId: previewer,
        text: "NVIDIA stock price will still out perform Mag 7 average over 2027",
        source: "AGENT",
        proposal: {
          shape: "EVENT_BY_DATE",
          parts: {
            event:
              "If the board doesn't fire Jensen Huang, then NVIDIA will beat the S&P 500 over 2027",
          },
          deadline: "2027-12-31",
        },
        now: said,
      })
      expect(preview.kind).toBe("hunch")
      expect(preview.compound).toBe(true)
      expect(preview.flags[0]).toMatch(/S&P 500/)
      expect(await counts()).toEqual(before)
    })

    it("a bad piece is refused in the preview, as it would be when logging", async () => {
      await expect(
        previewWithSplit({
          userId: previewer,
          text: original,
          source: "AGENT",
          split: [{ ...split[0], text: "Jensen keeps his job" }],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    })

    it("approving saves what the preview showed: parts are mine, the date is when I said it", async () => {
      const preview = await previewWithSplit({
        userId: previewer,
        text: original,
        source: "AGENT",
        split,
        now: said,
      })
      // I approve two days later, changing one deadline
      const approvedSplit = [split[0], { ...split[1], deadline: "2028-01-31" }]
      const { original: parent, pieces } = await logWithSplit({
        userId: previewer,
        text: original,
        source: "AGENT",
        split: approvedSplit,
        proposalStatus: "stated",
        claimDate: preview.original.claimDate,
        now: new Date("2026-11-13T15:00:00.000Z"),
      })
      expect(parent.claimDate).toBe("2026-11-10")
      expect(parent.text).toBe(original)
      expect(parent.kind).toBe("hunch")
      expect(pieces).toHaveLength(2)
      for (const piece of pieces) {
        expect(piece.claimDate).toBe("2026-11-10")
        expect(piece.parent?.id).toBe(parent.id)
        expect(
          Object.values(piece.parts).every((p) => p.status === "stated"),
        ).toBe(true)
        expect(piece.kind).toBe("prediction")
        // every part confirmed: only the check link stands between it and public
        expect(piece.grade).toBe(4)
      }
      // my edited deadline is used, though the words say "over 2027"
      expect(pieces[1].deadline).toBe("2028-01-31")
      expect(pieces[0].confidenceWord).toBe("VERY_LIKELY")
      expect(pieces[1].probability).toBe(0.5)
      expect(await counts()).toEqual({ items: 3, versions: 3, confidence: 2 })
    })

    it("without approval a proposal is saved as extracted, as before", async () => {
      const claim = await logClaim({
        userId: previewer,
        text: "Jensen stays",
        source: "PHONE",
        proposal: split[0],
      })
      expect(
        Object.values(claim.parts).every((p) => p.status === "extracted"),
      ).toBe(true)
    })
  })

  describe("withdraw and restore", () => {
    it("withdrawing is a recorded version, and the item says when it was withdrawn", async () => {
      const claim = await log("Withdraw me, then bring me back")
      const versions = () =>
        prisma.claimVersion.count({ where: { questionId: claim.id } })
      const before = await versions()

      const withdrawn = await withdrawClaim(userId, claim.id, "WEB")
      expect(withdrawn.withdrawn).toBe(true)
      expect(withdrawn.withdrawnAt).toEqual(expect.any(String))
      expect(await versions()).toBe(before + 1)
      // hidden from the normal list, still there when I ask for withdrawn ones
      const ids = async (includeWithdrawn: boolean) =>
        (await listClaims(userId, { includeWithdrawn, limit: 200 })).map(
          (c) => c.id,
        )
      expect(await ids(false)).not.toContain(claim.id)
      expect(await ids(true)).toContain(claim.id)
      // and it can still be opened by its owner
      expect((await getClaim(userId, claim.id)).withdrawn).toBe(true)
    })

    it("restoring is a recorded version too, and it comes back private", async () => {
      const claim = await log("Restore me")
      await withdrawClaim(userId, claim.id, "WEB")
      const before = await prisma.claimVersion.count({
        where: { questionId: claim.id },
      })

      const restored = await restoreClaim(userId, claim.id, "WEB")
      expect(restored.withdrawn).toBe(false)
      expect(restored.withdrawnAt).toBeNull()
      expect(restored.sharedPublicly).toBe(false)
      expect(restored.text).toBe("Restore me")

      const versions = await prisma.claimVersion.findMany({
        where: { questionId: claim.id },
        orderBy: { version: "asc" },
      })
      expect(versions).toHaveLength(before + 1)
      expect(versions[versions.length - 1].changedFields).toEqual([
        "withdrawnAt",
      ])
      expect(await verifyHistory(userId, claim.id)).toMatchObject({ ok: true })
      // it can be edited again
      await expect(
        setPart(userId, claim.id, "value", 7, "WEB"),
      ).resolves.toBeTruthy()
    })

    it("only a withdrawn item can be restored, and only by its owner", async () => {
      const claim = await log("Not withdrawn")
      await expect(restoreClaim(userId, claim.id, "WEB")).rejects.toMatchObject(
        { code: "BAD_REQUEST" },
      )
      await withdrawClaim(userId, claim.id, "WEB")
      await expect(
        restoreClaim(otherUserId, claim.id, "WEB"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
    })
  })
})
