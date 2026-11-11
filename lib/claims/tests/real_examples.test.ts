/**
 * Built from the first four real entries, logged through the Claude
 * connector on Nov 10, 2026. All four were graded 4 ("prediction") by the
 * old rules. None should have been.
 */
import { gradeClaim } from "../grade"
import {
  findCompoundIn,
  findMismatch,
  mismatchFlag,
  namesIn,
} from "../outcome_checks"
import { OutcomeParts } from "../types"

const event = (text: string, deadline: string): OutcomeParts => ({
  event: { value: text, status: "stated" },
  deadline: { value: deadline, status: "stated" },
})
const grade = (parts: OutcomeParts, hasCheckLink = false) =>
  gradeClaim({
    shape: "EVENT_BY_DATE",
    parts,
    checkLinkConfirmed: false,
    hasCheckLink,
  })

export const REAL = {
  original: {
    text: "The board won't fire Jensen Huang at NVIDIA, and NVIDIA stock price will still out perform Mag 7 average over 2027, but this Jensen scandal will be a huge WMD (weapon of mass distraction) for the new capitol hill.",
    outcome:
      "NVIDIA stock will still out perform the S&P 500 over 2027 (i.e. this scandal doesn't affect it's short-term or long-term performance).",
    deadline: "2027-12-31",
  },
  boardWontFire: {
    text: "The board won't fire Jensen Huang at NVIDIA",
    outcome:
      "If the board doesn't fire Jensen Huang at NVIDIA, then NVIDIA will beat the S&P 500 over 2027. If not, then NVIDIA doesn't outperform the S&P 500 over 2027.",
    deadline: "2027-12-31",
  },
  distraction: {
    text: "this Jensen scandal will be a huge WMD (weapon of mass distraction) for the new capitol hill.",
    outcome:
      "If the Jensen scandal is a distraction for Capitol Hill, then this story will stay in the headlines throughout the rest of 2026 (through the next 8 weeks).",
    deadline: "2026-12-31",
  },
  stillCeo: {
    text: "Jensen Huang is still NVIDIA's CEO on Dec 31, 2027.",
    outcome: "Jensen Huang is still NVIDIA's CEO on Dec 31, 2027.",
    deadline: "2027-12-31",
  },
}

describe("the grading loophole, on the four real entries", () => {
  it("a conditional with two predictions in it stays below grade 4", () => {
    const { outcome, deadline } = REAL.boardWontFire
    expect(findCompoundIn(outcome)).toMatchObject({
      compound: true,
      why: "if-then",
    })
    const result = grade(event(outcome, deadline))
    expect(result.grade).toBe(3)
    expect(result.compound).toBe(true)
    expect(result.reason).toMatch(/Split it/)
  })

  it('"this story will stay in the headlines" has no way to tell, and is conditional', () => {
    const { outcome, deadline } = REAL.distraction
    expect(grade(event(outcome, deadline)).grade).toBe(3)
    // even with the "if" taken out, there is still no way to tell
    const plain = grade(
      event(
        "this story will stay in the headlines throughout the rest of 2026",
        deadline,
      ),
    )
    expect(plain.grade).toBe(3)
    expect(plain.missing).toEqual(["howToTell"])
    expect(plain.reason).toMatch(/way to tell/)
  })

  it("an outcome that names a different measure than my words is flagged", () => {
    const { text, outcome, deadline } = REAL.original
    const parts = event(outcome, deadline)
    expect(findMismatch(text, parts)).toEqual(["S&P 500"])
    expect(mismatchFlag(text, parts)).toMatch(/mentions S&P 500/)
    // and it is no longer a prediction: nothing says how to tell
    expect(grade(parts).grade).toBe(3)
  })

  it("the board entry's outcome also names something its words don't", () => {
    const { text, outcome, deadline } = REAL.boardWontFire
    expect(findMismatch(text, event(outcome, deadline))).toEqual(["S&P 500"])
  })

  it("a plain, single event is not called compound or mismatched", () => {
    const { text, outcome, deadline } = REAL.stillCeo
    const parts = event(outcome, deadline)
    expect(findCompoundIn(outcome)).toEqual({ compound: false })
    expect(findMismatch(text, parts)).toEqual([])
    expect(
      findMismatch(
        REAL.distraction.text,
        event(REAL.distraction.outcome, "2026-12-31"),
      ),
    ).toEqual([])
    // but it still needs a way to tell before it is a prediction
    expect(grade(parts)).toMatchObject({ grade: 3, missing: ["howToTell"] })
  })

  it("reaches grade 4 once it says how to tell, or has a check link", () => {
    const { outcome, deadline } = REAL.stillCeo
    const withSource: OutcomeParts = {
      ...event(outcome, deadline),
      howToTell: { value: "NVIDIA's leadership page", status: "stated" },
    }
    expect(grade(withSource).grade).toBe(4)
    expect(grade(event(outcome, deadline), true).grade).toBe(4)
  })
})

describe("a fuller form of a name I used is not a mismatch", () => {
  it('"Jensen Huang" when my words say "this Jensen scandal"', () => {
    expect(
      findMismatch(REAL.distraction.text, {
        event: {
          value:
            "A congressional committee holds a hearing about the Jensen Huang scandal",
          status: "extracted",
        },
      }),
    ).toEqual([])
  })
  it("but a different index is", () => {
    expect(
      findMismatch("NVIDIA will out perform Mag 7 average over 2027", {
        a: { value: "NVIDIA", status: "extracted" },
        b: { value: "Nasdaq 100", status: "extracted" },
      }),
    ).toEqual(["Nasdaq 100"])
  })
})

describe("what counts as more than one prediction", () => {
  it.each([
    ["Rates get cut and/or the Fed pauses QT", "and/or"],
    [
      "NVIDIA will beat the S&P 500 and the board won't fire the CEO",
      "two results",
    ],
    ["Unemployment rises, but inflation stays below 3%", "two results"],
    ["Rates get cut. Inflation stays below 3% all year.", "two sentences"],
    ["If rates get cut, housing starts rise", "if-then"],
  ])("%s", (text, why) => {
    expect(findCompoundIn(text)).toMatchObject({ compound: true, why })
  })

  it.each([
    "Rates get cut",
    "Nvidia and AMD both report revenue growth above 10%",
    "The Fed cuts rates by 25 or 50 basis points",
    "NVIDIA stock will still out perform the S&P 500 over 2027 (i.e. this scandal doesn't affect it's short-term or long-term performance).",
    "Research and development spending rises",
  ])("one prediction: %s", (text) => {
    expect(findCompoundIn(text)).toEqual({ compound: false })
  })
})

describe("names", () => {
  it("finds names with numbers, and ignores dates and sentence starts", () => {
    expect(namesIn(REAL.boardWontFire.outcome)).toEqual([
      "Jensen Huang",
      "NVIDIA",
      "S&P 500",
    ])
    expect(namesIn("out perform Mag 7 average over 2027")).toEqual(["Mag 7"])
    expect(namesIn(REAL.stillCeo.outcome)).toEqual(["Jensen Huang", "NVIDIA"])
  })
})
