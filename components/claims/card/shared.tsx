import { ClaimShape } from "@prisma/client"
import clsx from "clsx"
import { ReactNode } from "react"
import { ClaimView } from "../../../lib/claims/service"
import { allowedParts, SHAPE_PARTS } from "../../../lib/claims/types"
import {
  COMPARISON_LABELS,
  CONFIDENCE_LABELS,
  formatDay,
  PART_LABELS,
} from "../labels"

/** Where it was logged from, for the quiet line. */
const LOGGED_FROM: Record<string, string> = {
  WEB: "the web",
  API: "the API",
  PHONE: "phone",
  AGENT: "an agent",
  SYSTEM: "the app",
}

/**
 * One card design, two states. The preview (nothing saved yet) and the
 * detail page (a saved item) show the same facts in the same order, each
 * once, and share the same edit form.
 */

/** What both states can show: a saved item, or a preview of one. */
export type CardClaim = Omit<ClaimView, "id" | "url">

// The one filled button on screen, and its quieter neighbours.
export const BTN_MAIN =
  "inline-flex items-center justify-center rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-50 disabled:cursor-not-allowed"
export const BTN_OUTLINE =
  "inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
export const BTN_TEXT =
  "text-sm text-neutral-600 underline underline-offset-2 hover:text-ink disabled:opacity-50"
export const BTN_SMALL =
  "text-sm font-semibold text-ink underline underline-offset-2 hover:text-neutral-600 disabled:opacity-50 whitespace-nowrap"
export const INPUT =
  "w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-base sm:text-sm text-ink placeholder:text-neutral-400 focus:border-ink focus:outline-none"

/** The card itself: white, a thin grey border, even padding. */
export const CARD =
  "not-prose rounded-xl border border-neutral-200 bg-white p-4 sm:p-6 flex flex-col gap-4 text-ink text-left"

/** The shape, in plain words, for the quiet line. */
export const SHAPE_PLAIN: Record<ClaimShape, string> = {
  NUMBER_BY_DATE: "A number by a date",
  EVENT_BY_DATE: "An event by a date",
  A_BEATS_B: "One thing beating another",
  RANK_OR_AWARD: "A rank or an award",
  FREE_TEXT: "No shape yet",
}

/** A label with its value: stacked on a phone, side by side on a desktop. */
export function Field({
  label,
  children,
  action,
}: {
  label: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[9rem_1fr_auto] gap-x-4 gap-y-0.5 items-baseline">
      <div className="text-xs text-neutral-500 max-sm:col-span-2 sm:text-sm">
        {label}
      </div>
      <div className="min-w-0 break-words text-ink">{children}</div>
      {action ? <div className="justify-self-end">{action}</div> : <span />}
    </div>
  )
}

/** Shown only on something I have not confirmed. Yellow = needs a look. */
export function Marker({
  children,
  title,
}: {
  children: ReactNode
  title?: string
}) {
  return (
    <span
      title={title}
      className="tone-change ml-2 inline-flex rounded px-1.5 py-0.5 align-middle text-[11px] font-medium whitespace-nowrap"
    >
      {children}
    </span>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <span className="text-neutral-400">{children}</span>
}

export const percent = (probability: number) =>
  `${Math.round(probability * 1000) / 10}%`

/** The part rows a shape shows, in order (the deadline has its own row). */
export function partNamesFor(claim: Pick<CardClaim, "shape" | "parts">) {
  const shape = claim.shape ?? "FREE_TEXT"
  const required = SHAPE_PARTS[shape].required as readonly string[]
  return allowedParts(shape).filter(
    (name) =>
      name !== "deadline" &&
      (required.includes(name) ||
        claim.parts[name as keyof typeof claim.parts] !== undefined ||
        (name === "valueHigh"
          ? claim.parts.comparison?.value === "between"
          : false)),
  )
}

/** How many parts are still suggestions rather than mine. */
export function unconfirmedCount(claim: Pick<CardClaim, "parts">) {
  return Object.values(claim.parts).filter(
    (part) => part && part.status !== "stated",
  ).length
}

/**
 * The headline (or my words when there is none), and under it what I
 * originally said.
 */
export function Headline({ claim }: { claim: CardClaim }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <h2 className="m-0 text-xl sm:text-2xl font-semibold leading-snug text-ink break-words">
        {claim.headline ?? claim.text}
      </h2>
      {claim.headline && (
        <p className="m-0 text-sm text-neutral-500 break-words">
          Originally said: “{claim.text}”
        </p>
      )}
    </div>
  )
}

