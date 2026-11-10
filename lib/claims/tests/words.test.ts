import {
  parseResult,
  partWords,
  resultFor,
  resultLabel,
  standardBrier,
} from "../words"

describe("the words on screen", () => {
  it("a result is right, wrong or can't tell", () => {
    expect([resultFor("YES"), resultFor("NO"), resultFor("AMBIGUOUS")]).toEqual(
      ["right", "wrong", "can't tell"],
    )
    expect(resultFor(null)).toBeNull()
    expect(resultLabel("AMBIGUOUS")).toBe("Can't tell")
    expect(resultLabel("Some other option")).toBe("Some other option")
  })

  it.each([
    ["right", "YES"],
    ["Wrong", "NO"],
    ["can't tell", "AMBIGUOUS"],
    ["cant_tell", "AMBIGUOUS"],
    ["YES", "YES"],
    ["no", "NO"],
    ["AMBIGUOUS", "AMBIGUOUS"],
  ])("reads %s as %s", (raw, stored) => {
    expect(parseResult(raw)).toBe(stored)
  })

  it("does not guess at anything else", () => {
    expect(parseResult("probably")).toBeNull()
    expect(parseResult("")).toBeNull()
  })

  it("names outcome parts in plain words", () => {
    expect(partWords(["measure"])).toBe("what's measured")
    expect(partWords(["measure", "value", "deadline"])).toBe(
      "what's measured, the number and the deadline",
    )
  })

  it("shows the standard Brier score: a coin flip is 0.25", () => {
    // Fatebook stores 2 x (1 - 0.5)^2 = 0.5 for a 50% forecast
    expect(standardBrier(0.5)).toBe(0.25)
    expect(standardBrier(0)).toBe(0)
    expect(standardBrier(2)).toBe(1)
  })
})
