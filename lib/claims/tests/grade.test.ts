import { canPublish, gradeClaim, GradeInput } from "../grade"
import { OutcomeParts } from "../types"
import { FIXTURES } from "./fixtures"

const stated = (value: string | number) => ({
  value,
  status: "stated" as const,
})

function without(parts: OutcomeParts, name: keyof OutcomeParts) {
  const copy = { ...parts }
  delete copy[name]
  return copy
}

const completeNumber: OutcomeParts = {
  measure: stated("US unemployment rate (U-3)"),
  comparison: stated("at_least"),
  value: stated(6),
  unit: stated("%"),
  deadline: stated("2028-12-31"),
}

describe("gradeClaim: fixtures", () => {
  it.each(FIXTURES.map((f) => [f.text, f] as const))("%s", (_text, f) => {
    const result = gradeClaim({ ...f.extraction, checkLinkConfirmed: false })
    expect(result.grade).toBe(f.expect.grade)
  })
})

describe("gradeClaim: rules", () => {
  it("grade 1: free text, or no shape at all", () => {
    expect(
      gradeClaim({ shape: "FREE_TEXT", parts: {}, checkLinkConfirmed: false })
        .grade,
    ).toBe(1)
    expect(
      gradeClaim({ shape: null, parts: null, checkLinkConfirmed: false }).grade,
    ).toBe(1)
  })

  it("grade 1: free text stays 1 even with a confirmed link and a deadline", () => {
    expect(
      gradeClaim({
        shape: "FREE_TEXT",
        parts: { deadline: stated("2026-01-01") },
        checkLinkConfirmed: true,
      }).grade,
    ).toBe(1)
  })

  it("grade 2: shape picked but the measured thing is missing", () => {
    const rest = without(completeNumber, "measure")
    const result = gradeClaim({
      shape: "NUMBER_BY_DATE",
      parts: rest,
      checkLinkConfirmed: false,
    })
    expect(result.grade).toBe(2)
    expect(result.missing).toEqual(["measure"])
  })

  it("grade 2: event shape with no event", () => {
    expect(
      gradeClaim({
        shape: "EVENT_BY_DATE",
        parts: { deadline: stated("2026-01-01") },
        checkLinkConfirmed: false,
      }).grade,
    ).toBe(2)
  })

  it("grade 2: the thing is there but there is no deadline", () => {
    const rest = without(completeNumber, "deadline")
    expect(
      gradeClaim({
        shape: "NUMBER_BY_DATE",
        parts: rest,
        checkLinkConfirmed: false,
      }).grade,
    ).toBe(2)
  })

  it("grade 3: thing and deadline present, number or comparison missing", () => {
    for (const drop of ["value", "comparison", "unit"] as const) {
      const parts = { ...completeNumber }
      delete parts[drop]
      const result = gradeClaim({
        shape: "NUMBER_BY_DATE",
        parts,
        checkLinkConfirmed: false,
      })
      expect(result.grade).toBe(3)
      expect(result.missing).toEqual([drop])
    }
  })

  it("grade 3: 'between' with only one number", () => {
    const parts = { ...completeNumber, comparison: stated("between") }
    expect(
      gradeClaim({ shape: "NUMBER_BY_DATE", parts, checkLinkConfirmed: false })
        .missing,
    ).toEqual(["valueHigh"])
    expect(
      gradeClaim({
        shape: "NUMBER_BY_DATE",
        parts: { ...parts, valueHigh: stated(7) },
        checkLinkConfirmed: false,
      }).grade,
    ).toBe(4)
  })

  it("grade 3: A beats B with no measure of 'beats'; rank with no rank", () => {
    expect(
      gradeClaim({
        shape: "A_BEATS_B",
        parts: {
          a: stated("A"),
          b: stated("B"),
          deadline: stated("2026-01-01"),
        },
        checkLinkConfirmed: false,
      }).grade,
    ).toBe(3)
    expect(
      gradeClaim({
        shape: "RANK_OR_AWARD",
        parts: { subject: stated("X"), deadline: stated("2026-01-01") },
        checkLinkConfirmed: false,
      }).grade,
    ).toBe(3)
  })

  it("grade 4: complete, no confirmed link", () => {
    expect(
      gradeClaim({
        shape: "NUMBER_BY_DATE",
        parts: completeNumber,
        checkLinkConfirmed: false,
      }).grade,
    ).toBe(4)
  })

  it("grade 5: complete with a confirmed link", () => {
    expect(
      gradeClaim({
        shape: "NUMBER_BY_DATE",
        parts: completeNumber,
        checkLinkConfirmed: true,
      }).grade,
    ).toBe(5)
  })

  it("a confirmed link does not lift an incomplete claim", () => {
    const rest = without(completeNumber, "value")
    expect(
      gradeClaim({
        shape: "NUMBER_BY_DATE",
        parts: rest,
        checkLinkConfirmed: true,
      }).grade,
    ).toBe(3)
  })

  it("extracted and working parts count toward the grade", () => {
    const parts: OutcomeParts = {
      ...completeNumber,
      measure: { value: "unemployment", status: "extracted" },
      deadline: { value: "2028-12-31", status: "working" },
    }
    expect(
      gradeClaim({ shape: "NUMBER_BY_DATE", parts, checkLinkConfirmed: false })
        .grade,
    ).toBe(4)
  })

  it("lists missing parts most important first", () => {
    expect(
      gradeClaim({
        shape: "NUMBER_BY_DATE",
        parts: {},
        checkLinkConfirmed: false,
      }).missing,
    ).toEqual(["measure", "deadline", "value", "comparison", "unit"])
  })

  it("is deterministic: same claim, same grade, every time", () => {
    for (const f of FIXTURES) {
      const input: GradeInput = { ...f.extraction, checkLinkConfirmed: false }
      const first = gradeClaim(input)
      for (let i = 0; i < 50; i++) {
        expect(gradeClaim(JSON.parse(JSON.stringify(input)))).toEqual(first)
      }
    }
  })

  it("does not depend on the order parts are stored in", () => {
    const reversed = Object.fromEntries(
      Object.entries(completeNumber).reverse(),
    )
    expect(
      gradeClaim({
        shape: "NUMBER_BY_DATE",
        parts: reversed,
        checkLinkConfirmed: false,
      }),
    ).toEqual(
      gradeClaim({
        shape: "NUMBER_BY_DATE",
        parts: completeNumber,
        checkLinkConfirmed: false,
      }),
    )
  })
})

