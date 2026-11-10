import { ClaimShape } from "@prisma/client"
import clsx from "clsx"
import { useState } from "react"
import { toast } from "react-hot-toast"
import { ClaimView } from "../../lib/claims/service"
import { allowedParts, COMPARISONS, SHAPE_PARTS } from "../../lib/claims/types"
import { api } from "../../lib/web/trpc"
import { ClaimTimeline } from "./ClaimTimeline"
import { ConfidenceRow } from "./ConfidenceRow"
import { EngineQuestionCard } from "./EngineQuestionCard"
import { GradeBadge, StatusChip } from "./GradeBadge"
import {
  COMPARISON_LABELS,
  formatDay,
  PART_LABELS,
  SHAPE_LABELS,
  SOURCE_LABELS,
  STATUS_HELP,
} from "./labels"

/**
 * Everything the claim standard adds to a question: grade, the engine's
 * question, the outcome parts with their status, the check link and the
 * public/private switch. Shown to the claim's owner.
 */
export function ClaimPanel({
  claimId,
  initial,
}: {
  claimId: string
  initial?: ClaimView
}) {
  const utils = api.useContext()
  const query = api.claims.get.useQuery(
    { claimId },
    { initialData: initial, retry: false },
  )
  const claim = query.data

  const after = {
    onSuccess: async () => {
      await utils.claims.invalidate()
      await utils.question.invalidate()
    },
    onError: (error: { message: string }) => {
      // a blocked save explains itself, one reason per line
      toast.error(error.message, { duration: 8000 })
    },
  }
  const setShape = api.claims.setShape.useMutation(after)
  const setPart = api.claims.setPart.useMutation(after)
  const confirmPart = api.claims.confirmPart.useMutation(after)
  const setCheckLink = api.claims.setCheckLink.useMutation(after)
  const confirmCheckLink = api.claims.confirmCheckLink.useMutation(after)
  const setPublic = api.claims.setPublic.useMutation(after)

  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [linkDraft, setLinkDraft] = useState<string | null>(null)

  if (!claim) return null
  const shape = claim.shape ?? "FREE_TEXT"
  const locked = claim.resolved || claim.withdrawn
  const partNames = allowedParts(shape).filter(
    (name) =>
      (SHAPE_PARTS[shape].required as readonly string[]).includes(name) ||
      claim.parts[name as keyof typeof claim.parts] !== undefined ||
      (name === "valueHigh"
        ? claim.parts.comparison?.value === "between"
        : name !== "valueHigh"),
  )

  const display = (name: string, value: string | number) =>
    name === "comparison"
      ? COMPARISON_LABELS[String(value)] ?? String(value)
      : name === "deadline"
        ? formatDay(String(value))
        : String(value)

  return (
    <div className="flex flex-col gap-3 text-sm not-prose border-t border-neutral-200 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <GradeBadge grade={claim.grade} reason={claim.gradeReason} />
        {claim.imported && (
          <span
            className="rounded border border-neutral-300 px-1 text-xs text-neutral-500"
            title="Brought in by an importer, not logged here in advance. It has no version history from before the import."
          >
            imported
          </span>
        )}
        <span className="text-neutral-500">{claim.gradeReason}</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span>
          Said {formatDay(claim.claimDate)}
          {claim.backDated && (
            <span
              className="ml-1 rounded bg-neutral-200 px-1 text-neutral-700"
              title={`Logged ${formatDay(claim.loggedAt.slice(0, 10))}. Scored from the logged date.`}
            >
              back-dated
            </span>
          )}
        </span>
        <span>
          {claim.deadlineKind === "deadline" ? "Deadline" : "Check back by"}{" "}
          {formatDay(claim.deadline)}
        </span>
        {claim.entrySource && (
          <span>Logged via {SOURCE_LABELS[claim.entrySource]}</span>
        )}
        {claim.approximate && <span>{'Approximate ("about")'}</span>}
        {claim.closeCall && (
          <span className="rounded bg-amber-100 px-1 text-amber-800">
            close call{claim.actualResult ? `: ${claim.actualResult}` : ""}
          </span>
        )}
      </div>

      {!locked && <EngineQuestionCard claim={claim} />}

      <div className="flex items-center gap-2">
        <label className="text-neutral-500 w-24 sm:w-36 shrink-0">Shape</label>
        <select
          className="select select-sm select-bordered min-w-0 shrink"
          value={shape}
          disabled={locked || setShape.isLoading}
          onChange={(e) =>
            setShape.mutate({
              claimId,
              shape: e.target.value as ClaimShape,
            })
          }
        >
          {Object.entries(SHAPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {claim.shape === null && (
          <span className="text-xs text-neutral-400">
            not picked yet: choose one to start sharpening this hunch
          </span>
        )}
      </div>

      {partNames.map((name) => {
        const part = claim.parts[name as keyof typeof claim.parts]
        const isEditing = editing === name
        // no date of my own yet: the app's default check-back date applies
        const defaultDate = name === "deadline" && !part
        return (
          <div key={name} className="flex items-center gap-2 min-h-8">
            <span className="text-neutral-500 w-24 sm:w-36 shrink-0">
              {name === "deadline" && claim.deadlineKind !== "deadline"
                ? "Check back by"
                : PART_LABELS[name] ?? name}
            </span>
            {isEditing ? (
              <form
                className="flex gap-2 grow"
                onSubmit={(e) => {
                  e.preventDefault()
                  const numeric = name === "value" || name === "valueHigh"
                  setPart.mutate(
                    {
                      claimId,
                      part: name,
                      value:
                        draft.trim() === ""
                          ? null
                          : numeric
                            ? parseFloat(draft)
                            : draft.trim(),
                    },
                    { onSuccess: () => setEditing(null) },
                  )
                }}
              >
                {name === "comparison" ? (
                  <select
                    className="select select-sm select-bordered"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  >
                    <option value="">(none)</option>
                    {COMPARISONS.map((c) => (
                      <option key={c} value={c}>
                        {COMPARISON_LABELS[c]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    autoFocus
                    className="input input-sm input-bordered grow"
                    type={
                      name === "deadline"
                        ? "date"
                        : name === "value" || name === "valueHigh"
                          ? "number"
                          : "text"
                    }
                    step="any"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                )}
                <button className="btn btn-sm normal-case" type="submit">
                  Save
                </button>
                <button
                  className="btn btn-sm btn-ghost normal-case"
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span
                  className={clsx(
                    !part && !defaultDate && "text-neutral-400 italic",
                  )}
                >
                  {part
                    ? display(name, part.value)
                    : defaultDate
                      ? formatDay(claim.deadline)
                      : (
                            SHAPE_PARTS[shape].required as readonly string[]
                          ).includes(name) || name === "valueHigh"
                        ? "missing"
                        : "not set"}
                </span>
                {defaultDate && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600"
                    title="You didn't set a date, so the app picked this one. Change it any time."
                  >
                    default
                  </span>
                )}
                {part && (
                  <StatusChip
                    status={part.status}
                    title={STATUS_HELP[part.status]}
                  />
                )}
                {!locked && (
                  <span className="flex gap-1 ml-auto">
                    {part && part.status !== "stated" && (
                      <button
                        className="btn btn-xs normal-case"
                        disabled={confirmPart.isLoading}
                        onClick={() =>
                          confirmPart.mutate({ claimId, part: name })
                        }
                      >
                        Confirm
                      </button>
                    )}
                    <button
                      className="btn btn-xs btn-ghost normal-case"
                      onClick={() => {
                        setDraft(
                          part
                            ? String(part.value)
                            : defaultDate
                              ? claim.deadline
                              : "",
                        )
                        setEditing(name)
                      }}
                    >
                      {part ? "Edit" : defaultDate ? "Change" : "Add"}
                    </button>
                  </span>
                )}
              </>
            )}
          </div>
        )
      })}

      <ConfidenceRow claim={claim} />

      <div className="flex items-center gap-2 min-h-8">
        <span className="text-neutral-500 w-24 sm:w-36 shrink-0">
          Check link
        </span>
        {linkDraft !== null ? (
          <form
            className="flex gap-2 grow"
            onSubmit={(e) => {
              e.preventDefault()
              setCheckLink.mutate(
                { claimId, url: linkDraft.trim() || null },
                { onSuccess: () => setLinkDraft(null) },
              )
            }}
          >
            <input
              autoFocus
              className="input input-sm input-bordered grow"
              type="url"
              placeholder="https://fred.stlouisfed.org/series/UNRATE"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
            />
            <button className="btn btn-sm normal-case" type="submit">
              Save
            </button>
            <button
              className="btn btn-sm btn-ghost normal-case"
              type="button"
              onClick={() => setLinkDraft(null)}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            {claim.checkLinkUrl ? (
              <a
                className="link truncate max-w-[16rem]"
                href={claim.checkLinkUrl}
                target="_blank"
                rel="noreferrer"
              >
                {claim.checkLinkUrl}
              </a>
            ) : (
              <span className="text-neutral-400 italic">none</span>
            )}
            {claim.checkLinkUrl && (
              <StatusChip
                status={claim.checkLinkConfirmed ? "stated" : "working"}
                title={
                  claim.checkLinkConfirmed
                    ? "You opened this and confirmed it shows the thing measured"
                    : "Open it, check it shows the thing measured, then confirm"
                }
              />
            )}
            {!locked && (
              <span className="flex gap-1 ml-auto">
                {claim.checkLinkUrl && !claim.checkLinkConfirmed && (
                  <button
                    className="btn btn-xs normal-case"
                    title="Only confirm once you have opened the link"
                    onClick={() => confirmCheckLink.mutate({ claimId })}
                  >
                    {"I opened it, it's right"}
                  </button>
                )}
                <button
                  className="btn btn-xs btn-ghost normal-case"
                  onClick={() => setLinkDraft(claim.checkLinkUrl ?? "")}
                >
                  {claim.checkLinkUrl ? "Edit" : "Add"}
                </button>
              </span>
            )}
          </>
        )}
      </div>

      {(claim.parent || claim.children.length > 0) && (
        <div className="flex flex-col gap-1 text-xs text-neutral-500">
          {claim.parent && (
            <span>
              Grew out of:{" "}
              <a className="link" href={`/q/${claim.parent.id}`}>
                {claim.parent.text}
              </a>
            </span>
          )}
          {claim.children.map((child) => (
            <span key={child.id}>
              Sharpened into:{" "}
              <a className="link" href={`/q/${child.id}`}>
                {child.text}
              </a>
            </span>
          ))}
        </div>
      )}

      {!claim.withdrawn && (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={claim.sharedPublicly}
              disabled={
                setPublic.isLoading ||
                (!claim.sharedPublicly && !claim.canPublish)
              }
              onChange={(e) =>
                setPublic.mutate({ claimId, sharedPublicly: e.target.checked })
              }
            />
            <span>
              Public{" "}
              <span className="text-neutral-400">
                (private unless you tick this; only a prediction with every part
                confirmed can be public)
              </span>
            </span>
          </label>
          {!claim.sharedPublicly && !claim.canPublish && (
            <ul className="text-xs text-neutral-500 list-disc ml-8">
              {claim.publishBlockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ClaimTimeline claimId={claimId} />
    </div>
  )
}
