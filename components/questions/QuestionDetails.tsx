import { calendarDay } from "../../lib/claims/calendar"
import { ConfirmDialog } from "../ui/ConfirmDialog"
import {
  EllipsisVerticalIcon,
  InformationCircleIcon,
} from "@heroicons/react/20/solid"
import { Forecast, Resolution } from "@prisma/client"
import { useRouter } from "next/router"
import { Fragment, LegacyRef, ReactNode, forwardRef, useState } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { toast } from "react-hot-toast"
import {
  displayForecast,
  forecastHiddenReasonText,
  forecastsAreHidden,
  formatDecimalNicely,
  getCommunityForecast,
} from "../../lib/_utils_common"
import { api } from "../../lib/web/trpc"
import {
  invalidateQuestion,
  signInToFatebook,
  useUserId,
} from "../../lib/web/utils"
import { QuestionWithStandardIncludes } from "../../prisma/additional"
import { ClaimPanel } from "../claims/ClaimPanel"
import { FormattedDate } from "../ui/FormattedDate"
import { InfoButton } from "../ui/InfoButton"
import { PromptDialog } from "../ui/PromptDialog"
import { Username } from "../ui/Username"
import { CommentBox, DeleteCommentOverflow } from "./CommentBox"
import { TagsSelect } from "./TagsSelect"
import { resultLabel } from "../../lib/claims/words"

interface QuestionDetailsProps {
  question: QuestionWithStandardIncludes
  hideOthersForecastsIfSharedWithUser?: boolean
}
// eslint-disable-next-line @typescript-eslint/naming-convention
export const QuestionDetails = forwardRef(function QuestionDetails(
  { question, hideOthersForecastsIfSharedWithUser }: QuestionDetailsProps,
  ref: LegacyRef<HTMLDivElement>,
) {
  const userId = useUserId()
  const hideOthersForecasts =
    hideOthersForecastsIfSharedWithUser &&
    question.userId !== userId &&
    !question.resolution &&
    (question.forecasts.filter((f) => f.userId !== userId).length > 0 ||
      question.comments.filter((c) => c.userId !== userId).length > 0) &&
    !forecastsAreHidden(question, userId)
  const [showEvents, setShowEvents] = useState<boolean>(!hideOthersForecasts)

  const utils = api.useContext()
  const setTags = api.tags.setQuestionTags.useMutation({
    async onSuccess() {
      await invalidateQuestion(utils, question)
      await utils.tags.getAll.invalidate()
    },
  })

  return (
    <div
      className="bg-neutral-50 border border-t-0 border-neutral-200 px-4 sm:px-8 py-4 text-sm flex flex-col gap-4 rounded-b-xl"
      onClick={(e) => e.stopPropagation()}
      ref={ref}
    >
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        {/* the claim standard: grade, engine question, outcome parts */}
        {userId && userId === question.userId && (
          <ClaimPanel claimId={question.id} />
        )}
        {!userId && (
          <div className="flex w-full p-4">
            <button
              className="button primary mx-auto"
              onClick={() => void signInToFatebook()}
            >
              Sign in
            </button>
          </div>
        )}

        {userId && (
          <div className="flex gap-2">
            <div className="grow">
              <TagsSelect
                disabled={!userId}
                tags={question.tags.map((t) => t.name)}
                setTags={(tags) => {
                  setTags.mutate({
                    questionId: question.id,
                    tags,
                  })
                }}
              />
            </div>
            {userId && userId === question.userId && (
              <EditQuestionOverflow question={question} />
            )}
          </div>
        )}
        {forecastsAreHidden(question, userId) && (
          <div className="mt-2 mb-2 text-sm text-neutral-600 font-semibold flex items-center gap-4 tone-info px-4 py-2 rounded-md">
            <InformationCircleIcon className="w-6 h-6 text-info" />
            {`Other people's confidence is hidden ${forecastHiddenReasonText(
              question,
            )} to reduce anchoring.`}
          </div>
        )}
        {showEvents ? (
          <EventsLog question={question} />
        ) : (
          <button className="btn mx-auto" onClick={() => setShowEvents(true)}>
            See confidence updates and notes
          </button>
        )}
        <CommentBox question={question} />
      </ErrorBoundary>
    </div>
  )
})

