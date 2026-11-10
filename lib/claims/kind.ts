/**
 * The two words this app uses.
 *
 *   hunch      - anything I log. Private, can be loose. Grades 1 to 3.
 *   prediction - a hunch sharpened until it can be checked: an outcome, a
 *                deadline and a way to tell. Grades 4 and 5. Only
 *                predictions can be published, resolved and scored.
 *
 * It is the same item throughout: a hunch that reaches grade 4 becomes a
 * prediction, and one edited back below grade 4 becomes a hunch again.
 *
 * In the code and the API the item is still called a "claim" (and, in
 * Fatebook's own code, a "question"). Those names never reach the screen.
 */

export type Kind = "hunch" | "prediction"

export const PREDICTION_GRADE = 4

export function kindForGrade(grade: number | null | undefined): Kind {
  return (grade ?? 1) >= PREDICTION_GRADE ? "prediction" : "hunch"
}

/**
 * Fatebook's importers (PredictionBook, spreadsheet) give their rows ids
 * with these prefixes. Imported entries were not logged here in advance
 * and have no version history, so they are always labelled "imported".
 */
const IMPORT_ID_PREFIXES = ["pb_", "cs_"]

export function isImported(id: string): boolean {
  return IMPORT_ID_PREFIXES.some((prefix) => id.startsWith(prefix))
}

/**
 * Reads a grade history (oldest first) and returns each point where the
 * item changed kind. The first entry never counts: an item logged
 * straight in as a prediction did not "become" one.
 */
export function kindChanges<T extends { grade: number | null }>(
  history: T[],
): { entry: T; became: Kind }[] {
  const changes: { entry: T; became: Kind }[] = []
  for (let i = 1; i < history.length; i++) {
    const before = kindForGrade(history[i - 1].grade)
    const after = kindForGrade(history[i].grade)
    if (before !== after) changes.push({ entry: history[i], became: after })
  }
  return changes
}
