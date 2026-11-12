/** A short guide to how this app works, shown beside the list on desktop. */
export function HowItWorks() {
  const steps = [
    {
      title: "Write a hunch",
      body: "Say it in your own words. It can be loose.",
    },
    {
      title: "Approve a clear version",
      body: "The app proposes a headline and the parts that make it checkable. Nothing is saved until you approve, and you can edit anything first. Your original words are always kept under the headline.",
    },
    {
      title: "Say how sure you are",
      body: "A word like “likely” or “toss-up”, or a number. Change it whenever your view changes; every change is kept.",
    },
    {
      title: "Come back when it's due",
      body: "Mark a prediction right or wrong. That builds your track record.",
    },
  ]
  return (
    <div className="not-prose text-sm">
      <h3 className="font-semibold text-base mb-2">How it works</h3>
      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-xs font-semibold text-neutral-600">
              {i + 1}
            </span>
            <span>
              <span className="font-semibold text-neutral-900">
                {step.title}
              </span>
              <span className="block text-neutral-500">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-neutral-500">
        A hunch stays private. Only a prediction can be made public.
      </p>
    </div>
  )
}

/** What the signed-out home page says this app does. */
export function SignedOutIntro() {
  const points = [
    {
      title: "Write hunches in your own words",
      body: "Write down what you think will happen, as loosely as you first thought it.",
    },
    {
      title: "Approve a clear, checkable version",
      body: "The app proposes a headline and what would make it checkable. Nothing is saved until you approve, and your original words are always kept underneath.",
    },
    {
      title: "Keep a locked history of every change",
      body: "Each edit and each change of mind is recorded, and the record can't be quietly rewritten.",
    },
    {
      title: "Build a track record",
      body: "When a prediction comes due, mark it right or wrong and see how well your confidence held up.",
    },
  ]
  return (
    <div className="not-prose my-8">
      <ul className="grid gap-4 sm:grid-cols-2">
        {points.map((point) => (
          <li key={point.title} className="glass rounded-xl p-4">
            <div className="font-semibold text-ink">{point.title}</div>
            <div className="mt-1 text-sm text-neutral-600">{point.body}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
