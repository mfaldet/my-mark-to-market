import { gradeClaim } from "../grade"
import {
  applyAnswer,
  EngineClaim,
  MAX_ENGINE_QUESTIONS,
  nextQuestion,
} from "../next_question"
import { OutcomeParts } from "../types"

const x = (value: string | number) => ({ value, status: "extracted" as const })
const claimDate = new Date("2025-07-14T00:00:00.000Z")

const claim = (
  text: string,
  shape: EngineClaim["shape"],
  parts: OutcomeParts,
  questionsAsked = 0,
): EngineClaim => ({ text, claimDate, shape, parts, questionsAsked })

const grade = (c: EngineClaim) =>
  gradeClaim({ shape: c.shape, parts: c.parts, checkLinkConfirmed: false })
    .grade

describe("nextQuestion", () => {
  it("asks one question, never a list", () => {
    const q = nextQuestion(claim("It goes up", "NUMBER_BY_DATE", {}))
    expect(q).not.toBeNull()
    expect(Array.isArray(q)).toBe(false)
    expect(q!.part).toBe("measure")
  })

  it("free text: asks what I would observe", () => {
    const q = nextQuestion(
      claim("The labor market is weakening", "FREE_TEXT", {}),
    )
    expect(q).toEqual({
      part: "event",
      kind: "fill",
      question: "What would you see happen if this is true?",
      suggestion: null,
    })
  })

  it("asks about the most important gap first", () => {
    // measure and deadline outrank the number, comparison and unit
    const order: string[] = []
    let c = claim("x", "NUMBER_BY_DATE", {})
    const answers: Record<string, string | number> = {
      measure: "CPI",
      deadline: "2026-12-31",
      value: 3,
    }
    for (let i = 0; i < 3; i++) {
      const q = nextQuestion(c)!
      order.push(q.part)
      const result = applyAnswer(c, { value: answers[q.part] })
      if (!result.ok) throw new Error(result.error)
      c = result.claim
    }
    expect(order).toEqual(["measure", "deadline", "value"])
  })

  it("no deadline: suggests the end of the year after the CLAIM date", () => {
    const q = nextQuestion(
      claim("Rates get cut", "EVENT_BY_DATE", { event: x("rates get cut") }),
    )
    expect(q).toMatchObject({
      part: "deadline",
      kind: "fill",
      suggestion: { value: "2026-12-31", label: "By Dec 31, 2026?" },
    })
  })

  it("number with no direction: suggests 'at least'", () => {
    const q = nextQuestion(
      claim("Margins of 70.6% next quarter", "NUMBER_BY_DATE", {
        measure: x("margins"),
        value: x(70.6),
        unit: x("%"),
        deadline: x("2025-12-31"),
      }),
    )
    expect(q).toMatchObject({
      part: "comparison",
      suggestion: { value: "at_least", label: "At least 70.6%?" },
    })
  })

  it("a change with no starting point: suggests the close on the claim date", () => {
    const q = nextQuestion(
      claim("S&P 500 falls 20% by end of 2027", "NUMBER_BY_DATE", {
        measure: x("S&P 500"),
        comparison: x("at_least"),
        value: x(20),
        unit: x("% decline"),
        deadline: x("2027-12-31"),
      }),
    )
    expect(q).toMatchObject({
      part: "baseline",
      suggestion: {
        value: "close on 2025-07-14",
        label: "From the close on Jul 14, 2025?",
      },
    })
  })

  it("an uncertain deadline ('by 2028') is put to me to confirm", () => {
    const q = nextQuestion(
      claim("Unemployment will hit 6% by 2028", "NUMBER_BY_DATE", {
        measure: x("unemployment"),
        comparison: x("at_least"),
        value: x(6),
        unit: x("%"),
        deadline: { value: "2028-12-31", status: "working" },
      }),
    )
    expect(q).toEqual({
      part: "deadline",
      kind: "confirm",
      question: "Is this the deadline you meant?",
      suggestion: { value: "2028-12-31", label: "By Dec 31, 2028?" },
    })
  })

  it("nothing to ask when the claim is complete", () => {
    expect(
      nextQuestion(
        claim("Rates get cut this year", "EVENT_BY_DATE", {
          event: x("rates get cut"),
          deadline: x("2025-12-31"),
        }),
      ),
    ).toBeNull()
  })

  it("stops after three questions, whatever is still missing", () => {
    expect(MAX_ENGINE_QUESTIONS).toBe(3)
    expect(nextQuestion(claim("x", "NUMBER_BY_DATE", {}, 2))).not.toBeNull()
    expect(nextQuestion(claim("x", "NUMBER_BY_DATE", {}, 3))).toBeNull()
  })

  it("is deterministic", () => {
    const c = claim("x", "A_BEATS_B", { a: x("Nvidia") })
    expect(nextQuestion(c)).toEqual(nextQuestion({ ...c }))
    expect(nextQuestion(c)?.part).toBe("b")
  })
})