/**
 * The rows, each fact once: the outcome parts, the deadline, how sure,
 * the check link.
 */
export function ClaimFields({
  claim,
  mode,
  howSureAction,
  checkLinkAction,
}: {
  claim: CardClaim
  mode: "preview" | "detail"
  howSureAction?: ReactNode
  checkLinkAction?: ReactNode
}) {
  const shape = claim.shape ?? "FREE_TEXT"
  const required = SHAPE_PARTS[shape].required as readonly string[]
  const unconfirmed = mode === "preview" ? "suggested" : "not confirmed"
  const deadlinePart = claim.parts.deadline
  return (
    <div className="flex flex-col gap-3 text-base sm:text-sm">
      {partNamesFor(claim).map((name) => {
        const part = claim.parts[name as keyof typeof claim.parts]
        const numeric = name === "value" || name === "valueHigh"
        return (
          <Field key={name} label={PART_LABELS[name] ?? name}>
            {part ? (
              <>
                <span className={clsx(numeric && "num")}>
                  {name === "comparison"
                    ? COMPARISON_LABELS[String(part.value)] ??
                      String(part.value)
                    : String(part.value)}
                </span>
                {part.status !== "stated" && (
                  <Marker
                    title={
                      part.status === "extracted"
                        ? "Read from your words by the AI. Not yours until you approve it"
                        : "A default the app suggested. Not yours until you approve it"
                    }
                  >
                    {unconfirmed}
                  </Marker>
                )}
              </>
            ) : (
              <Empty>{required.includes(name) ? "missing" : "not set"}</Empty>
            )}
          </Field>
        )
      })}
      <Field
        label={claim.deadlineKind === "deadline" ? "Deadline" : "Check back by"}
      >
        <span className="num">{formatDay(claim.deadline)}</span>
        {deadlinePart && deadlinePart.status !== "stated" && (
          <Marker>{unconfirmed}</Marker>
        )}
        {!deadlinePart && (
          <Marker title="You gave no date, so the app picked this one. Change it any time.">
            default
          </Marker>
        )}
      </Field>
      <Field label="How sure" action={howSureAction}>
        {claim.probability === null ? (
          <Empty>
            {mode === "preview"
              ? "not given; add it after saving"
              : "not given"}
          </Empty>
        ) : (
          <>
            <span className="num font-semibold">
              {percent(claim.probability)}
            </span>
            {claim.confidenceWord && (
              <span className="text-neutral-500">
                {" · "}
                {CONFIDENCE_LABELS[claim.confidenceWord]}
              </span>
            )}
          </>
        )}
      </Field>
      <Field label="Check link" action={checkLinkAction}>
        {claim.checkLinkUrl ? (
          <>
            <a
              className="underline underline-offset-2 break-all"
              href={claim.checkLinkUrl}
              target="_blank"
              rel="noreferrer"
            >
              {claim.checkLinkUrl}
            </a>
            {!claim.checkLinkConfirmed && (
              <Marker title="Open it, check it shows the thing measured, then confirm">
                not confirmed
              </Marker>
            )}
          </>
        ) : (
          <Empty>
            {mode === "preview" ? "none; add it after saving" : "none"}
          </Empty>
        )}
      </Field>
    </div>
  )
}

/**
 * One quiet grey line: hunch or prediction, the grade and why, the shape
 * in plain words, the date I said it and where it was logged from.
 */
export function QuietLine({
  claim,
  mode,
}: {
  claim: CardClaim
  mode: "preview" | "detail"
}) {
  const kind =
    mode === "preview"
      ? claim.kind === "prediction"
        ? "Would be a prediction"
        : "Would be a hunch"
      : claim.kind === "prediction"
        ? "Prediction"
        : "Hunch"
  const bits = [
    kind,
    `Grade ${claim.grade}: ${claim.gradeReason}`,
    SHAPE_PLAIN[claim.shape ?? "FREE_TEXT"],
    `Said ${formatDay(claim.claimDate)}${
      claim.backDated
        ? ` (logged ${formatDay(claim.loggedAt.slice(0, 10))})`
        : ""
    }`,
    mode === "detail" && claim.entrySource
      ? `Logged from ${LOGGED_FROM[claim.entrySource] ?? claim.entrySource}`
      : null,
    claim.imported ? "Imported" : null,
    claim.approximate ? 'Approximate ("about")' : null,
  ].filter(Boolean)
  return (
    <p className="m-0 border-t border-neutral-200 pt-3 text-xs leading-relaxed text-neutral-500">
      {bits.map((bit, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden> · </span>}
          {bit}
        </span>
      ))}
    </p>
  )
}
