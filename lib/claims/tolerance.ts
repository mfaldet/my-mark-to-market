/**
 * Checking a number-by-date claim against what actually happened,
 * including the "about / roughly / around" rule.
 *
 * The score stays strict: the claim is right (YES) or wrong (NO) by its
 * comparison. Separately, a claim hedged with "about", "roughly" or
 * "around" that missed strictly but landed within tolerance is a
 * "close call" (partly right):
 *   - amounts:               within 5% of the number
 *   - rates and percentages: within 0.25 percentage points
 */
import { Comparison } from "./types"

export const AMOUNT_TOLERANCE = 0.05 // 5% of the number
export const RATE_TOLERANCE = 0.25 // percentage points

// avoids 5.75 vs 6 failing on floating-point dust
const EPSILON = 1e-9

/** A unit is a rate when it is a percentage of something. */
export function isRateUnit(unit: string): boolean {
  return /%|percent|percentage|\bpp\b|\bpts?\b|basis points|\bbps\b/i.test(unit)
}

export function isWithinTolerance(
  actual: number,
  target: number,
  unit: string,
): boolean {
  const allowed = isRateUnit(unit)
    ? RATE_TOLERANCE
    : Math.abs(target) * AMOUNT_TOLERANCE
  return Math.abs(actual - target) <= allowed + EPSILON
}

export type NumberOutcome = {
  comparison: Comparison
  value: number
  /** upper bound, only for "between" */
  valueHigh?: number
  unit: string
  /** true if the claim said "about", "roughly" or "around" */
  approximate: boolean
}

export function evaluateNumber(
  outcome: NumberOutcome,
  actual: number,
): { met: boolean; closeCall: boolean } {
  const { comparison, value, valueHigh, unit, approximate } = outcome

  let met: boolean
  // the number(s) a near miss is measured against
  let edges: number[]
  switch (comparison) {
    case "above":
      met = actual > value
      edges = [value]
      break
    case "below":
      met = actual < value
      edges = [value]
      break
    case "at_least":
      met = actual >= value
      edges = [value]
      break
    case "at_most":
      met = actual <= value
      edges = [value]
      break
    case "between": {
      const high = valueHigh ?? value
      met = actual >= Math.min(value, high) && actual <= Math.max(value, high)
      edges = [value, high]
      break
    }
  }

  const closeCall =
    approximate && !met && edges.some((e) => isWithinTolerance(actual, e, unit))

  return { met, closeCall }
}

const APPROXIMATE =
  /\b(about|roughly|around|approximately|approx\.?)\s+[$€£]?\d/i

/** true if the text hedges a number: "about 6%", "roughly $200" */
export function isApproximate(text: string): boolean {
  return APPROXIMATE.test(text)
}
