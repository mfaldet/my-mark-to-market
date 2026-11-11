import { ClaimShape } from "@prisma/client"
import { ReactNode, useState } from "react"
import { ClaimPreview } from "../../lib/claims/service"
import { COMPARISONS, SHAPE_PARTS } from "../../lib/claims/types"
import { GradeBadge } from "./GradeBadge"
import {
  COMPARISON_LABELS,
  CONFIDENCE_LABELS,
  formatDay,
  PART_LABELS,
  SHAPE_LABELS,
} from "./labels"

export type Proposal = {
  /** the clean statement that will show everywhere; my words stay underneath */
  headline?: string
  shape: ClaimShape
  parts: Record<string, string | number>
  deadline?: string
}

/** The proposal behind a preview: what Approve will save. */
export function proposalOf(preview: ClaimPreview): Proposal | null {
  if (!preview.shape || preview.shape === "FREE_TEXT") return null
  const parts: Record<string, string | number> = {}
  for (const [name, part] of Object.entries(preview.parts)) {
    if (name !== "deadline" && part) parts[name] = part.value
  }
  const deadline = preview.parts.deadline?.value
  return {
    headline: preview.headline ?? undefined,
    shape: preview.shape,
    parts,
    deadline: deadline === undefined ? undefined : String(deadline),
  }
}

/**
 * Shown after I type a hunch, when the AI step is on: the proposed
 * sharpening, how it would be graded, and nothing saved yet. Approve saves
 * it as mine. Edit lets me change any part first.
 */
