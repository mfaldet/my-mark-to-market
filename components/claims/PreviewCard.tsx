import { ClaimShape } from "@prisma/client"
import { useState } from "react"
import { ClaimPreview } from "../../lib/claims/service"
import {
  ClaimEditForm,
  Draft,
  partFields,
  partValue,
} from "./card/ClaimEditForm"
import {
  BTN_MAIN,
  BTN_OUTLINE,
  BTN_TEXT,
  CARD,
  ClaimFields,
  Headline,
  QuietLine,
} from "./card/shared"

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

/** What I typed into the edit form, as a proposal to grade again. */
function proposalFrom(draft: Draft, preview: ClaimPreview): Proposal {
  const names = [...partFields(draft.shape), "valueHigh"]
  const parts: Record<string, string | number> = {}
  for (const name of names) {
    const value = partValue(name, draft.parts[name] ?? "")
    if (value !== null) parts[name] = value
  }
  if (parts.comparison !== "between") delete parts.valueHigh
  // a date I did not touch stays as it was: proposed, or the app's default
  const proposed = preview.parts.deadline?.value
  const deadline =
    draft.deadline && draft.deadline !== preview.deadline
      ? draft.deadline
      : proposed === undefined
        ? undefined
        : String(proposed)
  return {
    headline: draft.headline.trim() || undefined,
    shape: draft.shape,
    parts,
    deadline,
  }
}

/**
 * The card in its "not saved yet" state: shown after I type a hunch, when
 * the AI step is on. Approve saves it as mine; Edit opens the same form the
 * detail page uses.
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

  return (
    <section className={CARD} aria-label="Preview: not saved yet">
      <div>
        <span className="tone-info inline-flex rounded px-2 py-0.5 text-xs font-semibold">
          Not saved yet
        </span>
      </div>

      {editing ? (
        <ClaimEditForm
          claim={preview}
          mode="preview"
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={(draft) => {
            setEditing(false)
            onRegrade(proposalFrom(draft, preview))
          }}
        />
      ) : (
        <>
          <Headline claim={preview} />
          <ClaimFields claim={preview} mode="preview" />
          <QuietLine claim={preview} mode="preview" />
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                className={BTN_MAIN}
                disabled={busy}
                onClick={() => onApprove(proposal)}
              >
                Approve and save
              </button>
              <button
                className={BTN_OUTLINE}
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <button
                className={BTN_OUTLINE}
                disabled={busy}
                onClick={onDiscard}
              >
                Discard
              </button>
            </div>
            <button
              className={`${BTN_TEXT} self-start`}
              disabled={busy}
              onClick={onPlain}
              title="Save only what you typed, with none of the suggested parts"
            >
              Save my words only
            </button>
          </div>
        </>
      )}
    </section>
  )
}