describe("applyAnswer", () => {
  const noDeadline = claim("Rates get cut", "EVENT_BY_DATE", {
    event: x("rates get cut"),
  })

  it("accepting a default stores it as working", () => {
    const result = applyAnswer(noDeadline, { accept: true })
    expect(result.ok && result.claim.parts.deadline).toEqual({
      value: "2026-12-31",
      status: "working",
    })
    expect(result.ok && result.claim.questionsAsked).toBe(1)
  })

  it("typing my own answer stores it as stated", () => {
    const result = applyAnswer(noDeadline, { value: "2025-12-31" })
    expect(result.ok && result.claim.parts.deadline).toEqual({
      value: "2025-12-31",
      status: "stated",
    })
  })

  it("saying yes to a confirm question makes it stated", () => {
    const c = claim("x by 2028", "EVENT_BY_DATE", {
      event: x("x"),
      deadline: { value: "2028-12-31", status: "working" },
    })
    const result = applyAnswer(c, { accept: true })
    expect(result.ok && result.claim.parts.deadline?.status).toBe("stated")
    // and then there is nothing more to ask
    expect(result.ok && nextQuestion(result.claim)).toBeNull()
  })

  it("skipping counts as a question and changes nothing else", () => {
    const result = applyAnswer(noDeadline, { skip: true })
    expect(result).toEqual({
      ok: true,
      claim: { ...noDeadline, questionsAsked: 1 },
    })
  })

  it("answering the free-text question makes it an event claim", () => {
    const result = applyAnswer(
      claim("The labor market is weakening", "FREE_TEXT", {}),
      { value: "Unemployment rate rises" },
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.claim.shape).toBe("EVENT_BY_DATE")
    expect(result.claim.parts.event).toEqual({
      value: "Unemployment rate rises",
      status: "stated",
    })
    expect(grade(result.claim)).toBe(2) // still needs a deadline
    expect(nextQuestion(result.claim)?.part).toBe("deadline")
  })

  it("rejects answers of the wrong kind without counting them", () => {
    expect(applyAnswer(noDeadline, { value: "soon" })).toEqual({
      ok: false,
      error: "Expected a date like 2027-12-31.",
    })
    const needsNumber = claim("x", "NUMBER_BY_DATE", {
      measure: x("CPI"),
      deadline: x("2026-12-31"),
    })
    expect(applyAnswer(needsNumber, { value: "lots" }).ok).toBe(false)
    expect(applyAnswer(needsNumber, { value: "1,250.5" })).toMatchObject({
      ok: true,
      claim: { parts: { value: { value: 1250.5, status: "stated" } } },
    })
  })

  it("accept fails when the question has no default", () => {
    expect(
      applyAnswer(claim("x", "NUMBER_BY_DATE", {}), { accept: true }).ok,
    ).toBe(false)
  })

  it("fails when there is no open question", () => {
    expect(
      applyAnswer(claim("x", "NUMBER_BY_DATE", {}, 3), { skip: true }).ok,
    ).toBe(false)
  })

  it("three answers can take a hunch from grade 1 to grade 4", () => {
    let c = claim("The labor market is weakening", "FREE_TEXT", {})
    expect(grade(c)).toBe(1)
    for (const answer of [
      { value: "Unemployment rate above 5%" },
      { accept: true as const },
    ]) {
      const result = applyAnswer(c, answer)
      if (!result.ok) throw new Error(result.error)
      c = result.claim
    }
    expect(grade(c)).toBe(4)
    expect(c.questionsAsked).toBe(2)
  })
})
