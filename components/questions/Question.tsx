import { calendarDay, isPastDay } from "../../lib/claims/calendar"
import { CalendarDate } from "../ui/CalendarDate"
import { Transition } from "@headlessui/react"
import {
  ChatBubbleOvalLeftIcon,
  ChevronDownIcon,
  PencilIcon,
  ReceiptPercentIcon,
  UserIcon,
} from "@heroicons/react/20/solid"
import clsx from "clsx"
import { motion } from "framer-motion"
import Link from "next/link"
import { useState } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { QuestionWithStandardIncludes } from "../../prisma/additional"
import { FormattedDate } from "../ui/FormattedDate"
import { Username } from "../ui/Username"
import { ClaimCard } from "../claims/card/ClaimCard"
import { ClaimRow } from "../claims/card/ClaimRow"
import { QuestionDetails } from "./QuestionDetails"
import { isImported, kindForGrade } from "../../lib/claims/kind"
import { ResolveButton } from "./ResolveButton"
import { SharePopover } from "./SharePopover"
import { UpdateableLatestForecast } from "./UpdateableLatestForecast"

import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid"
import toast from "react-hot-toast"
import { getQuestionUrl } from "../../lib/web/question_url"
import { api } from "../../lib/web/trpc"
import { invalidateQuestion, useUserId } from "../../lib/web/utils"
import { InfoButton } from "../ui/InfoButton"
import { PromptDialog } from "../ui/PromptDialog"
import { QuestionDetailsOption } from "./QuestionDetailsOptions"

