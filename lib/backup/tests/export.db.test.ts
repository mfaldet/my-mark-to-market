/**
 * @jest-environment node
 *
 * Needs a database:  RUN_DB_TESTS=1 npx dotenv -- npx jest export.db
 */
jest.mock("node-fetch", () => ({ __esModule: true, default: jest.fn() }))
jest.mock("trpc-transformer", () => ({ __esModule: true, default: {} }))

import {
  editClaim,
  logClaim,
  updateConfidence,
  withdrawClaim,
} from "../../claims/service"
import { verifyChain, VersionRecord } from "../../claims/history"
import prisma from "../../prisma"
import { exportBackup } from "../export"

const db = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip

db("backup export, against the database", () => {
  jest.setTimeout(60_000)
  let userId: string
  let keptId: string
  let withdrawnId: string

  async function everything() {
    const items: any[] = []
    let first: any = null
    let offset: number | null = 0
    while (offset !== null) {
      const page = await exportBackup(offset, 50)
      first ??= page
      items.push(...page.items)
      offset = page.nextOffset
    }
    return { first, items }
  }

  beforeAll(async () => {
    userId = (
      await prisma.user.create({
        data: {
          email: `backup-${Date.now()}@test.local`,
          timeZone: "Europe/London",
          apiKeyHash: `hash-${Date.now()}`,
          apiKeyLastFour: "9999",
        },
      })
    ).id
    const kept = await logClaim({
      userId,
      text: "unemployment's gonna hit 6 by 2028, probably",
      headline: "US unemployment reaches 6% by the end of 2028",
      proposal: {
        shape: "NUMBER_BY_DATE",
        parts: {
          measure: "US unemployment rate",
          comparison: "at_least",
          value: 6,
          unit: "%",
        },
        deadline: "2028-12-31",
      },
      proposalStatus: "stated",
      source: "AGENT",
    })
    keptId = kept.id
    await updateConfidence(userId, keptId, { probability: 0.4 }, "AGENT")
    await editClaim(
      userId,
      keptId,
      { headline: "US unemployment (U-3) reaches 6% by the end of 2028" },
      "WEB",
    )
    const child = await logClaim({
      userId,
      text: "a hunch I later withdrew",
      parentId: keptId,
      source: "WEB",
      extraction: { source: "manual", shape: null, parts: {}, deadline: null },
    })
    withdrawnId = child.id
    await withdrawClaim(userId, withdrawnId, "WEB")
  })
  afterAll(() => prisma.$disconnect())

  it("holds every item, withdrawn ones included, with raw words, headline and parent link", async () => {
    const { items } = await everything()
    // no item twice, across pages
    expect(new Set(items.map((i) => i.question.id)).size).toBe(items.length)
    const kept = items.find((i) => i.question.id === keptId)
    expect(kept.question.title).toBe(
      "unemployment's gonna hit 6 by 2028, probably",
    )
    expect(kept.question.headline).toBe(
      "US unemployment (U-3) reaches 6% by the end of 2028",
    )
    // the whole confidence history: "probably" when logged, then 40%
    expect(kept.forecasts.map((f: any) => f.forecast)).toEqual(["0.7", "0.4"])
    expect(kept.forecasts[0].confidenceWord).toBe("LIKELY")

    const withdrawn = items.find((i) => i.question.id === withdrawnId)
    expect(withdrawn.question.withdrawnAt).toEqual(expect.any(String))
    expect(withdrawn.question.parentId).toBe(keptId)
  })

  it("every exported history verifies with the app's hash-chain check", async () => {
    const { items } = await everything()
    for (const item of items) {
      if (item.versions.length === 0) continue
      const check = verifyChain(item.versions as VersionRecord[])
      expect({ id: item.question.id, ...check }).toMatchObject({ ok: true })
    }
    const kept = items.find((i) => i.question.id === keptId)
    expect(kept.versions.length).toBeGreaterThanOrEqual(2)

    // and the check does notice a change made to an exported copy
    const tampered = JSON.parse(JSON.stringify(kept.versions))
    tampered[0].state.text = "something I never said"
    expect(verifyChain(tampered).ok).toBe(false)
  })

  it("has my account settings, and no keys or sign-in tokens", async () => {
    const { first } = await everything()
    const me = first.users.find((u: any) => u.id === userId)
    expect(me.timeZone).toBe("Europe/London")
    const text = JSON.stringify(first)
    for (const secret of [
      "apiKey",
      "apiKeyHash",
      "apiKeyLastFour",
      "access_token",
      "refresh_token",
      "id_token",
    ]) {
      expect(text).not.toContain(`"${secret}"`)
    }
  })

  it("comes in pages, in a fixed order, and changes nothing", async () => {
    const mine = { where: { questionId: keptId } }
    const before = await prisma.claimVersion.count(mine)
    const a = await exportBackup(0, 1)
    const b = await exportBackup(1, 1)
    expect(a.items).toHaveLength(1)
    expect(a.nextOffset).toBe(1)
    expect(a.users).toBeDefined()
    expect(b.users).toBeUndefined()
    const id = (page: { items: unknown[] }) =>
      (page.items[0] as any).question.id
    expect(id(a)).not.toBe(id(b))
    // oldest first, so the same page gives the same item every time
    expect(id(await exportBackup(0, 1))).toBe(id(a))
    expect(await prisma.claimVersion.count(mine)).toBe(before)
  })
})
