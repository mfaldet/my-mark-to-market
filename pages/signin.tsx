import { GetServerSideProps } from "next"
import { getProviders, signIn } from "next-auth/react"
import { NextSeo } from "next-seo"
import { useRouter } from "next/router"
import { useState } from "react"
import { BrandMark } from "../components/BrandMark"
import { APP_NAME, APP_TAGLINE } from "../lib/app_name"

type Props = { google: boolean; email: boolean }

/** What next-auth's error codes mean, in plain words. */
function errorText(code: string | undefined) {
  if (!code) return null
  if (code === "AccessDenied")
    return "That account can't sign in here. This is a personal app."
  if (code === "Verification")
    return "That sign-in link has expired or was already used. Ask for a new one."
  return "Sign-in didn't work. Try again."
}

export default function SignInPage({ google, email }: Props) {
  const router = useRouter()
  const callbackUrl =
    typeof router.query.callbackUrl === "string"
      ? router.query.callbackUrl
      : "/"
  const error = errorText(
    typeof router.query.error === "string" ? router.query.error : undefined,
  )
  const [address, setAddress] = useState("")

  return (
    <div className="px-4 pt-10 lg:pt-20 mx-auto max-w-md text-center">
      <div className="brand-surface rounded-3xl border border-ink/10 px-4 py-10 sm:px-10 sm:py-12">
        <BrandMark className="w-16 h-16 mx-auto mb-3" />
        <NextSeo title="Sign in" />
        <h1 className="wordmark text-[1.7rem] sm:text-4xl whitespace-nowrap">
          {APP_NAME}
        </h1>
        <p className="tagline mt-2 text-lg">{APP_TAGLINE}</p>

        {error && (
          <p
            role="alert"
            className="mt-8 tone-negative rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-4">
          {google && (
            <button
              className="btn btn-primary w-full"
              onClick={() => void signIn("google", { callbackUrl })}
            >
              Sign in with Google
            </button>
          )}
          {email && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void signIn("email", { email: address, callbackUrl })
              }}
            >
              <label htmlFor="signin-email" className="text-sm text-left">
                Or get a sign-in link by email
              </label>
              <input
                id="signin-email"
                type="email"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="you@example.com"
                className="input input-bordered w-full bg-white/80"
              />
              <button type="submit" className="btn glass w-full">
                Email me a sign-in link
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const providers = await getProviders()
  return {
    props: { google: !!providers?.google, email: !!providers?.email },
  }
}
