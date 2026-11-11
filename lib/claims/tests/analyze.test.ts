/**
 * @jest-environment node
 */
import { analyzeClaim } from "../analyze"
import { Extraction } from "../extract"
import { ClaimFixture, FIXTURES } from "./fixtures"

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/** The fixture's extraction, in the form the AI step returns it. */
function asExtraction(f: ClaimFixture): Extraction {
  const { deadline, ...parts } = f.extraction.parts
  return {
    source: "ai",
    shape: f.extraction.shape,
    parts,
    deadline: deadline ? String(deadline.value) : null,
  }
}

const NO_AI: Extraction = {
  source: "manual",
  shape: null,
  parts: {},
  deadline: null,
  note: "No ANTHROPIC_API_KEY set: fill the fields by hand.",
}

describe("analyzeClaim: fixtures, end to end", () => {
  it.each(FIXTURES.map((f) => [f.text, f] as const))("%s", (_text, f) => {
    const result = analyzeClaim(f.text, day(f.claimDate), asExtraction(f))

    expect(result.shape).toBe(f.extraction.shape)
    expect(result.grade.grade).toBe(f.expect.grade)
    expect(result.deadline?.toISOString().slice(0, 10) ?? null).toBe(
      f.expect.deadline,
    )
    expect(result.publish.ok).toBe(f.expect.canPublish)

    const want = f.expect.confidence
    if (want === null) {
      expect(result.confidence.kind).toBe("not_given")
    } else if (typeof want === "string") {
      expect(result.confidence).toMatchObject({ kind: "word", word: want })
    } else {
      expect(result.confidence).toMatchObject({ kind: "percent" })
    }
  })
})

describe("analyzeClaim: the deadline", () => {
  it("plain code decides the deadline, even if the AI disagrees", () => {
    const result = analyzeClaim("Rates get cut this year", day("2025-07-14"), {
      source: "ai",
      shape: "EVENT_BY_DATE",
      parts: { event: { value: "rates get cut", status: "extracted" } },
      // an AI that wrongly used "today" instead of the claim date
      deadline: "2026-12-31",
    })
    expect(result.deadline).toEqual(day("2025-12-31"))
    expect(result.parts.deadline).toEqual({
      value: "2025-12-31",
      status: "extracted",
    })
  })

  it("an ambiguous phrase gives a working deadline to confirm", () => {
    const result = analyzeClaim(
      "Unemployment will hit 6% by 2028",
      day("2025-07-14"),
      { source: "ai", shape: "NUMBER_BY_DATE", parts: {}, deadline: null },
    )
    expect(result.parts.deadline).toEqual({
      value: "2028-12-31",
      status: "working",
    })
  })

  it("uses the AI's date only when the code finds no deadline phrase", () => {
    const result = analyzeClaim(
      "Rates get cut before the midterms",
      day("2025-07-14"),
      {
        source: "ai",
        shape: "EVENT_BY_DATE",
        parts: { event: { value: "rates get cut", status: "extracted" } },
        deadline: "2026-11-03",
      },
    )
    expect(result.deadline).toEqual(day("2026-11-03"))
    expect(result.parts.deadline?.status).toBe("extracted")
  })

  it("no deadline anywhere: grade 2 for a shaped claim", () => {
    const result = analyzeClaim("Rates get cut", day("2025-07-14"), {
      source: "ai",
      shape: "EVENT_BY_DATE",
      parts: { event: { value: "rates get cut", status: "extracted" } },
      deadline: null,
    })
    expect(result.deadline).toBeNull()
    expect(result.grade.grade).toBe(2)
    expect(result.grade.missing).toEqual(["deadline", "howToTell"])
  })
})

describe("analyzeClaim: with no AI", () => {
  it("saves the claim as free text, grade 1, private only", () => {
    const result = analyzeClaim(
      "Unemployment will hit 6% by 2028",
      day("2025-07-14"),
      NO_AI,
    )
    expect(result.source).toBe("manual")
    expect(result.shape).toBe("FREE_TEXT")
    expect(result.grade.grade).toBe(1)
    expect(result.publish.ok).toBe(false)
  })

  it("still reads the deadline, confidence and 'about' with plain code", () => {
    const result = analyzeClaim(
      "S&P 500 falls about 20% from today's close by end of 2027, likely",
      day("2025-07-14"),
      NO_AI,
    )
    expect(result.deadline).toEqual(day("2027-12-31"))
    expect(result.confidence).toMatchObject({ kind: "word", word: "LIKELY" })
    expect(result.approximate).toBe(true)
  })

  it("is deterministic: same inputs, same result", () => {
    for (const f of FIXTURES) {
      const first = analyzeClaim(f.text, day(f.claimDate), asExtraction(f))
      for (let i = 0; i < 20; i++) {
        expect(analyzeClaim(f.text, day(f.claimDate), asExtraction(f))).toEqual(
          first,
        )
      }
    }
  })
})
