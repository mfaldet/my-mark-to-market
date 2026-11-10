import { resolveDeadline } from "../dates"
import { FIXTURES } from "./fixtures"

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const resolve = (text: string, claimDate: string) =>
  resolveDeadline(text, day(claimDate))?.date.toISOString().slice(0, 10) ?? null

describe("relative dates are resolved against the claim date", () => {
  it('"this year" in a claim dated July 2025 -> Dec 31, 2025', () => {
    expect(resolve("Rates get cut this year", "2025-07-14")).toBe("2025-12-31")
  })

  it("never uses today's date", () => {
    jest.useFakeTimers().setSystemTime(day("2031-03-03"))
    try {
      expect(resolve("Rates get cut this year", "2025-07-14")).toBe(
        "2025-12-31",
      )
      expect(resolve("Rates get cut next month", "2025-07-14")).toBe(
        "2025-08-31",
      )
      expect(resolve("Rates get cut by Friday", "2025-07-14")).toBe(
        "2025-07-18",
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it("the same phrase gives a different date for a different claim date", () => {
    expect(resolve("this year", "2023-02-01")).toBe("2023-12-31")
    expect(resolve("this year", "2026-11-30")).toBe("2026-12-31")
  })

  it.each([
    ["next month", "2025-07-14", "2025-08-31"],
    ["next month", "2025-12-10", "2026-01-31"],
    ["next month", "2024-01-31", "2024-02-29"],
    ["by the end of the month", "2025-07-14", "2025-07-31"],
    ["this quarter", "2025-07-14", "2025-09-30"],
    ["next quarter", "2025-07-14", "2025-12-31"],
    ["next quarter", "2025-11-01", "2026-03-31"],
    ["next year", "2025-07-14", "2026-12-31"],
    ["by year-end", "2025-07-14", "2025-12-31"],
    ["by the end of the year", "2025-07-14", "2025-12-31"],
    ["by December", "2025-07-14", "2025-12-31"],
    ["by December", "2025-12-05", "2025-12-31"],
    ["by March", "2025-07-14", "2026-03-31"],
    ["in Feb", "2027-07-14", "2028-02-29"],
    ["before December", "2025-07-14", "2025-11-30"],
    ["by June 2027", "2025-07-14", "2027-06-30"],
    ["by Q3", "2025-07-14", "2025-09-30"],
    ["by Q1", "2025-07-14", "2026-03-31"],
    ["by Q2 2027", "2025-07-14", "2027-06-30"],
    ["within 6 months", "2025-07-14", "2026-01-14"],
    ["in the next 2 years", "2025-07-14", "2027-07-14"],
    ["in 90 days", "2025-07-14", "2025-10-12"],
  ])("%s (claimed %s) -> %s", (text, claimDate, expected) => {
    expect(resolve(`Rates get cut ${text}`, claimDate)).toBe(expected)
  })
})

describe("fixed dates", () => {
  it.each([
    ["by end of 2027", "2027-12-31"],
    ["in 2026", "2026-12-31"],
    ["before 2028", "2027-12-31"],
    ["by 2027-06-30", "2027-06-30"],
    ["by March 3, 2027", "2027-03-03"],
    ["by December 15", "2025-12-15"],
    ["by tomorrow", "2025-07-15"],
    ["by Friday", "2025-07-18"],
  ])("%s -> %s", (text, expected) => {
    expect(resolve(`Rates get cut ${text}`, "2025-07-14")).toBe(expected)
  })

  it('"by 2028" means end of 2028, flagged as ambiguous', () => {
    const result = resolveDeadline(
      "Unemployment will hit 6% by 2028",
      day("2025-07-14"),
    )
    expect(result?.date.toISOString().slice(0, 10)).toBe("2028-12-31")
    expect(result?.ambiguous).toBe(true)
    expect(result?.phrase).toBe("by 2028")
  })

  it('"by end of 2027" is not ambiguous', () => {
    expect(
      resolveDeadline("down 20% by end of 2027", day("2025-07-14"))?.ambiguous,
    ).toBe(false)
  })
})

describe("things that are not deadlines", () => {
  it("returns null when there is no deadline", () => {
    expect(resolve("The labor market is weakening", "2025-07-14")).toBeNull()
  })

  it('"from today\'s close" is a baseline, not a deadline', () => {
    expect(resolve("S&P 500 falls 20% from today's close", "2025-07-14")).toBe(
      null,
    )
    expect(
      resolve(
        "S&P 500 falls 20% from today's close by end of 2027, likely",
        "2025-07-14",
      ),
    ).toBe("2027-12-31")
  })

  it('the verb "may" is not the month', () => {
    expect(resolve("Unemployment may rise", "2025-07-14")).toBeNull()
  })

  it("numbers in the claim are not dates", () => {
    expect(resolve("Margins of 70.6%", "2025-07-14")).toBeNull()
    expect(resolve("Unemployment will hit 6%", "2025-07-14")).toBeNull()
  })
})

describe("resolveDeadline: fixtures", () => {
  it.each(FIXTURES.map((f) => [f.text, f] as const))("%s", (_text, f) => {
    expect(resolve(f.text, f.claimDate)).toBe(f.expect.deadline)
  })
})
