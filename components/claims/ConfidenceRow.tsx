import { ConfidenceWord } from "@prisma/client"
import { useState } from "react"
import { toast } from "react-hot-toast"
import { ClaimView } from "../../lib/claims/service"
import { api } from "../../lib/web/trpc"
import { CONFIDENCE_LABELS } from "./labels"

/**
 * How sure I am. Confidence is a word from the fixed list ("probably"
 * counts as likely) or a number, with an optional note on why it changed.
 * Every change is kept.
 */
export function ConfidenceRow({ claim }: { claim: ClaimView }) {
  const utils = api.useContext()
  const [editing, setEditing] = useState(false)
  const [word, setWord] = useState<ConfidenceWord | "">("")
  const [percent, setPercent] = useState("")
  const [note, setNote] = useState("")

  const update = api.claims.updateConfidence.useMutation({
    onSuccess: async () => {
      setEditing(false)
      setWord("")
      setPercent("")
      setNote("")
      await utils.claims.invalidate()
      await utils.question.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const current =
    claim.probability === null
      ? "not given"
      : `${Math.round(claim.probability * 1000) / 10}%${
          claim.confidenceWord
            ? ` · ${CONFIDENCE_LABELS[claim.confidenceWord]}`
            : ""
        }`
  const locked = claim.resolved || claim.withdrawn
  const number = parseFloat(percent)
  const canSave =
    !update.isLoading && (word !== "" || (number >= 0 && number <= 100))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 min-h-8">
        <span className="text-neutral-500 w-24 sm:w-36 shrink-0">How sure</span>
        <span
          className={
            claim.probability === null ? "text-neutral-400 italic" : ""
          }
        >
          {current}
        </span>
        {!locked && !editing && (
          <button
            className="btn btn-xs btn-ghost normal-case ml-auto"
            onClick={() => setEditing(true)}
          >
            {claim.probability === null ? "Add" : "Change"}
          </button>
        )}
      </div>
      {editing && (
        <form
          className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!canSave) return
            update.mutate({
              claimId: claim.id,
              ...(word !== ""
                ? { word }
                : { probability: Math.round(number * 10) / 1000 }),
              note: note.trim() || undefined,
            })
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="A confidence word"
              className="select select-sm select-bordered"
              value={word}
              onChange={(e) => {
                setWord(e.target.value as ConfidenceWord | "")
                if (e.target.value) setPercent("")
              }}
            >
              <option value="">Pick a word…</option>
              {Object.entries(CONFIDENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="text-neutral-500">or</span>
            <input
              aria-label="A number from 0 to 100"
              className="input input-sm input-bordered w-24"
              type="number"
              min={0}
              max={100}
              step="any"
              placeholder="%"
              value={percent}
              onChange={(e) => {
                setPercent(e.target.value)
                if (e.target.value) setWord("")
              }}
            />
          </div>
          <input
            aria-label="Why, if it changed"
            className="input input-sm input-bordered"
            type="text"
            placeholder="Why? (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="text-xs text-neutral-500">
            A word is stored as the middle of its range, so “likely” counts as
            70%. “Probably” means likely.
          </p>
          <div className="flex gap-2">
            <button
              className="btn btn-sm normal-case"
              type="submit"
              disabled={!canSave}
            >
              Save
            </button>
            <button
              className="btn btn-sm btn-ghost normal-case"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
