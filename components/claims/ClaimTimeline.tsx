import { useState } from "react"
import { TimelineEvent } from "../../lib/claims/service"
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
  text: "Claim text",
  notes: "Notes",
  claimDate: "Claim date",
  deadline: "Deadline",
  shape: "Shape",
  parts: "Outcome",
  approximate: "Approximate",
  confidenceWord: "Confidence word",
  grade: "Grade",
  checkLinkUrl: "Check link",
  checkLinkConfirmedAt: "Check link confirmed",
  parentId: "Parent claim",
  sharedPublicly: "Sharing",
  withdrawnAt: "Withdrawn",
  resolution: "Resolution",
  closeCall: "Close call",
  actualResult: "Actual result",
}

type Parts = Record<string, { value: string | number; status: string }>

function showValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "none"
  if (field === "sharedPublicly") return value ? "public" : "private"
  if (typeof value === "boolean") return value ? "yes" : "no"
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

/**
 * Every version of the claim and every confidence change, oldest first,
 * with a button that recomputes the hash chain.
 */
export function ClaimTimeline({ claimId }: { claimId: string }) {
  const [open, setOpen] = useState(false)
  const timeline = api.claims.timeline.useQuery({ claimId }, { enabled: open })
  const verify = api.claims.verifyHistory.useMutation()

  return (
    <div className="flex flex-col gap-2 text-sm not-prose">
      <div className="flex items-center gap-3">
        <button
          className="btn btn-xs normal-case"
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide history" : "Show history"}
        </button>
        <button
          className="btn btn-xs normal-case"
          disabled={verify.isLoading}
          onClick={() => verify.mutate({ claimId })}
        >
          {verify.isLoading ? "Checking..." : "Verify history"}
        </button>
        {verify.data &&
          (verify.data.ok ? (
            <span
              className="text-green-700"
              title={`Latest hash: ${verify.data.latestHash ?? "none"}`}
            >
              ✓ {verify.data.versions} version
              {verify.data.versions === 1 ? "" : "s"}, chain intact
            </span>
          ) : (
            <span className="text-red-700">
              ✗ Broken at version {verify.data.brokenAtVersion}.{" "}
              {verify.data.problem}
            </span>
          ))}
      </div>

      {open && timeline.data && (
        <ol className="border-l-2 border-neutral-300 ml-2 flex flex-col gap-3">
          {timeline.data.length === 0 && (
            <li className="pl-4 text-neutral-500">
              No history yet. It starts with the next change.
            </li>
          )}
          {timeline.data.map((event: TimelineEvent, i: number) => (
            <li key={i} className="pl-4 relative">
              <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-neutral-400" />
              <div className="text-xs text-neutral-500">{when(event.at)}</div>
              {event.kind === "became" ? (
                <div className="font-semibold">
                  {event.became === "prediction"
                    ? "Became a prediction"
                    : "Became a hunch again"}
                </div>
              ) : event.kind === "confidence" ? (
                <div>
                  Confidence:{" "}
                  <span className="font-semibold">
                    {Math.round(event.probability * 1000) / 10}%
                  </span>
                  {event.word && ` (${CONFIDENCE_LABELS[event.word]})`}
                  {event.note && (
                    <div className="text-neutral-600 italic">
                      “{event.note}”
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <span className="font-semibold">Version {event.version}</span>{" "}
                  <span className="text-neutral-500">
                    via {SOURCE_LABELS[event.source]}
                    {event.version === 1 && " · claim logged"}
                  </span>
                  <ul className="text-neutral-700">
                    {event.changes.flatMap(describe).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <code
                    className="text-[10px] text-neutral-400"
                    title={event.hash}
                  >
                    {event.hash.slice(0, 16)}…
                  </code>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
