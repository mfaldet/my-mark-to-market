/** A short guide to how this app works, shown beside the list on desktop. */
export function HowItWorks() {
  const steps = [
    {
      title: "Log a hunch",
      body: "Say it in your own words. It can be loose. Your words are kept exactly as you wrote them.",
    },
    {
      title: "Answer one question at a time",
      body: "The app asks what you would see, by when, and how you would tell, until your hunch becomes a prediction you can check.",
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
      title: "Log hunches in your own words",
      body: "Write down what you think will happen, as loosely as you first thought it.",
    },
    {
      title: "Sharpen them into predictions you can check",
      body: "One question at a time: what would you see, by when, and how would you tell?",
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
          <li
            key={point.title}
            className="rounded-md border border-neutral-200 bg-white p-4"
          >
            <div className="font-semibold text-neutral-900">{point.title}</div>
            <div className="mt-1 text-sm text-neutral-600">{point.body}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