export function PreviewCard({
  preview,
  busy,
  onApprove,
  onRegrade,
  onPlain,
  onDiscard,
}: {
  preview: ClaimPreview
  busy: boolean
  /** save this version as mine */
  onApprove: (proposal: Proposal) => void
  /** I changed something: grade my version again (still saves nothing) */
  onRegrade: (proposal: Proposal) => void
  /** save my words alone, as a hunch */
  onPlain: () => void
  onDiscard: () => void
}) {
  const proposal = proposalOf(preview)!
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Proposal>(proposal)

  const shape = editing ? draft.shape : proposal.shape
  const names = [
    ...SHAPE_PARTS[shape].required,
    ...SHAPE_PARTS[shape].optional,
  ].filter((name) => name !== "deadline") as string[]
  const shown = editing ? draft : proposal

  const setPart = (name: string, raw: string) => {
    const parts = { ...draft.parts }
    if (raw.trim() === "") delete parts[name]
    else if (name === "value" || name === "valueHigh") {
      const n = parseFloat(raw)
      if (Number.isFinite(n)) parts[name] = n
    } else parts[name] = raw
    setDraft({ ...draft, parts })
  }

  return (
    <div
      className="glass rounded-xl p-4 flex flex-col gap-3 text-sm"
      aria-label="Preview: not saved yet"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tone-info rounded px-2 py-0.5 text-xs font-semibold">
          Preview: nothing is saved yet
        </span>
        <span className="text-xs text-neutral-500">
          Said {formatDay(preview.claimDate)}
        </span>
      </div>
      {editing ? (
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">Headline</span>
          <input
            aria-label="Headline"
            className="input input-sm input-bordered w-full font-semibold"
            defaultValue={draft.headline ?? ""}
            placeholder="A clear, sharp statement of what you mean"
            onChange={(e) =>
              setDraft({
                ...draft,
                headline: e.target.value.trim() || undefined,
              })
            }
          />
        </label>
      ) : (
        shown.headline && (
          <div className="font-semibold text-base">{shown.headline}</div>
        )
      )}
      <div
        className={
          shown.headline && !editing
            ? "text-neutral-600"
            : "font-semibold text-base"
        }
      >
        {shown.headline && !editing && (
          <span className="text-neutral-500">Originally said: </span>
        )}
        <span className={shown.headline && !editing ? "italic" : ""}>
          “{preview.text}”
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            preview.kind === "prediction" ? "kind-prediction" : "kind-hunch"
          }
        >
          {preview.kind === "prediction"
            ? "Would be a prediction"
            : "Would be a hunch"}
        </span>
        <GradeBadge grade={preview.grade} reason={preview.gradeReason} />
        <span className="text-neutral-500">{preview.gradeReason}</span>
      </div>

      <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3">
        <Row label="Shape">
          {editing ? (
            <select
              aria-label="Shape"
              className="select select-sm select-bordered min-w-0"
              value={draft.shape}
              onChange={(e) =>
                setDraft({ ...draft, shape: e.target.value as ClaimShape })
              }
            >
              {(Object.keys(SHAPE_LABELS) as ClaimShape[])
                .filter((s) => s !== "FREE_TEXT")
                .map((s) => (
                  <option key={s} value={s}>
                    {SHAPE_LABELS[s]}
                  </option>
                ))}
            </select>
          ) : (
            SHAPE_LABELS[proposal.shape]
          )}
        </Row>
        {names.map((name) => {
          const value = shown.parts[name]
          const label = PART_LABELS[name] ?? name
          return (
            <Row key={name} label={label}>
              {!editing ? (
                value === undefined ? (
                  <span className="italic text-neutral-500">not proposed</span>
                ) : name === "comparison" ? (
                  COMPARISON_LABELS[String(value)] ?? String(value)
                ) : (
                  String(value)
                )
              ) : name === "comparison" ? (
                <select
                  aria-label={label}
                  className="select select-sm select-bordered min-w-0"
                  value={String(value ?? "")}
                  onChange={(e) => setPart(name, e.target.value)}
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
                  aria-label={label}
                  className="input input-sm input-bordered w-full min-w-0"
                  type={
                    name === "value" || name === "valueHigh" ? "number" : "text"
                  }
                  step="any"
                  defaultValue={value === undefined ? "" : String(value)}
                  onChange={(e) => setPart(name, e.target.value)}
                />
              )}
            </Row>
          )
        })}
        <Row label="Deadline">
          {editing ? (
            <input
              aria-label="Deadline"
              type="date"
              className="input input-sm input-bordered"
              value={draft.deadline ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, deadline: e.target.value || undefined })
              }
            />
          ) : shown.deadline ? (
            formatDay(shown.deadline)
          ) : (
            <span className="italic text-neutral-500">
              not proposed; check back by {formatDay(preview.deadline)}
            </span>
          )}
        </Row>
        <Row label="How sure">
          {preview.probability === null ? (
            <span className="italic text-neutral-500">
              not given; add it after saving
            </span>
          ) : (
            <span>
              <span className="num">
                {Math.round(preview.probability * 1000) / 10}%
              </span>
              {preview.confidenceWord
                ? ` · ${CONFIDENCE_LABELS[preview.confidenceWord]}`
                : ""}
            </span>
          )}
        </Row>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <button
              className="btn btn-sm btn-primary normal-case"
              disabled={busy}
              onClick={() => {
                setEditing(false)
                // keep only the parts the chosen shape uses
                onRegrade({
                  ...draft,
                  parts: Object.fromEntries(
                    Object.entries(draft.parts).filter(([name]) =>
                      names.includes(name),
                    ),
                  ),
                })
              }}
            >
              Update preview
            </button>
            <button
              className="btn btn-sm btn-ghost normal-case"
              onClick={() => {
                setDraft(proposal)
                setEditing(false)
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-sm btn-primary normal-case"
              disabled={busy}
              onClick={() => onApprove(proposal)}
            >
              Approve and save
            </button>
            <button
              className="btn btn-sm normal-case"
              disabled={busy}
              onClick={() => {
                setDraft(proposal)
                setEditing(true)
              }}
            >
              Edit
            </button>
            <button
              className="btn btn-sm btn-ghost normal-case"
              disabled={busy}
              onClick={onPlain}
              title="Save only what you typed, with none of the proposed parts"
            >
              Save my words only
            </button>
            <button
              className="btn btn-sm btn-ghost normal-case ml-auto"
              disabled={busy}
              onClick={onDiscard}
            >
              Don&apos;t save
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-h-8">
      <span className="text-neutral-500 w-24 sm:w-36 shrink-0">{label}</span>
      <span className="min-w-0 grow break-words">{children}</span>
    </div>
  )
}
