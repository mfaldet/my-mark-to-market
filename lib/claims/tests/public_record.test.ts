/**
 * @jest-environment node
 */
jest.mock("../../prisma", () => ({ __esModule: true, default: {} }))

import { buildPublicRecord, PublicClaimInput } from "../public_record"

const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const now = at("2027-01-01")

function claim(over: Partial<PublicClaimInput> = {}): PublicClaimInput {
  return {
    id: "c1",
    url: "https://x/q/c1",
    text: "Unemployment will hit 6% by 2028",
    claimDate: at("2025-07-14"),
    loggedAt: at("2025-07-14"),
    entrySource: "AGENT",
    deadline: at("2028-12-31"),
    shape: "NUMBER_BY_DATE",
    parts: { value: { value: 6, status: "stated" } },
    approximate: false,
    grade: 4,
    checkLinkUrl: null,
    confidenceWord: null,
    forecasts: [],
    resolved: false,
    resolution: null,
    resolvedAt: null,
    closeCall: false,
    actualResult: null,
    brierScore: null,
    parentId: null,
    versions: 3,
    latestHash: "abc123",
    ...over,
  }
}

const resolved = (
  resolution: "YES" | "NO" | "AMBIGUOUS",
  probability: number | null,
  over: Partial<PublicClaimInput> = {},
) =>
  claim({
    resolved: true,
    resolution,
    resolvedAt: at("2026-06-01"),
    forecasts:
      probability === null
        ? []
        : [{ at: at("2025-07-14"), probability, word: null }],
    brierScore:
      probability === null
        ? null
        : (probability - (resolution === "YES" ? 1 : 0)) ** 2,
    ...over,
  })

describe("buildPublicRecord", () => {
  it("an empty record has nulls, not misleading zeros", () => {
    const record = buildPublicRecord({ name: "Mac" }, [], now)
    expect(record.summary).toMatchObject({
      publicPredictions: 0,
      resolved: 0,
      accuracy: null,
      brierScore: null,
    })
    expect(record.predictions).toEqual([])
    expect(record.app.builtOn).toBe("Fatebook by Sage")
  })

  it("counts right, wrong, can't tell, open and close calls", () => {
    const record = buildPublicRecord(
      { name: "Mac" },
      [
        resolved("YES", 0.7),
        resolved("YES", 0.9),
        resolved("NO", 0.7, { closeCall: true, actualResult: "5.8" }),
        resolved("AMBIGUOUS", 0.5),
        claim(),
      ],
      now,
    )
    expect(record.summary).toMatchObject({
      publicPredictions: 5,
      open: 1,
      resolved: 4,
      right: 2,
      wrong: 1,
      cantTell: 1,
      closeCalls: 1,
      accuracy: 0.667, // ambiguous claims are left out of accuracy
    })
  })

  it("a claim with no confidence counts for accuracy but not calibration or Brier", () => {
    const record = buildPublicRecord(
      { name: null },
      [resolved("YES", null), resolved("NO", 0.7)],
      now,
    )
    expect(record.summary).toMatchObject({
      right: 1,
      wrong: 1,
      accuracy: 0.5,
      scoredWithConfidence: 1,
      brierScore: 0.49,
    })
    expect(record.calibration.reduce((n, b) => n + b.predictions, 0)).toBe(1)
    expect(record.predictions[0].confidence).toBeNull()
  })

  it("puts each claim in the band of its last confidence", () => {
    const record = buildPublicRecord(
      { name: null },
      [
        resolved("YES", 0.7),
        resolved("NO", 0.7),
        resolved("YES", 0.6), // a boundary goes in the higher band
        resolved("NO", 0.05),
        // changed my mind: 0.9 then 0.3, so it counts as "unlikely"
        resolved("NO", 0.3, {
          forecasts: [
            { at: at("2025-07-14"), probability: 0.9, word: "ALMOST_CERTAIN" },
            { at: at("2025-09-01"), probability: 0.3, word: "UNLIKELY" },
          ],
        }),
      ],
      now,
    )
    const band = (label: string) =>
      record.calibration.find((b) => b.band === label)!
    expect(band("likely")).toMatchObject({
      predictions: 3,
      cameTrue: 2,
      rate: 0.667,
    })
    expect(band("unlikely")).toMatchObject({
      predictions: 1,
      cameTrue: 0,
      rate: 0,
    })
    expect(band("almost no chance")).toMatchObject({
      predictions: 1,
      cameTrue: 0,
    })
    expect(band("almost certain")).toMatchObject({ predictions: 0, rate: null })
  })

  it("each claim carries what a reader needs to check it", () => {
    const [c] = buildPublicRecord(
      { name: "Mac" },
      [
        resolved("NO", 0.7, {
          loggedAt: at("2025-08-01"),
          approximate: true,
          closeCall: true,
          actualResult: "5.8",
          checkLinkUrl: "https://fred.stlouisfed.org/series/UNRATE",
          confidenceWord: "LIKELY",
        }),
      ],
      now,
    ).predictions
    expect(c).toMatchObject({
      text: "Unemployment will hit 6% by 2028",
      claimDate: "2025-07-14",
      backDated: true,
      enteredVia: "agent",
      deadline: "2028-12-31",
      outcome: { value: 6 },
      grade: 4,
      status: "wrong",
      closeCall: true,
      actualResult: "5.8",
      checkLink: "https://fred.stlouisfed.org/series/UNRATE",
      confidence: { probability: 0.7, word: "LIKELY" },
      history: { versions: 3, latestHash: "abc123" },
    })
  })

  it("does not carry the notes on why I changed my mind", () => {
    const record = buildPublicRecord(
      { name: "Mac" },
      [resolved("YES", 0.7)],
      now,
    )
    expect(JSON.stringify(record)).not.toMatch(/"note"|comment/)
  })

  it("a headline shows on top, with my raw words and the date I said them underneath", () => {
    const [withHeadline, without] = buildPublicRecord(
      { name: "Mac" },
      [
        claim({
          id: "h1",
          text: "US unemployment (U-3) reaches 6% by the end of 2028",
          isHeadline: true,
          originallySaid: "unemployment's gonna hit 6 by 2028",
        }),
        // no headline: my words are the text, and there is nothing underneath
        claim({ id: "h2", originallySaid: "should never show" }),
      ],
      now,
    ).predictions
    expect(withHeadline).toMatchObject({
      text: "US unemployment (U-3) reaches 6% by the end of 2028",
      isHeadline: true,
      originallySaid: "unemployment's gonna hit 6 by 2028",
      claimDate: "2025-07-14",
    })
    expect(without.isHeadline).toBe(false)
    expect(without.originallySaid).toBeNull()
  })
})
