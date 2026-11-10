import { useSession } from "next-auth/react"
import { useState } from "react"
import { toast } from "react-hot-toast"
import TextareaAutosize from "react-textarea-autosize"
import { ClaimView } from "../../lib/claims/service"
import { api } from "../../lib/web/trpc"
import { signInToFatebook, useUserId } from "../../lib/web/utils"
import { ClaimPanel } from "./ClaimPanel"

const today = () => new Date().toISOString().slice(0, 10)

/**
 * The front door: type a claim in your own words and log it. The rigor
 * engine then shows its grade and asks one question at a time.
 */
export function LogClaim() {
  const userId = useUserId()
  const { status } = useSession()
  const utils = api.useContext()
  const [text, setText] = useState("")
  const [backDate, setBackDate] = useState(false)
  const [claimDate, setClaimDate] = useState(today())
  const [logged, setLogged] = useState<ClaimView | null>(null)

  const log = api.claims.log.useMutation({
    onSuccess: async (claim) => {
      setLogged(claim)
      setText("")
      setBackDate(false)
      setClaimDate(today())
      await utils.question.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  if (status !== "loading" && !userId) {
    return (
      <div className="not-prose my-6">
        <button
          className="button primary"
          onClick={() => void signInToFatebook()}
        >
          Sign in to log a hunch
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
          if (!text.trim() || log.isLoading) return
          log.mutate({
            text: text.trim(),
            claimDate: backDate ? claimDate : undefined,
          })
        }}
      >
        <TextareaAutosize
          className="w-full rounded-md border border-neutral-300 p-3 text-xl font-semibold focus:outline-indigo-500 resize-none"
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
            className="button primary ml-auto"
            disabled={!text.trim() || log.isLoading}
          >
            {log.isLoading ? "Logging..." : "Log hunch"}
          </button>
        </div>
      </form>

      {logged && (
        <div className="rounded-md bg-white border border-neutral-200 p-4 flex flex-col gap-1">
          <div className="flex justify-between gap-2">
            <span className="font-semibold">“{logged.text}”</span>
            <button
              className="btn btn-xs btn-ghost normal-case"
              onClick={() => setLogged(null)}
            >
              Done
            </button>
          </div>
          <ClaimPanel claimId={logged.id} initial={logged} />
        </div>
      )}
    </div>
  )
}
