import { DocumentProps, Head, Html, Main, NextScript } from "next/document"
import clsx from "clsx"

export default function Document(props: DocumentProps) {
  const embedded = props.__NEXT_DATA__.page.includes("/embed/")

  return (
    <Html
      className={clsx(
        embedded && "overflow-hidden",
        !embedded && "overflow-y-auto",
      )}
      lang="en"
    >
      <Head>
        <link rel="icon" href="/brand/mark.svg" type="image/svg+xml" />
        <link
          rel="icon"
          href="/brand/favicon-32.png"
          sizes="32x32"
          type="image/png"
        />
        <link
          rel="icon"
          href="/brand/favicon-16.png"
          sizes="16x16"
          type="image/png"
        />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#FBFBFD" />
        {/* <meta name="viewport" content="viewport-fit=cover" /> */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
