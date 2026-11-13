import { ConfidenceWord } from "@prisma/client"
import { useState } from "react"
import { toast } from "react-hot-toast"
import { ClaimView } from "../../lib/claims/service"
import { api } from "../../lib/web/trpc"
import { BTN_OUTLINE, BTN_TEXT, INPUT } from "./card/shared"
import { CONFIDENCE_LABELS } from "./labels"

/**
 * Change how sure I am: a word from the fixed list ("probably" counts as
 * likely) or a number, with an optional note on why. Every change is kept.
 */
export function ConfidenceForm({
  claim,
  onDone,
}: {
  claim: ClaimView
  onDone: () => void
}) {
  const utils = api.useContext()
  const [word, setWord] = useState<ConfidenceWord | "">("")
  const [percent, setPercent] = useState("")
  const [note, setNote] = useState("")

  const update = api.claims.updateConfidence.useMutation({
    onSuccess: async () => {
      onDone()
      await utils.claims.invalidate()
      await utils.question.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const number = parseFloat(percent)
  const canSave =
    !update.isLoading && (word !== "" || (number >= 0 && number <= 100))

  return (
    <form
      className="flex flex-col gap-2 border-t border-neutral-200 pt-3"
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
          className={`${INPUT} sm:w-auto`}
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
          className={`${INPUT} num w-24`}
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
        aria-label="A note on why"
        className={INPUT}
        type="text"
        placeholder="A note on why (optional; private unless you make it public)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <p className="text-xs text-neutral-500">
        A word is stored as the middle of its range, so “likely” counts as 70%.
        “Probably” means likely.
      </p>
      <div className="flex gap-2">
        <button className={BTN_OUTLINE} type="submit" disabled={!canSave}>
          Save
        </button>
        <button className={BTN_TEXT} type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
