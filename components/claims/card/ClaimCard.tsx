import { EllipsisVerticalIcon } from "@heroicons/react/20/solid"
import clsx from "clsx"
import { useRouter } from "next/router"
import { useState } from "react"
import { toast } from "react-hot-toast"
import { ClaimPreview, ClaimView } from "../../../lib/claims/service"
import { api } from "../../../lib/web/trpc"
import { QuestionWithStandardIncludes } from "../../../prisma/additional"
import { CommentBox, DeleteCommentOverflow } from "../../questions/CommentBox"
import { ResolveButton } from "../../questions/ResolveButton"
import { ConfirmDialog } from "../../ui/ConfirmDialog"
import { TimelineList } from "../ClaimTimeline"
import { ConfidenceForm } from "../ConfidenceRow"
import { formatDay } from "../labels"
import {
  ClaimEditForm,
  Draft,
  draftOf,
  partFields,
  partValue,
} from "./ClaimEditForm"
import {
  BTN_MAIN,
  BTN_OUTLINE,
  BTN_SMALL,
  CARD,
  ClaimFields,
  Headline,
  QuietLine,
  unconfirmedCount,
} from "./shared"

/** When something happened (a moment), on the viewer's own clock. */
const formatMoment = (when: string | Date) =>
  new Date(when).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

/** What the edit form changed, as one edit to save. */
function editFrom(
  draft: Draft,
  claim: ClaimView,
  /** the date in the form is one I am approving, even if it matches today's */
  dateIsMine = false,
) {
  const parts: Record<string, string | number | null> = {}
  for (const name of [...partFields(draft.shape), "valueHigh"]) {
    parts[name] = partValue(name, draft.parts[name] ?? "")
  }
  if (parts.comparison !== "between") parts.valueHigh = null
  const headline = draft.headline.trim() || null
  const link = draft.checkLinkUrl.trim() || null
  const words = draft.correctedText?.trim()
  return {
    headline: headline !== claim.headline ? headline : undefined,
    shape:
      draft.shape !== (claim.shape ?? "FREE_TEXT") ? draft.shape : undefined,
    parts,
    // a date I did not touch stays what it was: mine, or the app's default
    deadline:
      draft.deadline && (dateIsMine || draft.deadline !== claim.deadline)
        ? draft.deadline
        : undefined,
    checkLinkUrl: link !== claim.checkLinkUrl ? link : undefined,
    correctedText: words && words !== claim.text ? words : undefined,
  }
}

const RESULT_STYLE: Record<string, string> = {
  right: "tone-positive",
  wrong: "tone-negative",
  "can't tell": "tone-plain",
}

/**
 * The card in its saved state: one hunch or prediction, each fact shown
 * once. Used on the detail page, in the list when an item is opened, and
 * right after logging.
 */
