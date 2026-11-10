import { getBaseUrl } from "../../lib/base_url"
import { CopyToClipboard } from "../ui/CopyToClipboard"

/**
 * Where to find my public track record: a page to embed on another site,
 * and a JSON feed. Both show only claims I have shared publicly.
 */
export function PublicRecordLinks({ userId }: { userId: string }) {
  const page = `${getBaseUrl()}/embed/track-record/${userId}`
  const feed = `${getBaseUrl()}/api/public/track-record/${userId}`
  const iframe = `<iframe src="${page}" width="100%" height="900" style="border:0" title="Track record"></iframe>`

  return (
    <div className="not-prose flex flex-col gap-2 text-sm">
      <h3 className="font-semibold text-base">Public track record</h3>
      <p className="text-neutral-500">
        Only claims you have made public appear. Private and withdrawn claims
        never do.
      </p>
      <a className="link" href={page} target="_blank" rel="noreferrer">
        Open the public page
      </a>
      <div className="flex items-center justify-between gap-2">
        <span className="text-neutral-600">Embed on your site</span>
        <CopyToClipboard textToCopy={iframe} buttonLabel="Copy code" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-neutral-600">JSON feed</span>
        <CopyToClipboard textToCopy={feed} buttonLabel="Copy address" />
      </div>
    </div>
  )
}
