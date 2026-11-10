import {
  CONFIDENCE_RANGES,
  parseConfidence,
  probabilityForWord,
} from "../confidence"
import { FIXTURES } from "./fixtures"

describe("confidence word mapping", () => {
  it("maps each word to its range", () => {
    expect(
      Object.fromEntries(
        Object.entries(CONFIDENCE_RANGES).map(([w, r]) => [w, [r.low, r.high]]),
      ),
    ).toEqual({
      ALMOST_CERTAIN: [90, 99],
      VERY_LIKELY: [80, 90],
      LIKELY: [60, 80],
      TOSS_UP: [40, 60],
      UNLIKELY: [20, 40],
      VERY_UNLIKELY: [10, 20],
      ALMOST_NO_CHANCE: [1, 10],
    })
  })

  it("uses the midpoint of the range as the forecast number", () => {
    expect(probabilityForWord("LIKELY")).toBeCloseTo(0.7)
    expect(probabilityForWord("ALMOST_CERTAIN")).toBeCloseTo(0.945)
    expect(probabilityForWord("VERY_LIKELY")).toBeCloseTo(0.85)
    expect(probabilityForWord("TOSS_UP")).toBeCloseTo(0.5)
    expect(probabilityForWord("UNLIKELY")).toBeCloseTo(0.3)
    expect(probabilityForWord("VERY_UNLIKELY")).toBeCloseTo(0.15)
    expect(probabilityForWord("ALMOST_NO_CHANCE")).toBeCloseTo(0.055)
  })

  it.each([
    ["Rates get cut, almost certain", "ALMOST_CERTAIN"],
    ["Almost certainly a recession", "ALMOST_CERTAIN"],
    ["very likely to pass", "VERY_LIKELY"],
    ["S&P 500 falls 20% from today's close by end of 2027, likely", "LIKELY"],
    ["It's a toss-up whether they merge", "TOSS_UP"],
    ["toss up", "TOSS_UP"],
    ["Unlikely they raise", "UNLIKELY"],
    ["not likely to happen", "UNLIKELY"],
    ["very unlikely this year", "VERY_UNLIKELY"],
    ["almost no chance of a default", "ALMOST_NO_CHANCE"],
  ])("%s -> %s", (text, word) => {
    expect(parseConfidence(text)).toMatchObject({ kind: "word", word })
  })

  it("does not read 'unlikely' as 'likely' or 'very likely' as 'likely'", () => {
    expect(parseConfidence("unlikely")).toMatchObject({ word: "UNLIKELY" })
    expect(parseConfidence("very likely")).toMatchObject({
      word: "VERY_LIKELY",
    })
    expect(parseConfidence("very unlikely")).toMatchObject({
      word: "VERY_UNLIKELY",
    })
  })

  it.each([
    "Unemployment will hit 6% by 2028",
    "I think the labor market is weakening",
    "The labor market is weakening",
    "Rates will be cut",
  ])("flat 'will' or bare 'I think' is not given: %s", (text) => {
    expect(parseConfidence(text)).toEqual({ kind: "not_given" })
  })
})

describe("percentage-as-confidence rule", () => {
  it.each([
    ["70% chance rates get cut", 0.7],
    ["Rates get cut, 70% likely", 0.7],
    ["I'm 85 percent sure", 0.85],
    ["90% confident it closes", 0.9],
    ["odds of 25% that it fails", 0.25],
    ["probability: 12.5%", 0.125],
  ])("said as odds: %s", (text, probability) => {
    const result = parseConfidence(text)
    expect(result.kind).toBe("percent")
    expect(result.kind === "percent" && result.probability).toBeCloseTo(
      probability,
    )
  })

  it.each([
    "Margins of 70.6% next quarter",
    "Unemployment will hit 6% by 2028",
    "S&P 500 falls 20% from today's close by end of 2027",
    "Inflation above 3% in 2026",
  ])("a number in the claim, not confidence: %s", (text) => {
    expect(parseConfidence(text)).toEqual({ kind: "not_given" })
  })

  it("picks the odds, not the claim's own number", () => {
    expect(
      parseConfidence("S&P 500 falls 20% by end of 2027, 30% chance"),
    ).toMatchObject({ kind: "percent", probability: 0.3 })
  })

  it("'70% likely' is 70%, not the word 'likely'", () => {
    expect(parseConfidence("70% likely")).toMatchObject({ kind: "percent" })
  })

  it("the word still counts when the percentage is just a number", () => {
    const result = parseConfidence(
      "S&P 500 falls 20% from today's close by end of 2027, likely",
    )
    expect(result).toMatchObject({ kind: "word", word: "LIKELY" })
    expect(result.kind === "word" && result.probability).toBeCloseTo(0.7)
  })
})

describe("parseConfidence: fixtures", () => {
  it.each(FIXTURES.map((f) => [f.text, f] as const))("%s", (_text, f) => {
    const result = parseConfidence(f.text)
    const want = f.expect.confidence
    if (want === null) {
      expect(result).toEqual({ kind: "not_given" })
    } else if (typeof want === "string") {
      expect(result).toMatchObject({ kind: "word", word: want })
    } else {
      expect(result).toMatchObject({
        kind: "percent",
        probability: want.percent / 100,
      })
    }
  })
})
