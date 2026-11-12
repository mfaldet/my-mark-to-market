/**
 * @jest-environment node
 *
 * "Sharpen this hunch", against the database:
 *   RUN_DB_TESTS=1 npx dotenv -- npx jest sharpen.db
 */
jest.mock("node-fetch", () => ({ __esModule: true, default: jest.fn() }))
jest.mock("trpc-transformer", () => ({ __esModule: true, default: {} }))
jest.mock("../extract", () => ({
  __esModule: true,
  extractClaim: jest.fn(),
}))

import prisma from "../../prisma"
import { extractClaim } from "../extract"
import {
  editClaim,
  getClaim,
  logClaim,
  proposeSharpening,
  verifyHistory,
} from "../service"

const db = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip
const ai = extractClaim as jest.MockedFunction<typeof extractClaim>
const manual = {
  source: "manual" as const,
  shape: null,
  parts: {},
  deadline: null,
}

db("sharpening a saved hunch", () => {
  jest.setTimeout(60_000)
  let userId: string
  let hunchId: string
  const words = "the fed is going to cut rates before next summer"

  beforeAll(async () => {
    userId = (
      await prisma.user.create({
        data: { email: `sharpen-${Date.now()}@test.local` },
      })
    ).id
    ai.mockResolvedValue(manual)
    const hunch = await logClaim({
      userId,
      text: words,
      claimDate: "2026-11-01",
      source: "PHONE",
      now: new Date("2026-11-10T18:00:00.000Z"),
    })
    hunchId = hunch.id
    expect(hunch.kind).toBe("hunch")
  })
  afterAll(() => prisma.$disconnect())

  const versions = () =>
    prisma.claimVersion.count({ where: { questionId: hunchId } })
  const items = () => prisma.question.count({ where: { userId } })

  it("proposes a headline and parts from my original words, and saves nothing", async () => {
    ai.mockResolvedValue({
      source: "ai",
      shape: "EVENT_BY_DATE",
      headline: "The Federal Reserve cuts its policy rate by June 30, 2027",
      parts: {
        event: { value: "the fed cuts rates", status: "extracted" },
        howToTell: {
          value: "the Federal Reserve's rate announcements",
          status: "extracted",
        },
      },
      deadline: "2027-06-30",
    })
    const before = { versions: await versions(), items: await items() }
    const { preview, reason } = await proposeSharpening(userId, hunchId)
    expect(reason).toBeNull()
    // it was asked about my words as I said them, dated when I said them
    expect(ai).toHaveBeenLastCalledWith({
      text: words,
      claimDate: new Date("2026-11-01T00:00:00.000Z"),
    })
    expect(preview).toMatchObject({
      saved: false,
      text: words,
      headline: "The Federal Reserve cuts its policy rate by June 30, 2027",
      kind: "prediction",
      shape: "EVENT_BY_DATE",
      claimDate: "2026-11-01",
    })
    // every proposed part is a suggestion, not mine
    expect(
      Object.values(preview!.parts).every((p) => p!.status === "extracted"),
    ).toBe(true)
    expect({ versions: await versions(), items: await items() }).toEqual(before)
    // and the item itself is untouched
    const still = await getClaim(userId, hunchId)
    expect(still.kind).toBe("hunch")
    expect(still.headline).toBeNull()
  })

  it("approving it is one recorded version of the same item, dated when I first said it, and mine", async () => {
    const before = { versions: await versions(), items: await items() }
    // what the card sends on "Approve and save"
    const approved = await editClaim(
      userId,
      hunchId,
      {
        headline: "The Federal Reserve cuts its policy rate by June 30, 2027",
        shape: "EVENT_BY_DATE",
        parts: {
          event: "the fed cuts rates",
          howToTell: "the Federal Reserve's rate announcements",
        },
        deadline: "2027-06-30",
      },
      "WEB",
    )
    expect(approved.id).toBe(hunchId)
    expect(approved.kind).toBe("prediction")
    expect(approved.text).toBe(words)
    expect(approved.claimDate).toBe("2026-11-01")
    expect(approved.entrySource).toBe("PHONE")
    expect(
      Object.values(approved.parts).every((p) => p!.status === "stated"),
    ).toBe(true)
    expect(await versions()).toBe(before.versions + 1)
    expect(await items()).toBe(before.items)
    expect(await verifyHistory(userId, hunchId)).toMatchObject({ ok: true })
  })

  it("says so when the step fails or has nothing to add, instead of an empty proposal", async () => {
    const hunch = await logClaim({
      userId,
      text: "things feel off",
      source: "WEB",
    })
    ai.mockResolvedValue({ ...manual, note: "Could not reach the AI." })
    expect(await proposeSharpening(userId, hunch.id)).toEqual({
      preview: null,
      reason: "failed",
    })
    ai.mockResolvedValue({
      source: "ai",
      shape: "FREE_TEXT",
      parts: {},
      deadline: null,
      headline: null,
    })
    expect(await proposeSharpening(userId, hunch.id)).toEqual({
      preview: null,
      reason: "nothing",
    })
  })

  it("is refused for someone else's item", async () => {
    const other = await prisma.user.create({
      data: { email: `sharpen-other-${Date.now()}@test.local` },
    })
    await expect(proposeSharpening(other.id, hunchId)).rejects.toThrow()
  })
})
