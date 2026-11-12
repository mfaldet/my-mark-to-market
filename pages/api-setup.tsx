import { ConfirmDialog } from "../components/ui/ConfirmDialog"
import { NextSeo } from "next-seo"
import { useState } from "react"
import dynamic from "next/dynamic"
import "swagger-ui-react/swagger-ui.css"
import { CopyToClipboard } from "../components/ui/CopyToClipboard"
import { api } from "../lib/web/trpc"
import { signInToFatebook, useUserId } from "../lib/web/utils"
import { getBaseUrl } from "../lib/base_url"
import { REPO_URL } from "../lib/app_name"

// eslint-disable-next-line @typescript-eslint/naming-convention
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false })

export default function ApiPage() {
  const userId = useUserId()
  const utils = api.useContext()

  // Only a hash of the key is stored, so the key can be shown just once:
  // straight after it is generated.
  const existingKey = api.getApiKey.useQuery()
  const [newKey, setNewKey] = useState<string | null>(null)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const regenerateApiKey = api.regenerateApiKey.useMutation({
    async onSuccess(key) {
      setNewKey(key)
      await utils.getApiKey.invalidate()
    },
  })
  // used in the example further down the page
  const shownKey = newKey ?? "YOUR_API_KEY"
  const hasKey = !!existingKey.data || !!newKey

  return (
    <div className="px-4 pt-12 lg:pt-16 mx-auto max-w-6xl">
      <NextSeo
        title="API"
        description="Log and update predictions from anywhere"
      />
      <div className="mx-auto prose">
        <h2>Connect</h2>
        <p>
          Log a prediction, change how sure you are, publish one, or check what
          is due, from Claude, your phone or your own scripts.
        </p>
        <h3>Your key</h3>
        {!userId && (
          <div className="flex w-full p-4">
            <button
              className="button primary mx-auto"
              onClick={() => void signInToFatebook()}
            >
              Sign in to set up your API key
            </button>
          </div>
        )}
        {userId && (
          <div className="flex flex-col w-full gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="label whitespace-nowrap font-semibold">
                Your API key
              </label>
              <div className="flex flex-grow gap-2">
                <div className="relative flex-grow">
                  <input
                    aria-label="Your API key"
                    className="input w-full pr-10"
                    type="text"
                    value={
                      newKey ??
                      (existingKey.data
                        ? `••••••••${existingKey.data.lastFour ?? ""}`
                        : "")
                    }
                    readOnly
                    disabled={!newKey || regenerateApiKey.isLoading}
                  />
                  {newKey && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                      <CopyToClipboard
                        textToCopy={newKey ?? ""}
                        buttonLabel="Copy"
                      />
                    </div>
                  )}
                </div>
                <button
                  className="button primary whitespace-nowrap"
                  onClick={() => {
                    if (regenerateApiKey.isLoading) return
                    if (hasKey) {
                      setConfirmRegenerate(true)
                    } else {
                      void regenerateApiKey.mutate()
                    }
                  }}
                >
                  {hasKey ? "Regenerate" : "Generate"}
                </button>
                <ConfirmDialog
                  isOpen={confirmRegenerate}
                  onClose={() => setConfirmRegenerate(false)}
                  title="Make a new key?"
                  confirmLabel="Make a new key"
                  onConfirm={() => regenerateApiKey.mutate()}
                >
                  Your old key will stop working at once. Anything using it,
                  such as Claude or your Shortcut, will need the new one.
                </ConfirmDialog>
              </div>
            </div>
            {newKey ? (
              <p className="text-sm text-amber-700 m-0">
                Copy this key now. It is stored only as a hash, so it cannot be
                shown again. If you lose it, regenerate.
              </p>
            ) : (
              existingKey.data && (
                <p className="text-sm text-neutral-500 m-0">
                  You have a key ending in{" "}
                  <code>{existingKey.data.lastFour}</code>
                  {existingKey.data.createdAt &&
                    `, created ${new Date(
                      existingKey.data.createdAt,
                    ).toLocaleDateString()}`}
                  . The key itself is not stored, so it cannot be shown again.
                  Regenerate to get a new one.
                </p>
              )
            )}
            <p className="text-sm text-neutral-500 m-0">
              Send the key in a header:{" "}
              <code>Authorization: Bearer YOUR_API_KEY</code> or{" "}
              <code>X-Api-Key: YOUR_API_KEY</code>. That keeps it out of
              addresses and logs.
            </p>
          </div>
        )}
        <h3>Claude</h3>
        <p>
          Claude can log a prediction for you in the middle of a conversation,
          sharpen it with you, and tell you what is due. Setup takes a few
          minutes:{" "}
          <a
            href={`${REPO_URL}/blob/main/docs/connect-claude.md`}
            target="_blank"
            rel="noreferrer"
          >
            Connect Claude
          </a>
          .
        </p>

        <h3>iPhone</h3>
        <p>
          A Shortcut that takes a prediction by voice or keyboard, logs it, and
          shows its grade:{" "}
          <a
            href={`${REPO_URL}/blob/main/docs/iphone-shortcut.md`}
            target="_blank"
            rel="noreferrer"
          >
            Build the Shortcut
          </a>
          .
        </p>

        <h3>Your own scripts</h3>
        <p>Log a prediction:</p>
        <pre className="whitespace-pre-wrap break-words">{`curl -X POST ${getBaseUrl()}/api/v0/claims/log \\
  -H "Authorization: Bearer ${shownKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Rates get cut this year, likely"}'`}</pre>
        <p>
          The reply gives its grade (4 or 5 means checkable) and the next
          question to answer. The main endpoints:
        </p>
        <ul>
          <li>
            <code>POST /api/v0/claims/log</code>: log a prediction in your own
            words
          </li>
          <li>
            <code>GET /api/v0/claims/nextQuestion</code>: the one question to
            answer next
          </li>
          <li>
            <code>POST /api/v0/claims/answer</code>: accept the suggestion, give
            your own answer, or skip
          </li>
          <li>
            <code>POST /api/v0/claims/confidence</code>: say how sure you are,
            with a word or a number
          </li>
          <li>
            <code>GET /api/v0/claims/list</code>: list everything, or just what
            is due
          </li>
          <li>
            <code>POST /api/v0/claims/resolve</code>: mark a prediction right,
            wrong or can&apos;t tell
          </li>
        </ul>
        <p>
          The addresses and field names say “claim” for technical reasons. A
          claim is the same thing as a prediction. The field called{" "}
          <code>kind</code> still answers “hunch” for grades 1 to 3 (not
          checkable yet) and “prediction” for grades 4 and 5, so existing setups
          keep working.
        </p>

        <h3>Older endpoints</h3>
        <p>
          The endpoints inherited from Fatebook still work, including sending
          the key as <code>apiKey=</code> in the address or body. They are
          listed under “Older endpoints” below. Anything they change follows the
          same rules: nothing is deleted, only withdrawn, and only a prediction
          can be made public or resolved.
        </p>

        <h3>Every endpoint</h3>
      </div>
      <SwaggerUI url="/api/openapi.json" />
    </div>
  )
}
