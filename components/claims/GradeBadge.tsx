import clsx from "clsx"

// No colour for a grade. Grades 1 to 3 are hunches (outlined);
// grades 4 and 5 are predictions (solid).
const HUNCH = "border border-dashed border-neutral-400 text-neutral-600"
const PREDICTION = "border border-ink bg-ink text-white"
const COLORS: Record<number, string> = {
  1: HUNCH,
  2: HUNCH,
  3: HUNCH,
  4: PREDICTION,
  5: PREDICTION,
}

/** The claim's grade, 1 to 5. Hover to see why. */
export function GradeBadge({
  grade,
  reason,
}: {
  grade: number
  reason?: string
}) {
  return (
    <span
      title={reason}
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        COLORS[grade] ?? COLORS[1],
      )}
    >
      Grade {grade}
    </span>
  )
}

const STATUS_COLORS: Record<string, string> = {
  stated: "tone-plain",
  // yellow: not yet confirmed
  extracted: "tone-change",
  working: "tone-change",
}

/** stated / extracted / working */
export function StatusChip({
  status,
  title,
}: {
  status: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium",
        STATUS_COLORS[status] ?? "tone-plain",
      )}
    >
      {status}
    </span>
  )
}
