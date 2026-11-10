import Image from "next/image"
import Link from "next/link"
import { getBaseUrl } from "../lib/base_url"

export function AddToSlack({
  buttonText = "Add to Slack",
}: {
  buttonText?: string
}) {
  return (
    <Link href={`${getBaseUrl()}/api/auth/install`}>
      <button className="inline-flex items-center border border-transparent rounded-md my-4 text-2xl py-4 px-6 shadow-2xl shadow-indigo-500 hover:scale-105 transition-transform bg-white text-black font-semibold hover:bg-white">
        <>
          <Image
            src="/slack-logo.svg"
            width={60}
            height={60}
            className="m-0"
            alt=""
          />
          <span>{buttonText}</span>
        </>
      </button>
    </Link>
  )
}
