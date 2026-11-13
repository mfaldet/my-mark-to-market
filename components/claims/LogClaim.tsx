import { useSession } from "next-auth/react"
import { useState } from "react"
import { toast } from "react-hot-toast"
import TextareaAutosize from "react-textarea-autosize"
import { ClaimPreview, ClaimView } from "../../lib/claims/service"
import { api } from "../../lib/web/trpc"
import { signInToFatebook, useUserId } from "../../lib/web/utils"
import { ClaimCard } from "./card/ClaimCard"
import { BTN_OUTLINE } from "./card/shared"
import { PreviewCard, Proposal, proposalOf } from "./PreviewCard"

const today = () => new Date().toISOString().slice(0, 10)

/** The outcome half of what the preview card hands back (the headline travels separately). */
const toProposal = ({ shape, parts, deadline }: Proposal) => ({
  shape,
  parts,
  deadline,
})

/**
 * The front door: type a hunch in your own words. With the AI step on, the
 * app shows a proposed headline and parts first, and nothing is saved until
 * I approve; otherwise my words are saved as a hunch.
 */
export function LogClaim() {
  const userId = useUserId()
  const { status } = useSession()
  const utils = api.useContext()
  const [text, setText] = useState("")
  const [backDate, setBackDate] = useState(false)
  const [claimDate, setClaimDate] = useState(today())
  const [logged, setLogged] = useState<ClaimView | null>(null)
  // when the AI step is on: the proposed version, shown before anything is saved
  const [preview, setPreview] = useState<ClaimPreview | null>(null)

  const log = api.claims.log.useMutation({
    onSuccess: async (claim) => {
      setLogged(claim)
      setPreview(null)
      setText("")
      setBackDate(false)
      setClaimDate(today())
      await utils.question.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const previewIt = api.claims.preview.useMutation({
    onError: (error) => {
      toast.error(error.message)
    },
  })
  const busy = log.isLoading || previewIt.isLoading

  /** Submit: with the AI step on, show a preview first; otherwise log as before. */
  const submit = () => {
    const words = text.trim()
    if (!words || busy) return
    const date = backDate ? claimDate : undefined
    previewIt.mutate(
      { text: words, claimDate: date },
      {
        onSuccess: (result) => {
          // no AI step, or nothing it could sharpen: save my words as a hunch
          if (!result.preview || !proposalOf(result.preview)) {
            log.mutate({ text: words, claimDate: date })
          } else {
            setLogged(null)
            setPreview(result.preview)
          }
        },
      },
    )
  }

  if (status !== "loading" && !userId) {
    return (
      <div className="not-prose my-6">
        <button
          className="button primary"
          onClick={() => void signInToFatebook()}
        >
          Sign in to log a prediction
        </button>
      </div>
    )
  }

  return (
    <div className="not-prose flex flex-col gap-3 my-6">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <TextareaAutosize
          className="w-full rounded-xl glass p-3 text-xl font-semibold placeholder:text-neutral-400 placeholder:font-normal resize-none"
          placeholder="What's your hunch? Say it in your own words."
          minRows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-500 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={backDate}
              onChange={(e) => setBackDate(e.target.checked)}
            />
            I said this earlier
          </label>
          {backDate && (
            <input
              type="date"
              className="input input-sm input-bordered"
              max={today()}
              value={claimDate}
              onChange={(e) => setClaimDate(e.target.value)}
            />
          )}
          <button
            type="submit"
            // one filled button on screen: with a card open below, the
            // card's own main button takes that place
            className={
              preview || logged
                ? `${BTN_OUTLINE} ml-auto`
                : "button primary ml-auto"
            }
            disabled={!text.trim() || busy}
          >
            {previewIt.isLoading
              ? "Working..."
              : log.isLoading
                ? "Logging..."
                : "Log hunch"}
          </button>
        </div>
      </form>

      {preview && (
        <PreviewCard
          // a new preview (after an edit) starts the card afresh
          key={
            JSON.stringify(preview.parts) +
            preview.shape +
            preview.headline +
            (preview.story?.name ?? "")
          }
          preview={preview}
          busy={busy}
          onApprove={(proposal) =>
            // the date is when I said it, not when I approved it
            log.mutate({
              text: preview.text,
              claimDate: preview.claimDate,
              headline: proposal.headline,
              story: proposal.story,
              proposal: toProposal(proposal),
            })
          }
          onRegrade={(proposal) =>
            previewIt.mutate(
              {
                text: preview.text,
                claimDate: preview.claimDate,
                headline: proposal.headline,
                story: proposal.story,
                proposal: toProposal(proposal),
              },
              {
                onSuccess: (result) =>
                  result.preview && setPreview(result.preview),
              },
            )
          }
          onPlain={() =>
            log.mutate({ text: preview.text, claimDate: preview.claimDate })
          }
          onDiscard={() => setPreview(null)}
        />
      )}

      {logged && (
        <ClaimCard
          claimId={logged.id}
          initial={logged}
          onClose={() => setLogged(null)}
          closeLabel="Done"
        />
      )}
    </div>
  )
}
