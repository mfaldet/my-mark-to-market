import { Menu } from "@headlessui/react"
import { QuestionType } from "@prisma/client"
import { UseTRPCMutationResult } from "@trpc/react-query/shared"
import clsx from "clsx"
import { toSentenceCase } from "../../lib/_utils_common"
import { QuestionWithStandardIncludes } from "../../prisma/additional"

interface MultiChoiceResolutionOptionsProps {
  question: QuestionWithStandardIncludes
  resolveQuestion: UseTRPCMutationResult<any, any, any, any> // This is lazy, should be more specific
}

export function MultiChoiceResolutionOptions({
  question,
  resolveQuestion,
}: MultiChoiceResolutionOptionsProps) {
  const options = question.options!.map((option) => option.text)
  options.push("AMBIGUOUS")
  options.push("OTHER")
  return options.map((option: string) => (
    <Menu.Item key={option}>
      {({ active }) => (
        <button
          className={clsx(
            active ? "bg-neutral-100 text-ink" : "text-ink",
            `group flex w-full items-center rounded-md px-2 py-2 text-sm overflow-x-auto`,
          )}
          onClick={() => {
            resolveQuestion.mutate({
              questionId: question.id,
              resolution: option,
              questionType: QuestionType.MULTIPLE_CHOICE,
            })
          }}
        >
          <div
            className={clsx(
              "h-3 w-3 mr-2 rounded-md",
              option === "YES"
                ? "bg-positive"
                : option === "NO" || option === "OTHER"
                  ? "bg-negative"
                  : option === "AMBIGUOUS"
                    ? "bg-neutral-400"
                    : "bg-positive", // is an MCQ option
            )}
          />
          {option === "AMBIGUOUS"
            ? "Can't tell"
            : toSentenceCase(option.toLowerCase())}
        </button>
      )}
    </Menu.Item>
  ))
}
