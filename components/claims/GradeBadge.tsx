import clsx from "clsx"

const COLORS: Record<number, string> = {
  1: "bg-neutral-200 text-neutral-700",
  2: "bg-orange-100 text-orange-800",
  3: "bg-amber-100 text-amber-800",
  4: "bg-lime-100 text-lime-800",
  5: "bg-green-200 text-green-900",
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
  stated: "bg-green-100 text-green-800",
  extracted: "bg-sky-100 text-sky-800",
  working: "bg-amber-100 text-amber-800",
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
        STATUS_COLORS[status] ?? "bg-neutral-100 text-neutral-600",
      )}
    >
      {status}
    </span>
  )
}
