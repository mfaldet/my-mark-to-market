import { useState } from "react"
import { toast } from "react-hot-toast"
import { ClaimView } from "../../lib/claims/service"
import { MAX_ENGINE_QUESTIONS } from "../../lib/claims/next_question"
import { api } from "../../lib/web/trpc"

/**
 * The rigor engine's one question. One tap accepts the suggested default;
 * typing an answer makes it mine; "Skip" moves on.
 */
export function EngineQuestionCard({
  claim,
  onChange,
}: {
  claim: ClaimView
  onChange?: (claim: ClaimView) => void
}) {
  const utils = api.useContext()
  const [value, setValue] = useState("")
  const answer = api.claims.answer.useMutation({
    onSuccess: async (updated) => {
      setValue("")
      onChange?.(updated)
      await utils.claims.invalidate()
      await utils.question.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const question = claim.nextQuestion
  if (!question) return null
  const send = (a: Parameters<typeof answer.mutate>[0]["answer"]) =>
    answer.mutate({ claimId: claim.id, answer: a })

  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 flex flex-col gap-2 not-prose">
      <div className="flex justify-between items-baseline gap-2">
        <span className="font-semibold text-indigo-900">
          {question.question}
        </span>
        <span className="text-xs text-indigo-400 whitespace-nowrap">
          Question {claim.questionsAsked + 1} of {MAX_ENGINE_QUESTIONS}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {question.suggestion && (
          <button
            className="btn btn-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none normal-case"
            disabled={answer.isLoading}
            onClick={() => send({ accept: true })}
          >
            {question.suggestion.label}
          </button>
        )}
        <form
          className="flex gap-2 grow"
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) send({ value: value.trim() })
          }}
        >
          <input
            className="input input-sm input-bordered grow min-w-[8rem]"
            type={question.part === "deadline" ? "date" : "text"}
            placeholder={
              question.suggestion ? "or type your own" : "Your answer"
            }
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            className="btn btn-sm normal-case"
            type="submit"
            disabled={answer.isLoading || !value.trim()}
          >
            Answer
          </button>
        </form>
        <button
          className="btn btn-sm btn-ghost normal-case text-neutral-500"
          disabled={answer.isLoading}
          onClick={() => send({ skip: true })}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
