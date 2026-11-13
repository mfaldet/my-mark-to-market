import clsx from "clsx"
import { useState } from "react"
import { toast } from "react-hot-toast"
import TextareaAutosize from "react-textarea-autosize"
import { ClaimView, NoteView } from "../../../lib/claims/service"
import { api } from "../../../lib/web/trpc"
import { formatDay } from "../labels"
import { BTN_OUTLINE, BTN_SMALL, BTN_TEXT, INPUT, percent } from "./shared"

/**
 * My notes on a prediction, newest first: the ones I write here, and the
 * reason I gave with a change in how sure I was (shown with that change).
 * Each is private unless I switch it to public. A public note is locked,
 * and leaves the app only while its prediction is published.
 */
export function Notes({
  claim,
  legacyNote,
}: {
  claim: ClaimView
  /** the older free-text field, from before notes were a list; always private */
  legacyNote?: string | null
}) {
  const utils = api.useContext()
  const after = {
    onSuccess: async () => {
      await utils.claims.invalidate()
      await utils.question.invalidate()
    },
    onError: (error: { message: string }) => {
      toast.error(error.message, { duration: 8000 })
    },
  }
  const [text, setText] = useState("")
  const [link, setLink] = useState("")
  const [showLink, setShowLink] = useState(false)
  const add = api.claims.addNote.useMutation({
    ...after,
    onSuccess: async () => {
      setText("")
      setLink("")
      setShowLink(false)
      await after.onSuccess()
    },
  })

  if (claim.withdrawn && claim.notes.length === 0 && !legacyNote) return null
  return (
    <section className="not-prose flex flex-col gap-3" aria-label="Notes">
      <h3 className="m-0 text-sm font-semibold text-ink">Notes</h3>

      {!claim.withdrawn && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim() || add.isLoading) return
            add.mutate({
              claimId: claim.id,
              text: text.trim(),
              link: link.trim() || null,
            })
          }}
        >
          <TextareaAutosize
            aria-label="Add a note"
            className={`${INPUT} resize-none`}
            minRows={2}
            placeholder="Add a note. It is private unless you make it public."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {showLink && (
            <input
              aria-label="Link to a source"
              type="url"
              className={INPUT}
              placeholder="https://… a link to a source (optional)"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className={BTN_OUTLINE}
              disabled={!text.trim() || add.isLoading}
            >
              {add.isLoading ? "Adding..." : "Add note"}
            </button>
            {!showLink && (
              <button
                type="button"
                className={BTN_TEXT}
                onClick={() => setShowLink(true)}
              >
                Add a link to a source
              </button>
            )}
          </div>
        </form>
      )}

      {claim.notes.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {claim.notes.map((note) => (
            <Note
              key={note.id}
              note={note}
              locked={claim.withdrawn}
              published={claim.sharedPublicly}
              after={after}
            />
          ))}
        </ul>
      )}

      {legacyNote && (
        <p className="m-0 whitespace-pre-line border-t border-neutral-200 pt-3 text-sm text-ink">
          {legacyNote}
          <span className="block text-xs text-neutral-500">
            An older note, always private.
          </span>
        </p>
      )}
    </section>
  )
}

function Note({
  note,
  locked,
  published,
  after,
}: {
  note: NoteView
  locked: boolean
  published: boolean
  after: {
    onSuccess: () => Promise<void>
    onError: (e: { message: string }) => void
  }
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.text)
  const [link, setLink] = useState(note.link ?? "")
  const setPublic = api.claims.setNotePublic.useMutation(after)
  const remove = api.claims.deleteNote.useMutation(after)
  const edit = api.claims.editNote.useMutation({
    ...after,
    onSuccess: async () => {
      setEditing(false)
      await after.onSuccess()
    },
  })
  const change = note.confidenceChange

  return (
    <li className="m-0 flex flex-col gap-1.5 border-t border-neutral-200 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span className="num">{formatDay(note.at.slice(0, 10))}</span>
        {change && (
          <span className="num text-ink">
            {change.from === null
              ? `How sure: ${percent(change.to)}`
              : `${percent(change.from)} to ${percent(change.to)}`}
          </span>
        )}
        <label
          className={clsx(
            "ml-auto flex items-center gap-2",
            locked ? "text-neutral-400" : "cursor-pointer text-ink",
          )}
        >
          {/* blue = information: this note is, or would be, on my public record */}
          <span
            className={clsx(
              note.isPublic &&
                "tone-info rounded px-1.5 py-0.5 text-xs font-semibold",
            )}
          >
            {note.isPublic ? "Public" : "Private"}
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label={
              note.isPublic ? "Make this note private" : "Make this note public"
            }
            className="toggle toggle-xs"
            checked={note.isPublic}
            disabled={setPublic.isLoading || (locked && !note.isPublic)}
            onChange={(e) =>
              setPublic.mutate({ noteId: note.id, isPublic: e.target.checked })
            }
          />
        </label>
      </div>

      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim()) return
            edit.mutate({
              noteId: note.id,
              text: text.trim(),
              link: link.trim() || null,
            })
          }}
        >
          <TextareaAutosize
            aria-label="Note"
            className={`${INPUT} resize-none`}
            minRows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <input
            aria-label="Link to a source"
            type="url"
            className={INPUT}
            placeholder="https://… a link to a source (optional)"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              type="submit"
              className={BTN_OUTLINE}
              disabled={edit.isLoading || !text.trim()}
            >
              Save
            </button>
            <button
              type="button"
              className={BTN_TEXT}
              onClick={() => {
                setText(note.text)
                setLink(note.link ?? "")
                setEditing(false)
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="m-0 whitespace-pre-line break-words text-base text-ink sm:text-sm">
            {note.text}
          </p>
          {note.link && (
            <a
              className="break-all underline underline-offset-2"
              href={note.link}
              target="_blank"
              rel="noreferrer"
            >
              {note.link}
            </a>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
            {note.isPublic ? (
              <span>
                {published
                  ? "On your public track record. Its words are locked while it is public."
                  : "Public, but it shows nowhere until this prediction is published. Its words are locked while it is public."}
              </span>
            ) : (
              !locked && (
                <>
                  <button
                    className={`${BTN_SMALL} !text-xs`}
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                  <button
                    className={`${BTN_TEXT} !text-xs`}
                    disabled={remove.isLoading}
                    onClick={() => remove.mutate({ noteId: note.id })}
                  >
                    Remove
                  </button>
                </>
              )
            )}
          </div>
        </>
      )}
    </li>
  )
}
