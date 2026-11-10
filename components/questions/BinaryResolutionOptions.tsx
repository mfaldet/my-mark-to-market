import { Menu } from "@headlessui/react"
import { Question, QuestionType, Resolution } from "@prisma/client"
import { UseTRPCMutationResult } from "@trpc/react-query/shared"
import clsx from "clsx"
import { resultLabel } from "../../lib/claims/words"

interface BinaryResolutionOptionsProps {
  question: Question
  resolveQuestion: UseTRPCMutationResult<any, any, any, any> // This is lazy, should be more specific
  optionId?: string
}

export function BinaryResolutionOptions({
  question,
  resolveQuestion,
  optionId,
}: BinaryResolutionOptionsProps) {
  return (["YES", "NO", "AMBIGUOUS"] as Resolution[]).map(
    (resolution: Resolution) => (
      <Menu.Item key={resolution}>
        {({ active }) => (
          <button
            className={clsx(
              active ? "bg-neutral-100 text-ink" : "text-ink",
              `group flex w-full items-center rounded-md px-2 py-2 text-sm`,
            )}
            onClick={() => {
              resolveQuestion.mutate({
                questionId: question.id,
                resolution,
                questionType: QuestionType.BINARY,
                optionId,
              })
            }}
          >
            <div
              className={clsx(
                "h-3 w-3 mr-2 rounded-md",
                resolution === "YES"
                  ? "bg-positive"
                  : resolution === "NO"
                    ? "bg-negative"
                    : resolution === "AMBIGUOUS"
                      ? "bg-neutral-400"
                      : "bg-neutral-200",
              )}
            />
            {resultLabel(resolution)}
          </button>
        )}
      </Menu.Item>
    ),
  )
}