describe("canPublish: the publish gate", () => {
  it.each(FIXTURES.map((f) => [f.text, f] as const))("fixture: %s", (_t, f) => {
    expect(canPublish({ ...f.extraction, checkLinkConfirmed: false }).ok).toBe(
      f.expect.canPublish,
    )
  })

  it("allows grade 4 and grade 5 when every part is stated", () => {
    for (const checkLinkConfirmed of [false, true]) {
      expect(
        canPublish({
          shape: "NUMBER_BY_DATE",
          parts: completeNumber,
          checkLinkConfirmed,
        }),
      ).toEqual({ ok: true })
    }
  })

  it("blocks grades 1 to 3 and says why", () => {
    const free = canPublish({
      shape: "FREE_TEXT",
      parts: {},
      checkLinkConfirmed: false,
    })
    expect(free.ok).toBe(false)
    expect(!free.ok && free.reasons[0]).toMatch(/Not checkable yet \(grade 1\)/)

    const rest = without(completeNumber, "value")
    const three = canPublish({
      shape: "NUMBER_BY_DATE",
      parts: rest,
      checkLinkConfirmed: true,
    })
    expect(!three.ok && three.reasons[0]).toMatch(/grade 3.*Missing the number/)
  })

  it("blocks a complete claim with an extracted or working part, naming it", () => {
    for (const status of ["extracted", "working"] as const) {
      const result = canPublish({
        shape: "NUMBER_BY_DATE",
        parts: {
          ...completeNumber,
          measure: { value: "unemployment", status },
        },
        checkLinkConfirmed: true,
      })
      expect(result).toEqual({
        ok: false,
        reasons: ["Not yet confirmed: what's measured."],
      })
    }
  })

  it("ignores unconfirmed optional parts", () => {
    expect(
      canPublish({
        shape: "NUMBER_BY_DATE",
        parts: {
          ...completeNumber,
          baseline: { value: "today's close", status: "extracted" },
        },
        checkLinkConfirmed: false,
      }),
    ).toEqual({ ok: true })
  })
})
