import { patchLocalStorage } from "../lib/patchLocalStorage"
if (typeof window !== "undefined") {
  patchLocalStorage() // must run before next-auth
}

import { NextPage } from "next"
import { SessionProvider } from "next-auth/react"
import { AppProps } from "next/app"
import { GoogleAnalytics } from "nextjs-google-analytics"
import { ReactElement, ReactNode } from "react"
import { Toaster } from "react-hot-toast"
import { Layout } from "../components/Layout"
import Meta from "../components/Meta"
import { api } from "../lib/web/trpc"
// The three fonts are bundled with the app: no requests to Google Fonts.
import "@fontsource/tinos/latin-400-italic.css"
import "@fontsource/tinos/latin-700.css"
import "@fontsource-variable/source-sans-3/wght.css"
import "@fontsource-variable/source-sans-3/wght-italic.css"
import "@fontsource-variable/source-code-pro/wght.css"
import "../styles/globals.css"
import { FEATURES } from "../lib/features"

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode
}

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout
}

function App({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Component,
  pageProps: { session, ...pageProps },
}: AppPropsWithLayout) {
  const getLayout = Component.getLayout ?? ((page) => <Layout>{page}</Layout>)

  const refetchOnWindowFocus =
    typeof window !== "undefined" && !location.href.includes("/embed/")

  return (
    <>
      <Meta />
      {FEATURES.analytics && <GoogleAnalytics trackPageViews />}
      <SessionProvider
        session={session}
        refetchOnWindowFocus={refetchOnWindowFocus}
      >
        {getLayout(<Component {...pageProps} />)}
        <Toaster />
      </SessionProvider>
    </>
  )
}

export default api.withTRPC(App)