export function ClaimCard({
  claimId,
  initial,
  onClose,
  closeLabel = "Close",
}: {
  claimId: string
  initial?: ClaimView
  /** when the card is opened in place (the list, or just after logging) */
  onClose?: () => void
  closeLabel?: string
}) {
  const utils = api.useContext()
  const router = useRouter()
  const claim = api.claims.get.useQuery(
    { claimId },
    { initialData: initial, retry: false },
  ).data
  // the same item as the rest of the app holds it: for its notes and its result
  const question = api.question.getQuestion.useQuery(
    { questionId: claimId },
    { retry: false },
  ).data as QuestionWithStandardIncludes | null | undefined

  const refresh = async () => {
    await utils.claims.invalidate()
    await utils.question.invalidate()
  }
  const after = {
    onSuccess: refresh,
    onError: (error: { message: string }) => {
      // a blocked save explains itself, one reason per line
      toast.error(error.message, { duration: 8000 })
    },
  }
  const [editing, setEditing] = useState(false)
  const [changingSure, setChangingSure] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [confirmingPublish, setConfirmingPublish] = useState(false)
  // "Sharpen": a proposal shown on the card; nothing changes until I approve
  const [proposal, setProposal] = useState<ClaimPreview | null>(null)
  const [sharpenNote, setSharpenNote] = useState<string | null>(null)
  const sharpen = api.claims.proposeSharpening.useMutation({
    onSuccess: (result) => {
      setProposal(result.preview)
      setSharpenNote(
        result.preview
          ? null
          : result.reason === "nothing"
            ? "The app has nothing to add to this one; you can edit it yourself."
            : "The app couldn't suggest a sharper version just now; you can edit it yourself.",
      )
    },
    onError: () => {
      setSharpenNote(
        "The app couldn't suggest a sharper version just now; you can edit it yourself.",
      )
    },
  })

  const edit = api.claims.edit.useMutation({
    ...after,
    onSuccess: async () => {
      setEditing(false)
      setProposal(null)
      setSharpenNote(null)
      await refresh()
    },
  })
  const confirmAll = api.claims.confirmAll.useMutation(after)
  const confirmCheckLink = api.claims.confirmCheckLink.useMutation(after)
  const setPublic = api.claims.setPublic.useMutation(after)
  const verify = api.claims.verifyHistory.useMutation()
  const undoResult = api.question.undoResolution.useMutation({
    onSettled: refresh,
  })
  const restore = api.claims.restore.useMutation({
    ...after,
    onSuccess: async () => {
      toast.success("Restored.")
      await refresh()
    },
  })
  const withdraw = api.claims.withdraw.useMutation({
    ...after,
    onSuccess: async () => {
      toast.success("Withdrawn. It is kept with its history.")
      await refresh()
      if (router.asPath.startsWith("/q/")) void router.push("/")
      else onClose?.()
    },
  })

  if (!claim) return null
  const locked = claim.resolved || claim.withdrawn
  const suggestions = unconfirmedCount(claim)
  const pick = (action: () => void) => () => {
    setMenuOpen(false)
    action()
  }
  const comments = question?.comments ?? []
  // The proposal as this item would look with it: the suggested headline and
  // parts, on top of what is already mine (how sure, the check link, the
  // date I said it, and my own date when the proposal has none).
  const proposed: ClaimView | null = proposal && {
    ...claim,
    headline: proposal.headline,
    shown: proposal.headline ?? claim.text,
    shape: proposal.shape,
    kind: proposal.kind,
    grade: proposal.grade,
    gradeReason: proposal.gradeReason,
    compound: proposal.compound,
    approximate: proposal.approximate,
    parts: {
      ...proposal.parts,
      ...(proposal.parts.deadline || !claim.parts.deadline
        ? {}
        : { deadline: claim.parts.deadline }),
    },
    ...(proposal.parts.deadline
      ? { deadline: proposal.deadline, deadlineKind: proposal.deadlineKind }
      : {}),
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        {/* status first: what state this item is in */}
        {claim.withdrawn && (
          <div
            role="status"
            className="tone-plain flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-3 py-2 text-sm"
          >
            <span>
              <span className="font-semibold text-ink">
                Withdrawn
                {claim.withdrawnAt
                  ? ` on ${formatMoment(claim.withdrawnAt)}`
                  : ""}
                .
              </span>{" "}
              Hidden everywhere, kept with its history.
            </span>
            <button
              className={clsx(BTN_OUTLINE, "ml-auto !py-1")}
              disabled={restore.isLoading}
              onClick={() => restore.mutate({ claimId })}
            >
              Restore
            </button>
          </div>
        )}
        {claim.sharedPublicly && !claim.withdrawn && (
          <div>
            {/* blue = information: this one is on my public track record */}
            <span className="tone-info inline-flex rounded px-2 py-0.5 text-xs font-semibold">
              Public
            </span>
          </div>
        )}
        {claim.resolved && claim.result && (
          <div
            role="status"
            className={clsx(
              "rounded-md px-3 py-2 text-sm",
              RESULT_STYLE[claim.result] ?? "tone-plain",
            )}
          >
            <span className="font-semibold">
              {claim.result === "right"
                ? "Right"
                : claim.result === "wrong"
                  ? "Wrong"
                  : "Can't tell"}
            </span>
            {question?.resolvedAt && (
              <span>
                {" · marked "}
                <span className="num">{formatMoment(question.resolvedAt)}</span>
              </span>
            )}
            {claim.closeCall && <span>{" · a close call"}</span>}
            {claim.actualResult && (
              <span>
                {" · actual: "}
                <span className="num">{claim.actualResult}</span>
              </span>
            )}
          </div>
        )}

        {editing ? (
          <ClaimEditForm
            // with a proposal showing, the form opens filled in with it
            claim={proposed ?? claim}
            mode="detail"
            busy={edit.isLoading}
            onCancel={() => setEditing(false)}
            onSave={(draft) =>
              edit.mutate({
                claimId,
                ...editFrom(draft, claim, !!proposal?.parts.deadline),
              })
            }
          />
        ) : (
          <>
            {proposed && (
              <div>
                <span className="tone-info inline-flex rounded px-2 py-0.5 text-xs font-semibold">
                  Suggested. Nothing has changed yet.
                </span>
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <Headline claim={proposed ?? claim} />
              <div className="relative shrink-0 -mr-2 -mt-1 flex items-center">
                {onClose && (
                  <button className={BTN_SMALL} onClick={onClose}>
                    {closeLabel}
                  </button>
                )}
                <button
                  type="button"
                  aria-label="More actions"
                  title="More actions"
                  aria-expanded={menuOpen}
                  className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <EllipsisVerticalIcon className="h-5 w-5" />
                </button>
                {menuOpen && (
                  <ul
                    role="menu"
                    className="absolute right-0 top-full z-40 m-0 w-48 list-none rounded-md border border-neutral-200 bg-white p-1 text-sm shadow-lg"
                  >
                    {[
                      !claim.withdrawn && {
                        label: "Withdraw",
                        run: () => setWithdrawOpen(true),
                      },
                      claim.resolved && {
                        label: "Undo the result",
                        run: () => undoResult.mutate({ questionId: claimId }),
                      },
                      {
                        label: historyOpen ? "Hide history" : "Show history",
                        run: () => setHistoryOpen(!historyOpen),
                      },
                      {
                        label: "Verify history",
                        run: () => {
                          setHistoryOpen(true)
                          verify.mutate({ claimId })
                        },
                      },
                    ]
                      .filter(
                        (item): item is { label: string; run: () => void } =>
                          !!item,
                      )
                      .map((item) => (
                        <li key={item.label} className="m-0 p-0">
                          <button
                            type="button"
                            role="menuitem"
                            className="w-full rounded px-3 py-2 text-left text-ink hover:bg-neutral-100"
                            onClick={pick(item.run)}
                          >
                            {item.label}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>

            <ClaimFields
              claim={proposed ?? claim}
              mode={proposed ? "preview" : "detail"}
              howSureAction={
                !locked &&
                !proposed &&
                !changingSure && (
                  <button
                    className={BTN_SMALL}
                    onClick={() => setChangingSure(true)}
                  >
                    {claim.probability === null ? "Add" : "Change"}
                  </button>
                )
              }
              checkLinkAction={
                !locked &&
                !proposed &&
                claim.checkLinkUrl &&
                !claim.checkLinkConfirmed && (
                  <button
                    className={BTN_SMALL}
                    title="Only once you have opened the link and it shows the thing measured"
                    disabled={confirmCheckLink.isLoading}
                    onClick={() => confirmCheckLink.mutate({ claimId })}
                  >
                    I opened it
                  </button>
                )
              }
            />

            {changingSure && (
              <ConfidenceForm
                claim={claim}
                onDone={() => setChangingSure(false)}
              />
            )}

            {!locked && !proposed && suggestions > 0 && (
              <p className="m-0 text-sm text-neutral-600">
                {suggestions === 1
                  ? "One part is a suggestion, not yet yours. "
                  : `${suggestions} parts are suggestions, not yet yours. `}
                <button
                  className={BTN_SMALL}
                  disabled={confirmAll.isLoading}
                  onClick={() => confirmAll.mutate({ claimId })}
                >
                  {suggestions === 1 ? "Confirm it" : "Confirm them"}
                </button>
              </p>
            )}

            {(claim.parent || claim.children.length > 0) && (
              <div className="flex flex-col gap-1 text-sm text-neutral-600">
                {claim.parent && (
                  <span>
                    Grew out of:{" "}
                    <a
                      className="underline underline-offset-2"
                      href={`/q/${claim.parent.id}`}
                    >
                      {claim.parent.text}
                    </a>
                  </span>
                )}
                {claim.children.map((child) => (
                  <span key={child.id}>
                    Sharpened into:{" "}
                    <a
                      className="underline underline-offset-2"
                      href={`/q/${child.id}`}
                    >
                      {child.text}
                    </a>
                  </span>
                ))}
              </div>
            )}

            <QuietLine
              claim={proposed ?? claim}
              mode={proposed ? "preview" : "detail"}
            />

            {proposed && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={BTN_MAIN}
                  disabled={edit.isLoading}
                  onClick={() =>
                    // the same save as the Edit form, untouched: one version
                    edit.mutate({
                      claimId,
                      ...editFrom(
                        draftOf(proposed),
                        claim,
                        !!proposal?.parts.deadline,
                      ),
                    })
                  }
                >
                  {edit.isLoading ? "Saving..." : "Approve and save"}
                </button>
                <button
                  className={BTN_OUTLINE}
                  disabled={edit.isLoading}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </button>
                <button
                  className={BTN_OUTLINE}
                  disabled={edit.isLoading}
                  onClick={() => setProposal(null)}
                >
                  Discard
                </button>
              </div>
            )}

            {confirmingPublish && !proposed && (
              // asked once, inside the card, never with a browser pop-up
              <div
                role="group"
                aria-label="Publish?"
                className="flex flex-col gap-3"
              >
                <p className="m-0 text-sm font-semibold text-ink">
                  Publish to your public track record?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={BTN_MAIN}
                    disabled={setPublic.isLoading}
                    onClick={() =>
                      setPublic.mutate(
                        { claimId, sharedPublicly: true },
                        { onSettled: () => setConfirmingPublish(false) },
                      )
                    }
                  >
                    {setPublic.isLoading ? "Publishing..." : "Publish"}
                  </button>
                  <button
                    className={BTN_OUTLINE}
                    disabled={setPublic.isLoading}
                    onClick={() => setConfirmingPublish(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!claim.withdrawn && !proposed && !confirmingPublish && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
                  {!claim.resolved &&
                    (claim.kind === "prediction" || claim.imported) &&
                    question && (
                      // the result menu opens under the button, inside the card
                      <div className="[&_[role=menu]]:left-0 [&_[role=menu]]:right-auto [&_[role=menu]]:origin-top-left">
                        <ResolveButton
                          question={question}
                          buttonClassName={BTN_MAIN}
                        />
                      </div>
                    )}
                  {!locked && (
                    <button
                      className={BTN_OUTLINE}
                      onClick={() => {
                        setChangingSure(false)
                        setEditing(true)
                      }}
                    >
                      Edit
                    </button>
                  )}
                  {!locked && claim.kind === "hunch" && !claim.imported && (
                    // outlined, not filled: a loose prediction is fine left loose
                    <button
                      className={BTN_OUTLINE}
                      disabled={sharpen.isLoading}
                      onClick={() => {
                        setSharpenNote(null)
                        setChangingSure(false)
                        sharpen.mutate({ claimId })
                      }}
                    >
                      {sharpen.isLoading ? "Working..." : "Sharpen"}
                    </button>
                  )}
                  {claim.sharedPublicly ? (
                    // one press: taking something off the public record is never held up
                    <button
                      className={BTN_OUTLINE}
                      disabled={setPublic.isLoading}
                      onClick={() =>
                        setPublic.mutate({ claimId, sharedPublicly: false })
                      }
                    >
                      Unpublish
                    </button>
                  ) : (
                    <button
                      className={BTN_OUTLINE}
                      disabled={!claim.canPublish || setPublic.isLoading}
                      onClick={() => {
                        setChangingSure(false)
                        setConfirmingPublish(true)
                      }}
                    >
                      Publish
                    </button>
                  )}
                </div>
                {sharpenNote && (
                  <p role="status" className="m-0 text-sm text-neutral-600">
                    {sharpenNote}
                  </p>
                )}
                {!claim.sharedPublicly && !claim.canPublish && (
                  <p className="m-0 text-xs text-neutral-500">
                    {claim.kind === "hunch"
                      ? `Not checkable yet, so it can't be published. ${claim.gradeReason}`
                      : `Can't be published yet. ${claim.publishBlockers.join(" ")}`}
                  </p>
                )}
              </div>
            )}

            {(historyOpen || verify.data) && (
              <div className="flex flex-col gap-3 border-t border-neutral-200 pt-3">
                {verify.isLoading && (
                  <p className="m-0 text-sm text-neutral-500">Checking...</p>
                )}
                {verify.data &&
                  (verify.data.ok ? (
                    <p
                      className="m-0 text-sm text-positive-text"
                      title={`Latest hash: ${verify.data.latestHash ?? "none"}`}
                    >
                      ✓ <span className="num">{verify.data.versions}</span>{" "}
                      version{verify.data.versions === 1 ? "" : "s"}, chain
                      intact
                    </p>
                  ) : (
                    <p className="m-0 text-sm text-negative-text">
                      ✗ Broken at version {verify.data.brokenAtVersion}.{" "}
                      {verify.data.problem}
                    </p>
                  ))}
                {historyOpen && <TimelineList claimId={claimId} />}
              </div>
            )}
          </>
        )}
      </section>

      {/* notes sit below the card */}
      {question &&
        (!claim.withdrawn || question.notes || comments.length > 0) && (
          <section className="not-prose flex flex-col gap-2" aria-label="Notes">
            <h3 className="m-0 text-sm font-semibold text-ink">Notes</h3>
            {question.notes && (
              <p className="m-0 whitespace-pre-line text-sm text-ink">
                {question.notes}
              </p>
            )}
            {comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-2 text-sm">
                <div className="min-w-0 grow">
                  <div className="num text-xs text-neutral-500">
                    {formatDay(
                      new Date(comment.createdAt).toISOString().slice(0, 10),
                    )}
                  </div>
                  <div className="whitespace-pre-line break-words text-ink">
                    {comment.comment}
                  </div>
                </div>
                <DeleteCommentOverflow question={question} comment={comment} />
              </div>
            ))}
            {!claim.withdrawn && <CommentBox question={question} />}
          </section>
        )}

      <ConfirmDialog
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        title="Withdraw this?"
        confirmLabel="Withdraw"
        onConfirm={() => withdraw.mutate({ claimId })}
      >
        It will be hidden but kept with its history. You can restore it later
        from the Withdrawn filter.
      </ConfirmDialog>
    </div>
  )
}
