import {
  daysToDeadline,
  describeDue,
  dueSoonCutoff,
  dueStatus,
  startOfToday,
} from "../due"

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
// the daily job runs at 01:00 UTC; a late-evening time checks the same day holds
const now = new Date("2026-12-31T01:00:00.000Z")
const lateEvening = new Date("2026-12-31T23:30:00.000Z")

describe("what's due", () => {
  it("the deadline day itself still counts", () => {
    expect(dueStatus(day("2026-12-31"), now)).toBe("due soon")
    expect(dueStatus(day("2026-12-31"), lateEvening)).toBe("due soon")
    expect(describeDue(day("2026-12-31"), lateEvening)).toBe("due today")
  })

  it("a claim becomes overdue the day after its deadline", () => {
    expect(dueStatus(day("2026-12-30"), now)).toBe("overdue")
    expect(describeDue(day("2026-12-30"), now)).toBe("overdue by 1 day")
    expect(describeDue(day("2026-12-01"), now)).toBe("overdue by 30 days")
  })

  it("due soon means within 7 days, counting today", () => {
    expect(dueStatus(day("2027-01-07"), now)).toBe("due soon")
    expect(describeDue(day("2027-01-07"), now)).toBe("due in 7 days")
    expect(dueStatus(day("2027-01-08"), now)).toBeNull()
    expect(dueStatus(day("2027-01-03"), now, 2)).toBeNull()
  })

  it("counts whole calendar days whatever the time of day", () => {
    expect(daysToDeadline(day("2027-01-01"), now)).toBe(1)
    expect(daysToDeadline(day("2027-01-01"), lateEvening)).toBe(1)
    expect(daysToDeadline(new Date("2027-01-01T18:00:00Z"), now)).toBe(1)
  })

  it("gives the database the matching cut-off dates", () => {
    expect(startOfToday(lateEvening)).toEqual(day("2026-12-31"))
    expect(dueSoonCutoff(lateEvening)).toEqual(day("2027-01-07"))
    expect(dueSoonCutoff(now, 30)).toEqual(day("2027-01-30"))
  })
})
