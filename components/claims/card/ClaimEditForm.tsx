import { ClaimShape } from "@prisma/client"
import { ReactNode, useState } from "react"
import TextareaAutosize from "react-textarea-autosize"
import { COMPARISONS, SHAPE_PARTS } from "../../../lib/claims/types"
import { COMPARISON_LABELS, PART_LABELS, SHAPE_LABELS } from "../labels"
import {
  BTN_MAIN,
  BTN_OUTLINE,
  BTN_TEXT,
  CardClaim,
  INPUT,
  SHAPE_PLAIN,
} from "./shared"

/** Everything the one Edit form can change. Empty text means "none". */
export type Draft = {
  headline: string
  shape: ClaimShape
  parts: Record<string, string>
  deadline: string
  checkLinkUrl: string
  /** set only when I say my words were recorded wrongly */
  correctedText: string | null
}

export function draftOf(claim: CardClaim): Draft {
  const parts: Record<string, string> = {}
  for (const [name, part] of Object.entries(claim.parts)) {
    if (name !== "deadline" && part) parts[name] = String(part.value)
  }
  return {
    headline: claim.headline ?? "",
    shape: claim.shape ?? "FREE_TEXT",
    parts,
    // a date of my own, or the app's default check-back date
    deadline: claim.deadline,
    checkLinkUrl: claim.checkLinkUrl ?? "",
    correctedText: null,
  }
}

/** The part fields a shape has, in order (the deadline has its own field). */
export const partFields = (shape: ClaimShape) =>
  ([...SHAPE_PARTS[shape].required, ...SHAPE_PARTS[shape].optional] as string[])
    .filter((name) => name !== "deadline")
    // the upper number only matters for "between"
    .filter((name) => name !== "valueHigh")

function Labelled({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-500 sm:text-sm">{label}</span>
      {children}
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </label>
  )
}

/**
 * The one edit form, used by the preview card and the detail page alike.
 * Every field on the card opens at once, with one Save and one Cancel.
 */
export function ClaimEditForm({
  claim,
  mode,
  busy,
  onSave,
  onCancel,
}: {
  claim: CardClaim
  mode: "preview" | "detail"
  busy: boolean
  onSave: (draft: Draft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(claim))
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const setPart = (name: string, value: string) =>
    set({ parts: { ...draft.parts, [name]: value } })

  const names = [
    ...partFields(draft.shape),
    ...(draft.shape === "NUMBER_BY_DATE" && draft.parts.comparison === "between"
      ? ["valueHigh"]
      : []),
  ]
  // a preview is a proposed sharpening, so it always has a shape
  const shapes = (Object.keys(SHAPE_LABELS) as ClaimShape[]).filter(
    (shape) => mode === "detail" || shape !== "FREE_TEXT",
  )

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) onSave(draft)
      }}
    >
      <Labelled
        label="Headline"
        hint="One clear sentence. It is what shows everywhere. Leave it empty to show your own words."
      >
        <TextareaAutosize
          aria-label="Headline"
          className={`${INPUT} text-lg sm:text-lg font-semibold resize-none`}
          minRows={1}
          value={draft.headline}
          placeholder="A clear, sharp statement of what you mean"
          onChange={(e) => set({ headline: e.target.value })}
        />
      </Labelled>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500 sm:text-sm">
          Originally said
        </span>
        {draft.correctedText === null ? (
          <>
            <span className="text-sm text-neutral-600 break-words">
              “{claim.text}”
            </span>
            {mode === "detail" && (
              <button
                type="button"
                className={`${BTN_TEXT} self-start text-xs`}
                onClick={() => set({ correctedText: claim.text })}
              >
                My words were recorded wrongly
              </button>
            )}
          </>
        ) : (
          <>
            <TextareaAutosize
              aria-label="My words"
              className={`${INPUT} resize-none`}
              minRows={2}
              value={draft.correctedText}
              onChange={(e) => set({ correctedText: e.target.value })}
            />
            <span className="text-xs text-neutral-500">
              Only to fix a recording mistake. To say it more clearly, change
              the headline. The correction is kept in the history.
            </span>
          </>
        )}
      </div>

      <Labelled label="Shape">
        <select
          aria-label="Shape"
          className={INPUT}
          value={draft.shape}
          onChange={(e) => set({ shape: e.target.value as ClaimShape })}
        >
          {shapes.map((shape) => (
            <option key={shape} value={shape}>
              {SHAPE_PLAIN[shape]}
            </option>
          ))}
        </select>
      </Labelled>

      {names.map((name) => {
        const label = PART_LABELS[name] ?? name
        const value = draft.parts[name] ?? ""
        return (
          <Labelled key={name} label={label}>
            {name === "comparison" ? (
              <select
                aria-label={label}
                className={INPUT}
                value={value}
                onChange={(e) => setPart(name, e.target.value)}
              >
                <option value="">(none)</option>
                {COMPARISONS.map((c) => (
                  <option key={c} value={c}>
                    {COMPARISON_LABELS[c]}
                  </option>
                ))}
              </select>
            ) : name === "value" || name === "valueHigh" ? (
              <input
                aria-label={label}
                className={`${INPUT} num`}
                type="number"
                step="any"
                value={value}
                onChange={(e) => setPart(name, e.target.value)}
              />
            ) : (
              <TextareaAutosize
                aria-label={label}
                className={`${INPUT} resize-none`}
                minRows={1}
                value={value}
                onChange={(e) => setPart(name, e.target.value)}
              />
            )}
          </Labelled>
        )
      })}

      <Labelled
        label={claim.deadlineKind === "deadline" ? "Deadline" : "Check back by"}
      >
        <input
          aria-label="Deadline"
          type="date"
          className={`${INPUT} num sm:max-w-[12rem]`}
          value={draft.deadline}
          onChange={(e) => set({ deadline: e.target.value })}
        />
      </Labelled>

      {mode === "detail" && (
        <Labelled
          label="Check link"
          hint="Where anyone can check how it turned out."
        >
          <input
            aria-label="Check link"
            type="url"
            className={INPUT}
            placeholder="https://fred.stlouisfed.org/series/UNRATE"
            value={draft.checkLinkUrl}
            onChange={(e) => set({ checkLinkUrl: e.target.value })}
          />
        </Labelled>
      )}

      <p className="m-0 text-xs text-neutral-500">
        {mode === "preview"
          ? "This updates the preview. Nothing is stored until you approve it."
          : "Saving records one new version in the history, and what you save counts as yours. How sure you are is changed on the card itself."}
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={BTN_MAIN} disabled={busy}>
          {mode === "preview" ? "Update preview" : busy ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className={BTN_OUTLINE}
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

/** A part's text as the value to store: a number where the part is one. */
export function partValue(name: string, raw: string): string | number | null {
  const text = raw.trim()
  if (text === "") return null
  if (name === "value" || name === "valueHigh") {
    const n = parseFloat(text)
    return Number.isFinite(n) ? n : null
  }
  return text
}
