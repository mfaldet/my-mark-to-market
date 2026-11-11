import clsx from "clsx"
import Link from "next/link"
import { ClaimView } from "../../lib/claims/service"
import { api } from "../../lib/web/trpc"
import { useUserId } from "../../lib/web/utils"

/**
 * What needs my attention: predictions due within 7 days, anything past
 * its deadline that is not resolved, and hunches whose "check back by"
 * date has passed. Most pressing first.
 */
export function DueList() {
  const userId = useUserId()
  const due = api.claims.list.useQuery(
    { due: "soon_or_overdue", limit: 100 },
    { enabled: !!userId },
  )

  if (!userId)
    return <p className="text-neutral-500">Sign in to see what is due.</p>
  if (due.isLoading) return <p className="text-neutral-400">Loading…</p>

  // A hunch has no deadline to count down to, only a date to check back.
  // It appears here once that date has passed.
  const items = (due.data ?? []).filter(
    (item) => item.due === "overdue" || item.kind === "prediction",
  )

  if (items.length === 0) {
    return <p className="text-neutral-500">Nothing due right now.</p>
  }

  return (
    <ul className="flex flex-col gap-2 not-prose">
      {items.map((item) => (
        <DueRow key={item.id} item={item} />
      ))}
    </ul>
  )
}

function DueRow({ item }: { item: ClaimView }) {
  const overdue = item.due === "overdue"
  // an imported entry has no outcome, but it is not a hunch to sharpen:
  // it only needs its result recorded
  const isHunch = item.kind === "hunch" && !item.imported
  return (
    <li>
      <Link
        href={`/q/${item.id}`}
        className="block glass rounded-xl p-3 hover:shadow-md transition-shadow no-underline"
      >
        <div className="font-semibold text-neutral-900">{item.shown}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className={isHunch ? "kind-hunch" : "kind-prediction"}>
            {isHunch ? "Hunch" : item.imported ? "Imported" : "Prediction"}
          </span>
          <span
            className={clsx(
              "font-medium",
              // red = urgent: past its date
              overdue ? "text-negative-text" : "text-neutral-600",
            )}
          >
            {isHunch
              ? `Check-back date passed (${item.dueText})`
              : capitalise(item.dueText ?? "")}
          </span>
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          {isHunch
            ? "Sharpen it into a prediction, move the date, or withdraw it."
            : overdue
              ? "How did it turn out? Open it to mark it right or wrong."
              : "Coming up."}
        </div>
      </Link>
    </li>
  )
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
