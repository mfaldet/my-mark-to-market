/**
 * The address this app is served from, e.g. "https://claims.example.com".
 *
 * Upstream Fatebook hardcoded "https://fatebook.io" throughout. Everything
 * now reads the address from here, so a fork deployed anywhere links to
 * itself and not to Sage's site.
 *
 * Set NEXT_PUBLIC_BASE_URL in the environment. (The NEXT_PUBLIC_ prefix is
 * what lets Next.js use it in the browser as well as on the server.)
 *
 * This file must not import anything from the app, so that anything can
 * import it.
 */

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "")
}

/** Full address with no trailing slash: "https://claims.example.com" */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return stripTrailingSlash(process.env.NEXT_PUBLIC_BASE_URL)
  }

  // In the browser, the page's own address is always right
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  // Older names, still honoured so existing setups keep working
  if (process.env.HOST_URL) {
    return stripTrailingSlash(process.env.HOST_URL)
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  return `http://localhost:${process.env.PORT ?? 3000}`
}

/** Address without the "https://", for showing in text: "claims.example.com" */
export function getBaseHost(): string {
  return getBaseUrl().replace(/^https?:\/\//, "")
}

/** The address emails are sent from. Set EMAIL_FROM to override. */
export function getEmailFrom(): string {
  return (
    process.env.EMAIL_FROM || `reminders@${getBaseHost().replace(/:\d+$/, "")}`
  )
}

/** Where replies to those emails go. Set EMAIL_REPLY_TO to override. */
export function getEmailReplyTo(): string {
  return process.env.EMAIL_REPLY_TO || getEmailFrom()
}
