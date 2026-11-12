import { NextSeo } from "next-seo"
import { CopyToClipboard } from "../../components/ui/CopyToClipboard"
import { getBaseUrl } from "../../lib/base_url"
import { signInToFatebook, useUserId } from "../../lib/web/utils"

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-neutral-200 text-neutral-800 p-2 rounded-md break-words text-wrap whitespace-pre-wrap">
      {children}
    </pre>
  )
}

export default function EmbedPage() {
  const userId = useUserId()
  const id = userId ?? "YOUR_ID"
  const page = `${getBaseUrl()}/embed/track-record/${id}`
  const feed = `${getBaseUrl()}/api/public/track-record/${id}`
  const trackRecordFrame = `<iframe\n  src="${page}"\n  width="100%"\n  height="900"\n  style="border:0"\n  title="Track record"\n></iframe>`
  const singleFrame = `<iframe\n  src="${getBaseUrl()}/embed/q/PREDICTION_ID?compact=true&requireSignIn=false"\n  width="400"\n  height="200"\n  style="border:0"\n></iframe>`

  return (
    <div className="px-4 pt-12 lg:pt-16 mx-auto max-w-6xl">
      <NextSeo
        title="Embed your predictions"
        description="Show your public track record, or a single prediction, on your own site."
      />
      <div className="mx-auto prose">
        <h2>Embed your predictions</h2>
        <p>
          Only predictions you have published are ever shown. Private
          predictions and anything withdrawn never leave this app.
        </p>

        {!userId && (
          <p>
            <button
              className="button primary"
              onClick={() => void signInToFatebook()}
            >
              Sign in to get your own addresses
            </button>
          </p>
        )}

        <h3>Your public track record</h3>
        <p>
          A page with your public predictions, how many came true, and your
          calibration. Put it on your site with this code:
        </p>
        <Code>{trackRecordFrame}</Code>
        {userId && (
          <div className="not-prose flex gap-3 items-center">
            <CopyToClipboard
              textToCopy={trackRecordFrame}
              buttonLabel="Copy code"
            />
            <a
              className="link text-sm"
              href={page}
              target="_blank"
              rel="noreferrer"
            >
              Open the page
            </a>
          </div>
        )}

        <h3>The same thing as data</h3>
        <p>
          If you would rather lay it out yourself, the same information is
          available as a JSON feed. It needs no key and can be read from any
          site.
        </p>
        <Code>{feed}</Code>
        {userId && (
          <div className="not-prose">
            <CopyToClipboard textToCopy={feed} buttonLabel="Copy address" />
          </div>
        )}

        <h3>A single prediction</h3>
        <p>
          To show one prediction on its own, make it public, copy its link, and
          add <code>/embed</code> before <code>/q/</code> in the address:
        </p>
        <Code>{singleFrame}</Code>
      </div>
    </div>
  )
}