function EventsLog({ question }: { question: QuestionWithStandardIncludes }) {
  const userId = useUserId()

  function getExclusiveMcqResolutionString(
    question: QuestionWithStandardIncludes,
  ) {
    if (question.resolution === Resolution.NO) {
      return '"Other"'
    }
    const option = question.options?.find((opt) => opt.resolution === "YES")
    return option ? `"${option.text}"` : question.resolution
  }

  function forecastElement(forecast: Forecast) {
    if (forecastsAreHidden(question, userId)) {
      return (
        <InfoButton
          tooltip={`This is hidden ${forecastHiddenReasonText(question)}`}
          showInfoButton={false}
        >
          <span className="font-bold text-lg text-ink opacity-70">
            {displayForecast(forecast, 2)}
          </span>
        </InfoButton>
      )
    } else {
      return (
        <span className="font-bold text-lg text-ink">
          {displayForecast(forecast, 2)}
        </span>
      )
    }
  }

  const forecastEvents: { timestamp: Date; el: ReactNode }[] =
    question.type === "MULTIPLE_CHOICE"
      ? question
          .options!.map((o) =>
            o.forecasts.map((f) => ({
              timestamp: f.createdAt || new Date(),
              el: (
                <Fragment key={f.id}>
                  <Username
                    user={f.user}
                    className="font-semibold"
                    unknownUserReason={
                      forecastsAreHidden(question, userId)
                        ? `This is hidden ${forecastHiddenReasonText(question)}`
                        : undefined
                    }
                  />
                  <span className="font-bold overflow-x-auto">{o.text}</span>
                  {forecastElement(f)}
                  <div className="text-neutral-400">
                    <FormattedDate date={f.createdAt || new Date()} />
                  </div>
                </Fragment>
              ),
            })),
          )
          .flat()
      : question.forecasts.map((f) => ({
          timestamp: f.createdAt,
          el: (
            <Fragment key={f.id}>
              <Username
                user={f.user}
                className="font-semibold"
                unknownUserReason={
                  forecastsAreHidden(question, userId)
                    ? `This is hidden ${forecastHiddenReasonText(question)}`
                    : undefined
                }
              />
              <span />
              {forecastElement(f)}
              <div className="text-neutral-400">
                <FormattedDate date={f.createdAt} />
              </div>
            </Fragment>
          ),
        }))

  let events: { timestamp: Date; el: ReactNode }[] = [
    forecastEvents,
    question.comments &&
      question.comments.map((c) => ({
        timestamp: c.createdAt,
        el: (
          <Fragment key={c.id}>
            <span>
              <Username user={c.user} className="font-semibold" />
            </span>
            <span />
            <span />
            <span className="text-neutral-400 inline-flex justify-between w-full">
              <FormattedDate date={c.createdAt} className="my-auto" />
              <DeleteCommentOverflow question={question} comment={c} />
            </span>
            <span className="md:pl-7 col-span-4 -mt-1 min-w-0 whitespace-pre-line">
              {c.comment}
            </span>
          </Fragment>
        ),
      })),
    [
      ...(question.notes
        ? [
            {
              timestamp: question.createdAt,
              el: (
                <Fragment key={`${question.id} note`}>
                  <span>
                    <Username user={question.user} className="font-semibold" />
                  </span>
                  <span />
                  <span />

                  <span className="text-neutral-400">
                    <FormattedDate date={question.createdAt} />
                  </span>
                  <span className="md:pl-7 col-span-4 -mt-1">
                    {question.notes}
                  </span>
                </Fragment>
              ),
            },
          ]
        : []),
    ],
    [
      ...(question.resolvedAt &&
      (question.type === "BINARY" ||
        (question.type === "MULTIPLE_CHOICE" &&
          question.exclusiveAnswers &&
          question.options))
        ? [
            {
              timestamp: question.resolvedAt,
              el: (
                <Fragment key={`${question.id} resolution`}>
                  <Username user={question.user} className="font-semibold" />
                  <span />
                  <span className="italic text-ink overflow-x-auto">
                    Resolved{" "}
                    {question.type === "MULTIPLE_CHOICE" && question.options
                      ? getExclusiveMcqResolutionString(question)
                      : resultLabel(question.resolution).toLowerCase()}
                  </span>
                  <span className="text-neutral-400">
                    <FormattedDate date={question.resolvedAt} />
                  </span>
                </Fragment>
              ),
            },
          ]
        : []),
    ],
    ...(question.options &&
    question.type === "MULTIPLE_CHOICE" &&
    !question.exclusiveAnswers
      ? question.options
          .filter((option) => option.resolvedAt)
          .map((option) => ({
            timestamp: option.resolvedAt!,
            el: (
              <Fragment key={`${question.id}-${option.id}-resolution`}>
                <span>
                  <Username user={question.user} className="font-semibold" />
                </span>
                <span />
                <span className="italic text-ink overflow-x-auto">
                  Resolved &ldquo;{option.text}&rdquo;{" "}
                  {option.resolution
                    ? resultLabel(option.resolution).toLowerCase()
                    : "unknown"}
                </span>
                <span className="text-neutral-400">
                  <FormattedDate date={option.resolvedAt!} />
                </span>
              </Fragment>
            ),
          }))
      : []),
  ].flat()

  const numForecasters = new Set(question.forecasts.map((f) => f.userId)).size
  const communityAverage =
    question.type === "BINARY" &&
    !forecastsAreHidden(question, userId) &&
    numForecasters > 1 &&
    getCommunityForecast(question, new Date())

  const getCommunityAverageForOption = (optionId: string) => {
    const optionForecasts =
      question.options?.find((o) => o.id === optionId)?.forecasts || []
    const numOptionForecasters = new Set(optionForecasts.map((f) => f.userId))
      .size
    if (numOptionForecasters <= 1 || forecastsAreHidden(question, userId))
      return false
    return getCommunityForecast(
      { forecasts: optionForecasts } as any,
      new Date(),
    )
  }

  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <div className="grid grid-cols-[minmax(80px,_auto)_minmax(0,_300px)_auto_auto] gap-2 items-center max-h-[48vh] overflow-y-auto showScrollbar">
        {events.length ? (
          events
            .sort(
              (a, b) => a.timestamp.getTime() - b.timestamp.getTime(), // chronological
            )
            .map((event) => event?.el)
        ) : (
          <span className="text-sm text-neutral-400 italic select-none md:ml-4">
            No confidence given yet
          </span>
        )}
      </div>
      {question.type === "MULTIPLE_CHOICE" && question.options ? (
        question.options.some((option) => {
          const numOptionForecasters = new Set(
            option.forecasts?.map((f) => f.userId),
          ).size
          return (
            numOptionForecasters > 1 && !forecastsAreHidden(question, userId)
          )
        }) ? (
          <div className="mx-auto flex flex-col gap-2 mt-4 bg-neutral-50 outline outline-neutral-200 px-4 py-2 rounded-md">
            <span className="font-semibold text-center flex flex-row gap-x-1 mx-auto">
              Community Averages
              <InfoButton tooltip="The average of everyone's latest confidence for each option" />
            </span>
            <div className="flex flex-row flex-wrap gap-x-4 justify-center w-full">
              {question.options.map((option) => {
                const optionAverage = getCommunityAverageForOption(option.id)
                if (optionAverage === false) return null
                return (
                  <div key={option.id} className="flex gap-2 items-center">
                    <span className="font-medium text-sm">{option.text}</span>
                    <span className="font-bold text-lg text-ink">
                      {formatDecimalNicely(optionAverage * 100, 1)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null
      ) : (
        communityAverage !== false && (
          <div className="mx-auto flex gap-2 items-center mt-4">
            <span className="font-semibold">Community:</span>
            <span className="font-bold text-xl text-ink">
              {formatDecimalNicely(communityAverage * 100, 1)}%
            </span>
            <InfoButton tooltip="The average of everyone's latest confidence" />
          </div>
        )
      )}
    </ErrorBoundary>
  )
}

function EditQuestionOverflow({
  question,
}: {
  question: QuestionWithStandardIncludes
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [editTitleDialogOpen, setEditTitleDialogOpen] = useState(false)
  const [editDateDialogOpen, setEditDateDialogOpen] = useState(false)
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false)
  const [headlineDialogOpen, setHeadlineDialogOpen] = useState(false)
  const utils = api.useContext()
  const router = useRouter()

  // Withdraw goes through the same service as the connector's
  // withdraw_claim: hidden, never deleted, recorded as a version.
  const withdraw = api.claims.withdraw.useMutation({
    async onSuccess() {
      toast.success("Withdrawn. It is kept with its history.")
      await utils.question.invalidate()
      await utils.claims.invalidate()
      if (router.asPath.startsWith("/q/")) {
        void router.push("/")
      }
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })
  const setHeadline = api.claims.setHeadline.useMutation({
    async onSuccess() {
      await utils.question.invalidate()
      await utils.claims.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })
  const editQuestion = api.question.editQuestion.useMutation({
    async onSuccess() {
      await invalidateQuestion(utils, question)
      await utils.claims.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  // a withdrawn item can only be restored (see the panel above this menu)
  if (question.withdrawnAt) return null

  const pick = (open: () => void) => () => {
    setIsVisible(false)
    open()
  }

  return (
    <>
      <div className="dropdown dropdown-end not-prose">
        <button
          type="button"
          aria-label="More actions"
          title="More actions"
          aria-expanded={isVisible}
          className="btn btn-xs btn-ghost"
          onClick={() => setIsVisible(!isVisible)}
        >
          <EllipsisVerticalIcon height={15} />
        </button>
        {isVisible && (
          <ul className="dropdown-content z-50 menu p-2 glass-pop rounded-box w-52">
            <li>
              <button
                type="button"
                onClick={pick(() => setHeadlineDialogOpen(true))}
              >
                {question.headline ? "Edit headline" : "Add a headline"}
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={pick(() => setEditTitleDialogOpen(true))}
              >
                Correct my words
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={pick(() => setEditDateDialogOpen(true))}
              >
                Change the date
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={pick(() => setWithdrawDialogOpen(true))}
              >
                Withdraw
              </button>
            </li>
          </ul>
        )}
      </div>

      <PromptDialog
        isOpen={headlineDialogOpen}
        onClose={() => setHeadlineDialogOpen(false)}
        title={question.headline ? "Edit headline" : "Add a headline"}
        description="A clear, sharp statement of what you meant. It is what shows everywhere. Your original words are kept underneath, unchanged. Leave it empty to remove the headline."
        defaultValue={question.headline ?? ""}
        submitLabel="Save"
        onSubmit={(value) => {
          const headline = value.trim()
          if (headline !== (question.headline ?? "")) {
            setHeadline.mutate({
              claimId: question.id,
              headline: headline || null,
            })
          }
        }}
      />

      <ConfirmDialog
        isOpen={withdrawDialogOpen}
        onClose={() => setWithdrawDialogOpen(false)}
        title="Withdraw this?"
        confirmLabel="Withdraw"
        onConfirm={() => withdraw.mutate({ claimId: question.id })}
      >
        It will be hidden but kept with its history. You can restore it later
        from the Withdrawn filter.
      </ConfirmDialog>

      <PromptDialog
        isOpen={editTitleDialogOpen}
        onClose={() => setEditTitleDialogOpen(false)}
        title="Correct my words"
        description="Only for when your words were recorded wrongly. To say it more clearly, edit the headline instead. The correction is recorded in its history."
        defaultValue={question.title}
        submitLabel="Save"
        onSubmit={(newTitle) => {
          if (newTitle && newTitle !== question.title) {
            editQuestion.mutate({
              questionId: question.id,
              title: newTitle,
            })
          }
        }}
      />

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
    </>
  )
}
