import {
  calendarDay,
  daysBetween,
  describeCalendarDay,
  formatCalendarDay,
  isPastDay,
  localDay,
} from "../calendar"

const ZONES = [
  "America/Chicago",
  "America/Los_Angeles",
  "Pacific/Honolulu",
  "UTC",
  "Europe/London",
  "Asia/Tokyo",
  "Pacific/Auckland",
]

// How a deadline of Dec 31, 2027 is stored
const dec31 = new Date("2027-12-31T00:00:00.000Z")
// When my real entries were looked at: the morning of Nov 11, 2026 in Chicago
const viewedAt = new Date("2026-11-11T15:00:00.000Z")

describe("a stored date is the same calendar day wherever it is viewed", () => {
  it.each(ZONES)("Dec 31, 2027 shows as Dec 31 in %s", (zone) => {
    expect(calendarDay(dec31)).toBe("2027-12-31")
    expect(formatCalendarDay(dec31, viewedAt, zone)).toBe("Dec 31st 2027")
    expect(describeCalendarDay(dec31, viewedAt, zone)).toBe("Dec 31st 2027")
  })

  it("the bug: showing that moment on a Chicago clock gave Dec 30", () => {
    const onAChicagoClock = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
    }).format(dec31)
    // what the old code did, in effect
    expect(onAChicagoClock).toBe("Dec 30")
    // what it does now
    expect(formatCalendarDay(dec31, viewedAt, "America/Chicago")).toBe(
      "Dec 31st 2027",
    )
  })

  it("accepts a YYYY-MM-DD string or a full timestamp string", () => {
    expect(calendarDay("2027-12-31")).toBe("2027-12-31")
    expect(calendarDay("2027-12-31T00:00:00.000Z")).toBe("2027-12-31")
  })

  it("leaves the year off for this year, and gets ordinals right", () => {
    const now = new Date("2026-06-15T12:00:00.000Z")
    expect(formatCalendarDay("2026-12-31", now, "UTC")).toBe("Dec 31st")
    expect(formatCalendarDay("2026-07-02", now, "UTC")).toBe("July 2nd")
    expect(formatCalendarDay("2026-07-23", now, "UTC")).toBe("July 23rd")
    expect(formatCalendarDay("2026-07-11", now, "UTC")).toBe("July 11th")
  })

  it("on New Year's Eve evening in Chicago, Dec 31 is still this year", () => {
    // 9pm on Dec 31, 2027 in Chicago is already Jan 1, 2028 in UTC
    const nye = new Date("2028-01-01T03:00:00.000Z")
    expect(formatCalendarDay(dec31, nye, "America/Chicago")).toBe("Dec 31st")
    expect(describeCalendarDay(dec31, nye, "America/Chicago")).toBe("today")
    expect(describeCalendarDay(dec31, nye, "Asia/Tokyo")).toBe("yesterday")
  })
})

describe("today is the day it is where I am", () => {
  // 8:30pm on Nov 10 in Chicago; already Nov 11 in UTC, London and Tokyo
  const evening = new Date("2026-11-11T02:30:00.000Z")

  it.each([
    ["America/Chicago", "2026-11-10"],
    ["America/Los_Angeles", "2026-11-10"],
    ["Pacific/Honolulu", "2026-11-10"],
    ["UTC", "2026-11-11"],
    ["Europe/London", "2026-11-11"],
    ["Asia/Tokyo", "2026-11-11"],
    ["Pacific/Auckland", "2026-11-11"],
  ])("in %s it is %s", (zone, day) => {
    expect(localDay(evening, zone)).toBe(day)
  })

  it("something due Nov 10 is due today that evening in Chicago, and not yet past", () => {
    expect(describeCalendarDay("2026-11-10", evening, "America/Chicago")).toBe(
      "today",
    )
    expect(isPastDay("2026-11-10", evening, "America/Chicago")).toBe(false)
    // the old check compared moments: midnight UTC had long passed
    expect(new Date("2026-11-10T00:00:00.000Z") < evening).toBe(true)
    // in Tokyo it really is the next day
    expect(isPastDay("2026-11-10", evening, "Asia/Tokyo")).toBe(true)
  })

  it("it is past the day after, in my zone", () => {
    // 12:30am on Nov 11 in Chicago
    const afterMidnight = new Date("2026-11-11T06:30:00.000Z")
    expect(isPastDay("2026-11-10", afterMidnight, "America/Chicago")).toBe(true)
    expect(
      describeCalendarDay("2026-11-10", afterMidnight, "America/Chicago"),
    ).toBe("yesterday")
  })

  it.each(ZONES)("near dates read in whole days in %s", (zone) => {
    // a moment that is Nov 11 in every zone listed, from Honolulu to Auckland
    const now = new Date("2026-11-11T10:30:00.000Z")
    expect(localDay(now, zone)).toBe("2026-11-11")
    expect(describeCalendarDay("2026-11-11", now, zone)).toBe("today")
    expect(describeCalendarDay("2026-11-12", now, zone)).toBe("tomorrow")
    expect(describeCalendarDay("2026-11-16", now, zone)).toBe("in 5 days")
    expect(describeCalendarDay("2026-11-08", now, zone)).toBe("3 days ago")
    expect(describeCalendarDay("2027-12-31", now, zone)).toBe("Dec 31st 2027")
  })

  it("counts whole days across a daylight-saving change", () => {
    expect(daysBetween("2027-03-13", "2027-03-15")).toBe(2)
    expect(daysBetween("2026-11-11", "2027-12-31")).toBe(415)
  })
})
