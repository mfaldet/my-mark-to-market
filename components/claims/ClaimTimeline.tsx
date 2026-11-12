import clsx from "clsx"
import { TimelineEvent } from "../../lib/claims/service"
import { resultLabel } from "../../lib/claims/words"
import { api } from "../../lib/web/trpc"
import {
  COMPARISON_LABELS,
  CONFIDENCE_LABELS,
  formatDay,
  PART_LABELS,
  SHAPE_LABELS,
  SOURCE_LABELS,
} from "./labels"

const FIELD_LABELS: Record<string, string> = {
  text: "My words",
  headline: "Headline",
  notes: "Notes",
  claimDate: "Date said",
  deadline: "Deadline",
  shape: "Shape",
  parts: "Outcome",
  approximate: "Approximate",
  confidenceWord: "Confidence word",
  grade: "Grade",
  checkLinkUrl: "Check link",
  checkLinkConfirmedAt: "Check link confirmed",
  parentId: "Grew out of",
  sharedPublicly: "Sharing",
  withdrawnAt: "Withdrawn",
  resolution: "Result",
  closeCall: "Close call",
  actualResult: "Actual result",
}

type Parts = Record<string, { value: string | number; status: string }>

function showValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "none"
  if (field === "sharedPublicly") return value ? "public" : "private"
  if (typeof value === "boolean") return value ? "yes" : "no"
  if (field === "resolution") return resultLabel(String(value)).toLowerCase()
  if (field === "shape") return SHAPE_LABELS[value as keyof typeof SHAPE_LABELS]
  if (field === "confidenceWord") {
    return CONFIDENCE_LABELS[value as keyof typeof CONFIDENCE_LABELS]
  }
  if (
    ["claimDate", "deadline", "checkLinkConfirmedAt", "withdrawnAt"].includes(
      field,
    )
  ) {
    return formatDay(String(value).slice(0, 10))
  }
  return String(value)
}

function showPart(
  name: string,
  part?: { value: string | number; status: string },
) {
  if (!part) return "none"
  const value =
    name === "comparison"
      ? COMPARISON_LABELS[String(part.value)] ?? part.value
      : name === "deadline"
        ? formatDay(String(part.value))
        : part.value
  return `${value} (${part.status})`
}

/** One line per thing that changed, in plain words. */
function describe(change: { field: string; from: unknown; to: unknown }) {
  if (change.field !== "parts") {
    return [
      `${FIELD_LABELS[change.field] ?? change.field}: ${showValue(
        change.field,
        change.from,
      )} → ${showValue(change.field, change.to)}`,
    ]
  }
  const from = (change.from ?? {}) as Parts
  const to = (change.to ?? {}) as Parts
  return Array.from(new Set([...Object.keys(from), ...Object.keys(to)]))
    .filter((name) => JSON.stringify(from[name]) !== JSON.stringify(to[name]))
    .map(
      (name) =>
        `${PART_LABELS[name] ?? name}: ${showPart(name, from[name])} → ${showPart(
          name,
          to[name],
        )}`,
    )
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

/** A confidence change of 20 points or more from the one before it. */
const BIG_SWING = 0.2
function isBigSwing(events: TimelineEvent[], i: number) {
  const event = events[i]
  if (event.kind !== "confidence") return false
  for (let k = i - 1; k >= 0; k--) {
    const earlier = events[k]
    if (earlier.kind === "confidence") {
      return Math.abs(event.probability - earlier.probability) >= BIG_SWING
    }
  }
  return false
}

/**
 * Every version of the item and every confidence change, oldest first.
 * Opened from the card's menu.
 */
export function TimelineList({ claimId }: { claimId: string }) {
  const timeline = api.claims.timeline.useQuery({ claimId })
  if (!timeline.data) {
    return <p className="m-0 text-sm text-neutral-500">Loading history...</p>
  }
  return (
    <div className="text-sm not-prose">
      <ol className="border-l-2 border-neutral-300 ml-2 flex flex-col gap-3">
        {timeline.data.length === 0 && (
          <li className="pl-4 text-neutral-500">
            No history yet. It starts with the next change.
          </li>
        )}
        {timeline.data.map((event: TimelineEvent, i: number) => (
          <li key={i} className="pl-4 relative">
            <span
              className={clsx(
                "absolute -left-[5px] top-1.5 h-2 w-2 rounded-full",
                // yellow = a change worth noticing
                event.kind === "became" || isBigSwing(timeline.data, i)
                  ? "bg-change ring-2 ring-change/30"
                  : "bg-neutral-400",
              )}
            />
            <div className="text-xs text-neutral-500">{when(event.at)}</div>
            {event.kind === "became" ? (
              <div>
                <span className="tone-change rounded px-1.5 py-0.5 font-semibold">
                  {event.became === "prediction"
                    ? "Became checkable"
                    : "No longer checkable"}
                </span>
              </div>
            ) : event.kind === "confidence" ? (
              <div>
                Confidence:{" "}
                <span className="num font-semibold">
                  {Math.round(event.probability * 1000) / 10}%
                </span>
                {isBigSwing(timeline.data, i) && (
                  <span className="tone-change rounded px-1.5 py-0.5 ml-2 text-xs font-semibold">
                    big swing
                  </span>
                )}
                {event.word && ` · ${CONFIDENCE_LABELS[event.word]}`}
                {event.note && (
                  <div className="text-neutral-600 italic">“{event.note}”</div>
                )}
              </div>
            ) : (
              <div>
                <span className="font-semibold">Version {event.version}</span>{" "}
                <span className="text-neutral-500">
                  {event.source === "SYSTEM"
                    ? "by the app"
                    : `via ${SOURCE_LABELS[event.source]}`}
                  {event.version === 1 && " · logged"}
                </span>
                {event.source === "SYSTEM" && (
                  <div className="text-neutral-600 italic">
                    {[
                      event.changedFields.includes("claimDate") &&
                        "The date was stamped a day ahead of your time zone and has been corrected.",
                      event.changedFields.includes("grade") &&
                        "Re-graded after the grading rules changed.",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </div>
                )}
                <ul className="text-neutral-700">
                  {event.changes.flatMap(describe).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <code
                  className="text-[11px] text-neutral-500"
                  title={event.hash}
                >
                  {event.hash.slice(0, 16)}…
                </code>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
