/**
 * Example claims used across the tests.
 *
 * "extraction" is what the AI step is expected to pull from the text
 * (shape + parts marked "extracted"). The grading tests feed it straight
 * to the grader, so they run with no AI and no network. The same fixtures
 * can later be used to check the AI step's output.
 */
import { ClaimShape, ConfidenceWord } from "@prisma/client"
import { OutcomeParts } from "../types"

export type ClaimFixture = {
  text: string
  /** ISO day the claim was made */
  claimDate: string
  extraction: { shape: ClaimShape; parts: OutcomeParts }
  expect: {
    grade: number
    /** ISO day, or null if the text has no deadline */
    deadline: string | null
    confidence: ConfidenceWord | { percent: number } | null
    canPublish: boolean
  }
}

const x = (value: string | number) => ({ value, status: "extracted" as const })

export const FIXTURES: ClaimFixture[] = [
  {
    text: "The labor market is weakening",
    claimDate: "2025-07-14",
    extraction: { shape: "FREE_TEXT", parts: {} },
    expect: { grade: 1, deadline: null, confidence: null, canPublish: false },
  },
  {
    // Every part can be pulled from the text, so it is complete (grade 4).
    // But which unemployment rate, and whether "hit" means "at least", are
    // the AI's reading, not mine - so it cannot be published until I
    // confirm them. "by 2028" is also flagged as ambiguous.
    text: "Unemployment will hit 6% by 2028",
    claimDate: "2025-07-14",
    extraction: {
      shape: "NUMBER_BY_DATE",
      parts: {
        measure: x("unemployment rate"),
        comparison: x("at_least"),
        value: x(6),
        unit: x("%"),
        deadline: x("2028-12-31"),
      },
    },
    expect: {
      grade: 4,
      deadline: "2028-12-31",
      confidence: null,
      canPublish: false,
    },
  },
  {
    text: "S&P 500 falls 20% from today's close by end of 2027, likely",
    claimDate: "2025-07-14",
    extraction: {
      shape: "NUMBER_BY_DATE",
      parts: {
        measure: x("S&P 500 index level"),
        comparison: x("at_least"),
        value: x(20),
        unit: x("% decline"),
        baseline: x("close on 2025-07-14"),
        deadline: x("2027-12-31"),
      },
    },
    expect: {
      grade: 4,
      deadline: "2027-12-31",
      confidence: "LIKELY",
      canPublish: false,
    },
  },
  {
    // 70.6% is a number in the claim, not a confidence. No comparison
    // word, so the claim is incomplete.
    text: "Margins of 70.6% next quarter",
    claimDate: "2025-07-14",
    extraction: {
      shape: "NUMBER_BY_DATE",
      parts: {
        measure: x("margins"),
        value: x(70.6),
        unit: x("%"),
        deadline: x("2025-12-31"),
      },
    },
    expect: {
      grade: 3,
      deadline: "2025-12-31",
      confidence: null,
      canPublish: false,
    },
  },
  {
    text: "Rates get cut this year",
    claimDate: "2025-07-14",
    extraction: {
      shape: "EVENT_BY_DATE",
      parts: { event: x("rates get cut"), deadline: x("2025-12-31") },
    },
    expect: {
      grade: 4,
      deadline: "2025-12-31",
      confidence: null,
      canPublish: false,
    },
  },
  {
    // shape picked, but no way of measuring "beats"
    text: "Nvidia beats AMD next year, 70% chance",
    claimDate: "2025-07-14",
    extraction: {
      shape: "A_BEATS_B",
      parts: { a: x("Nvidia"), b: x("AMD"), deadline: x("2026-12-31") },
    },
    expect: {
      grade: 3,
      deadline: "2026-12-31",
      confidence: { percent: 70 },
      canPublish: false,
    },
  },
  {
    // shape picked, but nothing says what is being measured
    text: "It will be above 5% by December",
    claimDate: "2025-07-14",
    extraction: {
      shape: "NUMBER_BY_DATE",
      parts: {
        comparison: x("above"),
        value: x(5),
        unit: x("%"),
        deadline: x("2025-12-31"),
      },
    },
    expect: {
      grade: 2,
      deadline: "2025-12-31",
      confidence: null,
      canPublish: false,
    },
  },
]
