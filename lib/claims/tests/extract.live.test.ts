/**
 * @jest-environment node
 *
 * Checks the AI step against the real Claude API using the fixtures.
 * Skipped unless you ask for it, because it costs a little and needs a key:
 *
 *   RUN_LIVE_AI=1 ANTHROPIC_API_KEY=... npx jest extract.live
 *
 * It checks the things that must hold (the shape, and that nothing is
 * invented), not exact wording, since wording can vary between runs.
 */
import { extractClaim } from "../extract"
import { FIXTURES } from "./fixtures"

const live =
  process.env.RUN_LIVE_AI === "1" && !!process.env.ANTHROPIC_API_KEY
    ? describe
    : describe.skip

live("extractClaim against the real API", () => {
  jest.setTimeout(60_000)

  it.each(FIXTURES.map((f) => [f.text, f] as const))("%s", async (_t, f) => {
    const result = await extractClaim({
      text: f.text,
      claimDate: new Date(`${f.claimDate}T00:00:00.000Z`),
    })

    expect(result.source).toBe("ai")
    expect(result.shape).toBe(f.extraction.shape)

    // it found every part the fixture expects, and invented none
    const expected = Object.keys(f.extraction.parts).filter(
      (p) => p !== "deadline",
    )
    expect(Object.keys(result.parts).sort()).toEqual(expected.sort())

    // numbers and comparisons must match exactly
    for (const name of ["value", "comparison"] as const) {
      expect(result.parts[name]?.value).toEqual(f.extraction.parts[name]?.value)
    }
  })
})
