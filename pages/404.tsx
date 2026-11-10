import { NextSeo } from "next-seo"
import Link from "next/link"
export default function Custom404() {
  return (
    <div className="px-4 pt-12 lg:pt-16 mx-auto max-w-md text-center">
      <NextSeo title="Page not found" />
      <div className="glass rounded-2xl px-6 py-10">
        <p className="num text-sm text-neutral-500">404</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">
          There is nothing at this address.
        </h1>
        <Link href="/" className="btn btn-primary mt-6">
          Go to the home page
        </Link>
      </div>
    </div>
  )
}
