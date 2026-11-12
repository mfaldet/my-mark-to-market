/**
 * @jest-environment node
 */
import Anthropic from "@anthropic-ai/sdk"
import {
  ClaimAiClient,
  DEFAULT_CLAIM_AI_MODEL,
  EXTRACTION_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  extractClaim,
  toExtraction,
} from "../extract"
import { analyzeClaim } from "../analyze"

const claimDate = new Date("2025-07-14T00:00:00.000Z")

const EMPTY = {
  shape: "FREE_TEXT",
  measure: null,
  comparison: null,
  value: null,
  valueHigh: null,
  unit: null,
  baseline: null,
  headline: null,
  event: null,
  howToTell: null,
  a: null,
  b: null,
  metric: null,
  subject: null,
  rankOrAward: null,
  deadline: null,
}

/** A stand-in for the Anthropic client that returns a canned answer. */
function fakeClient(answer: unknown, stopReason = "end_turn") {
  const create = jest.fn().mockResolvedValue({
    stop_reason: stopReason,
    content: [
      { type: "thinking", thinking: "" },
      { type: "text", text: JSON.stringify(answer) },
    ],
  })
  return {
    client: { messages: { create } } as unknown as ClaimAiClient,
    create,
  }
}

function failingClient(error: unknown) {
  const create = jest.fn().mockRejectedValue(error)
  return { messages: { create } } as unknown as ClaimAiClient
}

describe("extractClaim", () => {
  const savedEnv = { ...process.env }
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.CLAIM_AI_MODEL
  })
  afterAll(() => {
    process.env = savedEnv
  })

  it("with no API key, returns a manual result and the app carries on", async () => {
    const result = await extractClaim({ text: "Rates get cut", claimDate })
    expect(result).toEqual({
      source: "manual",
      shape: null,
      parts: {},
      deadline: null,
      note: "No ANTHROPIC_API_KEY set: fill the fields by hand.",
    })
  })

  it("sends my text unchanged, with the claim date, to a small model", async () => {
    const { client, create } = fakeClient(EMPTY)
    await extractClaim(
      { text: "Unemployment will hit 6% by 2028", claimDate },
      { client },
    )

    expect(create).toHaveBeenCalledTimes(1)
    const request = create.mock.calls[0][0]
    expect(request.model).toBe(DEFAULT_CLAIM_AI_MODEL)
    expect(request.model).toBe("claude-haiku-5-5")
    expect(request.messages).toEqual([
      {
        role: "user",
        content:
          "Claim date: 2025-07-14\n\nClaim:\nUnemployment will hit 6% by 2028",
      },
    ])
    expect(request.output_config).toEqual({
      effort: "low",
      format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
    })
  })

  it("the model can be changed with CLAIM_AI_MODEL", async () => {
    process.env.CLAIM_AI_MODEL = "claude-sonnet-5-5"
    const { client, create } = fakeClient(EMPTY)
    await extractClaim({ text: "x", claimDate }, { client })
    expect(create.mock.calls[0][0].model).toBe("claude-sonnet-5-5")
  })

  it("marks every part it returns as extracted", async () => {
    const { client } = fakeClient({
      ...EMPTY,
      shape: "NUMBER_BY_DATE",
      measure: "unemployment",
      comparison: "at_least",
      value: 6,
      unit: "%",
      deadline: "2028-12-31",
    })
    const result = await extractClaim(
      { text: "Unemployment will hit 6% by 2028", claimDate },
      { client },
    )
    expect(result).toEqual({
      source: "ai",
      shape: "NUMBER_BY_DATE",
      parts: {
        measure: { value: "unemployment", status: "extracted" },
        comparison: { value: "at_least", status: "extracted" },
        value: { value: 6, status: "extracted" },
        unit: { value: "%", status: "extracted" },
      },
      deadline: "2028-12-31",
      headline: null,
    })
  })

  it("free text comes back with no parts", async () => {
    const { client } = fakeClient(EMPTY)
    const result = await extractClaim(
      { text: "The labor market is weakening", claimDate },
      { client },
    )
    expect(result).toMatchObject({
      source: "ai",
      shape: "FREE_TEXT",
      parts: {},
    })
  })

  it.each([
    ["a refusal", "refusal", "The AI declined to read this claim."],
    ["a cut-off answer", "max_tokens", "The AI's answer was cut off."],
  ])("falls back to manual on %s", async (_name, stopReason, note) => {
    const { client } = fakeClient(EMPTY, stopReason)
    const result = await extractClaim({ text: "x", claimDate }, { client })
    expect(result).toMatchObject({ source: "manual", shape: null, note })
  })

  it("falls back to manual when the answer is not JSON", async () => {
    const create = jest.fn().mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Sorry, I can't." }],
    })
    const result = await extractClaim(
      { text: "x", claimDate },
      { client: { messages: { create } } as unknown as ClaimAiClient },
    )
    expect(result.source).toBe("manual")
  })

  it("never throws when the API fails", async () => {
    const headers = new Headers()
    const cases: [unknown, string][] = [
      [
        new Anthropic.AuthenticationError(401, undefined, "bad key", headers),
        "The ANTHROPIC_API_KEY was rejected.",
      ],
      [
        new Anthropic.RateLimitError(429, undefined, "slow down", headers),
        "The AI is rate limited right now.",
      ],
      [
        new Anthropic.APIConnectionError({ message: "offline" }),
        "Could not reach the AI.",
      ],
      [
        new Anthropic.InternalServerError(500, undefined, "boom", headers),
        "The AI returned an error (500): 500 boom",
      ],
    ]
    for (const [error, note] of cases) {
      const result = await extractClaim(
        { text: "x", claimDate },
        { client: failingClient(error) },
      )
      expect(result).toMatchObject({ source: "manual", note })
    }
  })

  it("does not call the AI for an empty claim", async () => {
    const { client, create } = fakeClient(EMPTY)
    const result = await extractClaim({ text: "   ", claimDate }, { client })
    expect(result.source).toBe("manual")
    expect(create).not.toHaveBeenCalled()
  })
})