export function Question({
  question,
  alwaysExpand,
  startExpanded,
  zIndex,
  embedded,
  className,
}: {
  question: QuestionWithStandardIncludes
  alwaysExpand?: boolean
  startExpanded?: boolean
  zIndex?: number
  embedded?: boolean
  className?: string
}) {
  const [manuallyExpanded, setManuallyExpanded] =
    useState<boolean>(!!startExpanded)
  const [editDateDialogOpen, setEditDateDialogOpen] = useState(false)

  const utils = api.useContext()
  const editQuestion = api.question.editQuestion.useMutation({
    async onSuccess() {
      await invalidateQuestion(utils, question)
    },
  })
  const userId = useUserId()
  // a withdrawn item is read-only until it is restored
  const editable = question.userId === userId && !question.withdrawnAt

  let cumulativeForecast = undefined
  if (question.type === "MULTIPLE_CHOICE") {
    cumulativeForecast =
      question.options?.reduce((acc, option) => {
        const latestForecast = option.forecasts
          .filter((f) => f.userId === userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

        if (latestForecast && latestForecast.forecast) {
          return acc + latestForecast.forecast.toNumber()
        }

        return acc // If there's no forecast or it's undefined, just return the accumulator
      }, 0) ?? 0 // Use nullish coalescing operator to default to 0 if reduce returns undefined
  }

  // a hunch has a date to check back, not a deadline to resolve by
  const isHunch =
    kindForGrade(question.grade) === "hunch" && !isImported(question.id)

  // My own item: a plain row in a list, and when opened the one card,
  // with each fact shown once.
  if (
    !embedded &&
    userId &&
    question.userId === userId &&
    question.type === "BINARY"
  ) {
    return (
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <div className={className} style={zIndex ? { zIndex } : undefined}>
          {alwaysExpand || manuallyExpanded ? (
            <ClaimCard
              claimId={question.id}
              onClose={
                alwaysExpand ? undefined : () => setManuallyExpanded(false)
              }
            />
          ) : (
            <ClaimRow
              question={question}
              onOpen={() => setManuallyExpanded(true)}
            />
          )}
        </div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={clsx(
          "transition-transform group",
          !embedded && "hover:scale-[1.01]",
          className,
        )}
        style={zIndex ? { zIndex } : undefined}
      >
        <div
          className={clsx(
            !embedded &&
              "glass cursor-pointer rounded-xl group-hover:shadow-md transition-all z-10",
            // a hunch is outlined and lighter; a prediction is solid
            !embedded &&
              isHunch &&
              !question.resolution &&
              "!border-dashed !border-neutral-300 !shadow-none",

            (manuallyExpanded || alwaysExpand) && "rounded-b-none",

            // green = right, red = wrong; "can't tell" has no colour
            question.resolution &&
              "bg-gradient-to-tl via-white/0 via-[30%] group-hover:via-[40%] to-white/0",
            question.resolution === "YES"
              ? "from-positive-soft"
              : question.resolution === "NO"
                ? "from-negative-soft"
                : question.resolution
                  ? "from-neutral-100"
                  : "",
          )}
          onClick={() => {
            if (!embedded) {
              setManuallyExpanded(!manuallyExpanded)
            }
          }}
        >
          <div
            className="grid grid-cols-[1fr_min-content_min-content] p-4 gap-y-2 relative"
            key={question.id}
          >
            <span className="col-span-3 flex gap-4 mb-1 justify-between">
              <span
                className={"font-semibold overflow-auto break-words"}
                key={`${question.id}title`}
              >
                <Link
                  href={getQuestionUrl(question)}
                  key={question.id}
                  target={embedded ? "_blank" : ""}
                  className={"no-underline hover:underline inline items-center"}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {question.headline ?? question.title}
                  {embedded && (
                    <ArrowTopRightOnSquareIcon className="inline ml-2 h-3 w-3 text-neutral-600" />
                  )}
                </Link>
              </span>
              {question.type === "BINARY" && (
                <UpdateableLatestForecast
                  question={question}
                  autoFocus={alwaysExpand}
                  embedded={embedded}
                />
              )}
            </span>
            {question.type === "MULTIPLE_CHOICE" && question.options && (
              <div className="contents">
                {question.options.map((option) => (
                  <QuestionDetailsOption
                    key={option.id}
                    option={option}
                    question={question}
                    autoFocus={alwaysExpand}
                    embedded={embedded}
                    cumulativeForecast={cumulativeForecast}
                  />
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 col-span-3">
              <span className="text-sm my-auto" key={`${question.id}author`}>
                <Username user={question.user} unknownUserText="Anonymous" />
              </span>
              {question.withdrawnAt ? (
                <span className="my-auto text-center">
                  <span className="tone-plain border border-neutral-300 rounded-full px-2 py-0.5 text-xs font-semibold">
                    Withdrawn
                  </span>
                </span>
              ) : (
                <SharePopover question={question} />
              )}
              {question.resolvedAt ? (
                <span
                  className="text-sm text-neutral-400 my-auto text-center max-sm:text-left [text-wrap:balanced]"
                  key={`${question.id}resolve`}
                >
                  <FormattedDate
                    prefix={
                      <span>
                        Resolved <br />
                      </span>
                    }
                    date={question.resolvedAt}
                  />
                </span>
              ) : (
                <button
                  className={clsx(
                    "rounded-md font-normal text-sm my-auto relative px-0.5 max-sm:text-left [text-wrap:balanced]",
                    editable &&
                      "hover:bg-neutral-100 transition-colors group/resolveBy",
                    isPastDay(question.resolveBy)
                      ? isHunch
                        ? "text-neutral-600"
                        : "text-negative-text" // red = urgent: past its deadline
                      : "text-neutral-500",
                  )}
                  disabled={!editable}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditDateDialogOpen(true)
                  }}
                  key={`${question.id}resolve`}
                >
                  {isPastDay(question.resolveBy) ? (
                    <span className="[text-wrap:balanced]">
                      <span className="font-semibold">
                        {isHunch ? "Time to check back" : "Past due"}
                        <br />
                      </span>
                      <CalendarDate date={question.resolveBy} capitalise />
                    </span>
                  ) : (
                    <span>
                      <span>
                        {isHunch ? "Check back by" : "Due"} <br />
                      </span>
                      <CalendarDate
                        className="[text-wrap:balanced]"
                        date={question.resolveBy}
                      />
                    </span>
                  )}
                  <PencilIcon className="hidden group-hover/resolveBy:block absolute top-1/2 -translate-y-1/2 right-0.5 h-3 w-3 shrink-0 text-indigo-400" />
                </button>
              )}
              {question.exclusiveAnswers &&
                !question.withdrawnAt &&
                (kindForGrade(question.grade) === "prediction" ||
                isImported(question.id) ||
                question.resolved ? (
                  <ResolveButton question={question} />
                ) : (
                  // only predictions can be marked right or wrong
                  <span
                    className="text-sm text-neutral-400 my-auto text-center"
                    title="A hunch can't be marked right or wrong. Sharpen it into a prediction first."
                  >
                    Hunch
                  </span>
                ))}
              {isImported(question.id) && (
                <span
                  className="text-xs text-neutral-500 my-auto text-center"
                  title="Brought in by an importer, not logged here in advance"
                >
                  <span className="rounded border border-neutral-300 px-1">
                    imported
                  </span>
                </span>
              )}
              <ActivityNumbers
                question={question}
                alwaysExpand={alwaysExpand}
                manuallyExpanded={manuallyExpanded}
                setManuallyExpanded={setManuallyExpanded}
                embedded={embedded}
              />
            </div>
          </div>
        </div>

        <Transition
          show={alwaysExpand || manuallyExpanded}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-98 translate-y-[-0.5rem]"
          enterTo="transform opacity-100 scale-100 translate-y-0"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100 translate-y-0 "
          leaveTo="transform opacity-0 scale-98 translate-y-[-0.5rem]"
        >
          <QuestionDetails
            question={question}
            hideOthersForecastsIfSharedWithUser={alwaysExpand}
          />
        </Transition>
      </motion.div>

      <PromptDialog
        isOpen={editDateDialogOpen}
        onClose={() => setEditDateDialogOpen(false)}
        title="Change the date"
        description="When does this come due?"
        defaultValue={calendarDay(question.resolveBy)}
        type="date"
        submitLabel="Save"
        onSubmit={(newDateStr) => {
          const newDate = newDateStr ? new Date(newDateStr) : undefined
          if (newDate && !isNaN(newDate.getTime())) {
            editQuestion.mutate({
              questionId: question.id,
              resolveBy: newDate,
            })
          } else {
            const year = new Date(
              Date.now() + 1000 * 60 * 60 * 24 * 90,
            ).getFullYear() // 90 days from now
            toast.error(
              `The date you entered looks invalid. Please use YYYY-MM-DD format.\nE.g. ${year}-09-30`,
              {
                duration: 8000,
              },
            )
          }
        }}
      />
    </ErrorBoundary>
  )
}

export function ActivityNumbers({
  question,
  alwaysExpand,
  manuallyExpanded,
  setManuallyExpanded,
  embedded,
}: {
  question: QuestionWithStandardIncludes
  alwaysExpand: boolean | undefined
  manuallyExpanded: boolean
  setManuallyExpanded: (expanded: boolean) => void
  embedded?: boolean
}) {
  const forecasters =
    (question as any).uniqueForecasterCount !== undefined
      ? (question as any).uniqueForecasterCount
      : new Set(question.forecasts.map((f) => f.userId)).size
  const forecasts = question.forecasts?.length ?? 0
  const numComments =
    (question.comments?.length ?? 0) + (question.notes ? 1 : 0)

  return (
    <div
      className={`${question.exclusiveAnswers ? "col-span-full" : ""} flex flex-row gap-2 text-sm text-neutral-400 justify-end hover:md:underline items-center`}
      onClick={() => !embedded && setManuallyExpanded(!manuallyExpanded)}
    >
      <InfoButton
        tooltip={`${forecasts} confidence update${
          forecasts !== 1 ? "s" : ""
        }, ${numComments} note${numComments !== 1 ? "s" : ""}`}
        showInfoButton={false}
        className="flex gap-2"
      >
        <span>
          {forecasts} <ReceiptPercentIcon className="w-4 h-4 shrink-0 inline" />
        </span>
        <span>
          {forecasters} <UserIcon className="w-4 h-4 shrink-0 inline" />
        </span>
        <span>
          {numComments}{" "}
          <ChatBubbleOvalLeftIcon className="w-4 h-4 shrink-0 inline" />
        </span>
      </InfoButton>
      {!alwaysExpand && (
        <button
          className={clsx("button p-0", embedded && "hidden")}
          aria-label="Show or hide details"
          title="Show or hide details"
        >
          <ChevronDownIcon
            className={clsx(
              "h-5 w-5 transition-transform",
              !manuallyExpanded && "transform rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  )
}
