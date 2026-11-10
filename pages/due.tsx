import { NextSeo } from "next-seo"
import { DueList } from "../components/claims/DueList"

export default function DuePage() {
  return (
    <div className="px-4 pt-12 lg:pt-16 mx-auto max-w-2xl">
      <NextSeo title="Due" />
      <h2 className="text-xl font-bold mb-1">Due</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Predictions due within 7 days, anything past its deadline, and hunches
        to check back on. Most pressing first.
      </p>
      <DueList />
    </div>
  )
}
