/**
 * @jest-environment node
 */
jest.mock("../../prisma", () => ({ __esModule: true, default: {} }))
jest.mock("node-fetch", () => ({ __esModule: true, default: jest.fn() }))
jest.mock("trpc-transformer", () => ({ __esModule: true, default: {} }))

import {
  scrubHiddenForecastsAndSensitiveDetailsFromQuestion,
  withoutPrivateNotes,
} from "../question_router"

const published = () =>
  ({
    id: "q1",
    userId: "owner",
    title: "Rates get cut",
    sharedPublicly: true,
    notes: "my private starting note",
    comment: null,
    hideForecastsUntil: null,
    hideForecastsUntilPrediction: false,
    comments: [
      {
        id: 1,
        comment: "a private note",
        userId: "owner",
        user: { id: "owner" },
      },
    ],
    forecasts: [
      {
        id: 1,
        userId: "owner",
        forecast: 0.7,
        comment: "why I changed my mind",
        user: { id: "owner" },
      },
    ],
    options: [],
  }) as any

describe("notes on a published prediction", () => {
  it.each([
    ["a signed-out visitor", undefined],
    ["someone else", "stranger"],
  ])("%s gets the prediction and none of the notes", (_who, viewer) => {
    const seen = scrubHiddenForecastsAndSensitiveDetailsFromQuestion(
      published(),
      viewer,
    ) as any
    expect(seen.title).toBe("Rates get cut")
    expect(seen.forecasts[0].forecast).toBe(0.7)
    expect(seen.notes).toBeNull()
    expect(seen.comments).toEqual([])
    expect(seen.forecasts[0].comment).toBeNull()
    const text = JSON.stringify(seen)
    for (const secret of [
      "my private starting note",
      "a private note",
      "why I changed my mind",
    ]) {
      expect(text).not.toContain(secret)
    }
  })

  it("the owner still gets every note", () => {
    const seen = scrubHiddenForecastsAndSensitiveDetailsFromQuestion(
      published(),
      "owner",
    ) as any
    expect(seen.notes).toBe("my private starting note")
    expect(seen.comments).toHaveLength(1)
    expect(seen.forecasts[0].comment).toBe("why I changed my mind")
  })

  it("strips notes inside options too, and leaves the original untouched", () => {
    const q = {
      ...published(),
      options: [{ id: "o1", forecasts: [{ comment: "an option note" }] }],
    }
    const seen = withoutPrivateNotes(q)
    expect(JSON.stringify(seen)).not.toContain("an option note")
    expect(q.options[0].forecasts[0].comment).toBe("an option note")
  })
})