describe("toExtraction", () => {
  it("drops parts that do not belong to the chosen shape", () => {
    const result = toExtraction({
      ...EMPTY,
      shape: "EVENT_BY_DATE",
      event: "rates get cut",
      measure: "should be ignored",
      value: 5,
    })
    expect(result.parts).toEqual({
      event: { value: "rates get cut", status: "extracted" },
    })
  })

  it("keeps a proposed way to tell for an event, marked extracted until I confirm it", () => {
    const result = toExtraction({
      ...EMPTY,
      shape: "EVENT_BY_DATE",
      event: "rates get cut",
      howToTell: "the Federal Reserve's rate announcements",
      deadline: "2026-12-31",
    })
    expect(result.parts).toEqual({
      event: { value: "rates get cut", status: "extracted" },
      howToTell: {
        value: "the Federal Reserve's rate announcements",
        status: "extracted",
      },
    })
    // with a deadline as well, that is enough for grade 4 once confirmed
    const analysis = analyzeClaim(
      "Rates get cut",
      new Date("2026-11-10T00:00:00.000Z"),
      result,
    )
    expect(analysis.grade.grade).toBe(4)
    expect(analysis.publish.ok).toBe(false)
  })

  it("carries a proposed headline through, for me to approve", () => {
    const result = toExtraction({
      ...EMPTY,
      shape: "EVENT_BY_DATE",
      headline: "  The Fed cuts its policy rate in 2026  ",
      event: "rates get cut",
    })
    expect(result.headline).toBe("The Fed cuts its policy rate in 2026")
    expect(toExtraction({ ...EMPTY, headline: "   " }).headline).toBeNull()
    expect(EXTRACTION_SCHEMA.required).toContain("headline")
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/Also write a headline/)
  })

  it("the schema and the instructions ask for a way to tell", () => {
    expect(EXTRACTION_SCHEMA.properties).toHaveProperty("howToTell")
    expect(EXTRACTION_SCHEMA.required).toContain("howToTell")
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(
      /howToTell is the one part you may propose/,
    )
    // a way to tell belongs to events only
    expect(
      toExtraction({
        ...EMPTY,
        shape: "A_BEATS_B",
        a: "x",
        b: "y",
        howToTell: "z",
      }).parts,
    ).not.toHaveProperty("howToTell")
  })

  it("keeps the upper number only for 'between'", () => {
    const base = {
      ...EMPTY,
      shape: "NUMBER_BY_DATE",
      measure: "CPI",
      value: 2,
      valueHigh: 3,
      unit: "%",
    }
    expect(
      toExtraction({ ...base, comparison: "above" }).parts.valueHigh,
    ).toBeUndefined()
    expect(
      toExtraction({ ...base, comparison: "between" }).parts.valueHigh,
    ).toEqual({ value: 3, status: "extracted" })
  })

  it("ignores blank strings and badly formed dates", () => {
    const result = toExtraction({
      ...EMPTY,
      shape: "EVENT_BY_DATE",
      event: "  ",
      deadline: "end of 2027",
    })
    expect(result.parts).toEqual({})
    expect(result.deadline).toBeNull()
  })

  it("rejects an unknown shape or comparison", () => {
    expect(toExtraction({ ...EMPTY, shape: "VIBES" }).source).toBe("manual")
    expect(
      toExtraction({
        ...EMPTY,
        shape: "NUMBER_BY_DATE",
        comparison: "roughly",
      }).source,
    ).toBe("manual")
  })
})
