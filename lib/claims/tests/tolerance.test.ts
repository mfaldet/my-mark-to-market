import {
  evaluateNumber,
  isApproximate,
  isRateUnit,
  isWithinTolerance,
} from "../tolerance"

describe("tolerance rule", () => {
  it("rates and percentages: within 0.25 percentage points", () => {
    expect(isWithinTolerance(5.75, 6, "%")).toBe(true)
    expect(isWithinTolerance(6.25, 6, "%")).toBe(true)
    expect(isWithinTolerance(5.74, 6, "%")).toBe(false)
    expect(isWithinTolerance(6.26, 6, "percent")).toBe(false)
  })

  it("amounts: within 5% of the number", () => {
    expect(isWithinTolerance(190, 200, "USD")).toBe(true)
    expect(isWithinTolerance(210, 200, "USD")).toBe(true)
    expect(isWithinTolerance(189.9, 200, "USD")).toBe(false)
    expect(isWithinTolerance(5700, 6000, "index points")).toBe(true)
    expect(isWithinTolerance(5699, 6000, "index points")).toBe(false)
  })

  it("tells rates from amounts by the unit", () => {
    expect(isRateUnit("%")).toBe(true)
    expect(isRateUnit("% decline")).toBe(true)
    expect(isRateUnit("percentage points")).toBe(true)
    expect(isRateUnit("USD")).toBe(false)
    expect(isRateUnit("million barrels")).toBe(false)
  })
})

describe("evaluateNumber", () => {
  const about6 = {
    comparison: "at_least" as const,
    value: 6,
    unit: "%",
    approximate: true,
  }

  it("right is right, with no close call", () => {
    expect(evaluateNumber(about6, 6.1)).toEqual({ met: true, closeCall: false })
    expect(evaluateNumber(about6, 6)).toEqual({ met: true, closeCall: false })
  })

  it("'about 6%' that lands at 5.8% is wrong for the score but a close call", () => {
    expect(evaluateNumber(about6, 5.8)).toEqual({ met: false, closeCall: true })
  })

  it("outside tolerance is simply wrong", () => {
    expect(evaluateNumber(about6, 5.5)).toEqual({
      met: false,
      closeCall: false,
    })
  })

  it("no 'about' in the claim means no close call, however near", () => {
    expect(evaluateNumber({ ...about6, approximate: false }, 5.99)).toEqual({
      met: false,
      closeCall: false,
    })
  })

  it("amounts use 5%", () => {
    const about200 = {
      comparison: "above" as const,
      value: 200,
      unit: "USD",
      approximate: true,
    }
    expect(evaluateNumber(about200, 192)).toEqual({
      met: false,
      closeCall: true,
    })
    expect(evaluateNumber(about200, 185)).toEqual({
      met: false,
      closeCall: false,
    })
  })

  it("handles every comparison", () => {
    const base = { value: 10, unit: "USD", approximate: false }
    expect(evaluateNumber({ ...base, comparison: "above" }, 10).met).toBe(false)
    expect(evaluateNumber({ ...base, comparison: "above" }, 10.01).met).toBe(
      true,
    )
    expect(evaluateNumber({ ...base, comparison: "below" }, 9.99).met).toBe(
      true,
    )
    expect(evaluateNumber({ ...base, comparison: "below" }, 10).met).toBe(false)
    expect(evaluateNumber({ ...base, comparison: "at_least" }, 10).met).toBe(
      true,
    )
    expect(evaluateNumber({ ...base, comparison: "at_most" }, 10).met).toBe(
      true,
    )
    expect(evaluateNumber({ ...base, comparison: "at_most" }, 10.01).met).toBe(
      false,
    )
    const between = { ...base, comparison: "between" as const, valueHigh: 20 }
    expect(evaluateNumber(between, 10).met).toBe(true)
    expect(evaluateNumber(between, 20).met).toBe(true)
    expect(evaluateNumber(between, 20.5).met).toBe(false)
  })

  it("'between' close call is measured from the nearer edge", () => {
    const between = {
      comparison: "between" as const,
      value: 5,
      valueHigh: 6,
      unit: "%",
      approximate: true,
    }
    expect(evaluateNumber(between, 6.2)).toEqual({
      met: false,
      closeCall: true,
    })
    expect(evaluateNumber(between, 4.8)).toEqual({
      met: false,
      closeCall: true,
    })
    expect(evaluateNumber(between, 6.5)).toEqual({
      met: false,
      closeCall: false,
    })
  })
})

describe("isApproximate", () => {
  it.each([
    "Unemployment hits about 6% by 2028",
    "roughly $200 a share",
    "around 4.5%",
  ])("yes: %s", (text) => expect(isApproximate(text)).toBe(true))

  it.each([
    "Unemployment will hit 6% by 2028",
    "The news is all about rates",
    "They turn it around by 2027",
  ])("no: %s", (text) => expect(isApproximate(text)).toBe(false))
})
