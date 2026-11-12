import { useState } from "react"
import { toast } from "react-hot-toast"
import { ClaimView } from "../../lib/claims/service"
import { MAX_ENGINE_QUESTIONS } from "../../lib/claims/next_question"
import { api } from "../../lib/web/trpc"
import { BTN_OUTLINE, BTN_TEXT, INPUT } from "./card/shared"

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
    <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3 not-prose">
      <div className="text-xs text-neutral-500">
        {claim.kind === "hunch"
          ? "Turn this hunch into a prediction, one question at a time."
          : "One more thing to pin down."}
      </div>
      <div className="flex justify-between items-baseline gap-2">
        <span className="font-semibold text-ink">{question.question}</span>
        <span className="text-xs text-neutral-500 whitespace-nowrap">
          Question {claim.questionsAsked + 1} of {MAX_ENGINE_QUESTIONS}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {question.suggestion && (
          <button
            className={BTN_OUTLINE}
            disabled={answer.isLoading}
            onClick={() => send({ accept: true })}
          >
            {question.suggestion.label}
          </button>
        )}
        <form
          className="flex gap-2 grow min-w-0"
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) send({ value: value.trim() })
          }}
        >
          <input
            className={`${INPUT} grow w-0 min-w-[8rem]`}
            type={question.part === "deadline" ? "date" : "text"}
            placeholder={
              question.suggestion ? "or type your own" : "Your answer"
            }
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            className={BTN_OUTLINE}
            type="submit"
            disabled={answer.isLoading || !value.trim()}
          >
            Answer
          </button>
        </form>
        <button
          className={BTN_TEXT}
          disabled={answer.isLoading}
          onClick={() => send({ skip: true })}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
