import clsx from "clsx"
import Link from "next/link"
import { calendarDay, isPastDay } from "../../../lib/claims/calendar"
import { isImported, kindForGrade } from "../../../lib/claims/kind"
import { resultFor } from "../../../lib/claims/words"
import { getQuestionUrl } from "../../../lib/web/question_url"
import { QuestionWithStandardIncludes } from "../../../prisma/additional"
import { formatDay } from "../labels"
import { percent } from "./shared"

const RESULT_STYLE: Record<string, string> = {
  right: "tone-positive",
  wrong: "tone-negative",
  "can't tell": "tone-plain",
}

/**
 * One of my items in a list: the headline (or my words when there is
 * none), whether it is a hunch or a prediction, its date, and how sure I
 * am. Everything else is on the card, which opens when the row is clicked.
 */
export function ClaimRow({
  question,
  onOpen,
}: {
  question: QuestionWithStandardIncludes
  onOpen: () => void
}) {
  const imported = isImported(question.id)
  const hunch = kindForGrade(question.grade) === "hunch" && !imported
  const result = question.resolved ? resultFor(question.resolution) : null
  const past = !question.resolved && isPastDay(question.resolveBy)
  // my latest "how sure", if I gave one
  const latest = [...question.forecasts]
    .filter((f) => f.userId === question.userId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0]

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Open"
      className="not-prose cursor-pointer rounded-xl border border-neutral-200 bg-white p-4 text-left text-ink hover:border-neutral-400 focus:border-ink focus:outline-none"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href={getQuestionUrl(question)}
          className="min-w-0 break-words text-base font-semibold leading-snug text-ink no-underline hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {question.headline ?? question.title}
        </Link>
        <span
          className={clsx(
            "num shrink-0 text-base",
            latest ? "font-semibold text-ink" : "text-neutral-400",
          )}
          title={latest ? "How sure" : "How sure: not given"}
        >
          {latest ? percent(Number(latest.forecast)) : "–"}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
        <span>{imported ? "Imported" : hunch ? "Hunch" : "Prediction"}</span>
        <span aria-hidden>·</span>
        {question.withdrawnAt ? (
          <span className="tone-plain rounded px-1.5 py-0.5 text-xs font-semibold">
            Withdrawn
          </span>
        ) : result ? (
          <span
            className={clsx(
              "rounded px-1.5 py-0.5 text-xs font-semibold",
              RESULT_STYLE[result] ?? "tone-plain",
            )}
          >
            {result === "right"
              ? "Right"
              : result === "wrong"
                ? "Wrong"
                : "Can't tell"}
          </span>
        ) : (
          <span
            className={clsx(
              // red = urgent: a prediction past its deadline
              past && !hunch && "font-semibold text-negative-text",
              past && hunch && "font-semibold text-neutral-700",
            )}
          >
            {past
              ? hunch
                ? "Time to check back: "
                : "Past due: "
              : hunch
                ? "Check back by "
                : "Due "}
            {/* the same format as the card, always with the year */}
            <span className="num">
              {formatDay(calendarDay(question.resolveBy))}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
