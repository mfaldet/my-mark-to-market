import { readConfidence } from "../confidence"
import { describeDue } from "../due"
import {
  dayIn,
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  localToday,
  timeZoneOrDefault,
} from "../timezone"

describe("what day it is, where I am", () => {
  // the first real entries were logged at 8:30pm Central on Nov 10, 2026
  const evening = new Date("2026-11-11T02:30:00.000Z")

  it("8:30pm on Nov 10 in Chicago is Nov 10, though UTC says Nov 11", () => {
    expect(dayIn("America/Chicago", evening)).toBe("2026-11-10")
    expect(dayIn("UTC", evening)).toBe("2026-11-11")
    expect(dayIn("Asia/Tokyo", evening)).toBe("2026-11-11")
  })

  it("follows daylight saving time", () => {
    // 11:30pm CDT on July 4 is 04:30 UTC on July 5
    expect(dayIn("America/Chicago", new Date("2026-07-05T04:30:00.000Z"))).toBe(
      "2026-07-04",
    )
    // 12:30am CDT on July 5
    expect(dayIn("America/Chicago", new Date("2026-07-05T05:30:00.000Z"))).toBe(
      "2026-07-05",
    )
  })

  it("defaults to America/Chicago, and falls back to it for a zone that does not exist", () => {
    expect(DEFAULT_TIME_ZONE).toBe("America/Chicago")
    expect(isValidTimeZone("Europe/London")).toBe(true)
    expect(isValidTimeZone("Mars/Olympus")).toBe(false)
    expect(isValidTimeZone("")).toBe(false)
    expect(timeZoneOrDefault("Mars/Olympus")).toBe("America/Chicago")
    expect(timeZoneOrDefault(null)).toBe("America/Chicago")
    expect(timeZoneOrDefault("Europe/London")).toBe("Europe/London")
  })

  it("due lines count from my today", () => {
    const deadline = new Date("2026-11-10T00:00:00.000Z")
    expect(describeDue(deadline, localToday("America/Chicago", evening))).toBe(
      "due today",
    )
    expect(describeDue(deadline, localToday("UTC", evening))).toBe(
      "overdue by 1 day",
    )
  })
})

describe("reading a confidence said on its own", () => {
  it.each([
    ["30%", 0.3],
    ["30 %", 0.3],
    ["30 percent", 0.3],
    ["0.3", 0.3],
    [".3", 0.3],
    [0.3, 0.3],
    ["0", 0],
    ["100%", 1],
    ["12.5%", 0.125],
  ])("%j is a number", (raw, probability) => {
    expect(readConfidence(raw)).toEqual({ ok: true, probability })
  })

  it.each([
    ["likely", "LIKELY"],
    ["Very Likely", "VERY_LIKELY"],
    ["toss-up", "TOSS_UP"],
    ["toss up", "TOSS_UP"],
    ["TOSS_UP", "TOSS_UP"],
    ["almost no chance", "ALMOST_NO_CHANCE"],
    ["probably", "LIKELY"],
  ])("%j is a word", (raw, word) => {
    expect(readConfidence(raw)).toEqual({ ok: true, word })
  })

  it.each(["3", 3, "70", "1", 1, "2.5"])(
    "a bare %j is not guessed at",
    (raw) => {
      const reading = readConfidence(raw)
      expect(reading.ok).toBe(false)
      expect(!reading.ok && reading.error).toMatch(
        /Ask the user what they mean/,
      )
    },
  )

  it("refuses nonsense and impossible percentages", () => {
    expect(readConfidence("maybe").ok).toBe(false)
    expect(readConfidence("130%").ok).toBe(false)
  })
})
