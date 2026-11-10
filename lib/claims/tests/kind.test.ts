import { isImported, kindChanges, kindForGrade } from "../kind"

describe("hunch or prediction", () => {
  it("grades 1 to 3 are hunches, 4 and 5 are predictions", () => {
    expect([1, 2, 3].map(kindForGrade)).toEqual(["hunch", "hunch", "hunch"])
    expect([4, 5].map(kindForGrade)).toEqual(["prediction", "prediction"])
    expect(kindForGrade(null)).toBe("hunch")
  })

  it("finds the moment a hunch becomes a prediction, and when it drops back", () => {
    const history = [1, 2, 2, 4, 4, 5, 3, 4].map((grade, i) => ({ grade, i }))
    expect(kindChanges(history).map((c) => [c.entry.i, c.became])).toEqual([
      [3, "prediction"],
      [6, "hunch"],
      [7, "prediction"],
    ])
  })

  it("an item logged straight in as a prediction never 'became' one", () => {
    expect(kindChanges([{ grade: 4 }, { grade: 4 }, { grade: 5 }])).toEqual([])
    expect(kindChanges([])).toEqual([])
  })

  it("recognises imported entries by their id", () => {
    expect(isImported("pb__user1_123")).toBe(true)
    expect(isImported("cs__user1_abc")).toBe(true)
    expect(isImported("cmw9ruihv0002cagsajoh5p7k")).toBe(false)
  })
})
