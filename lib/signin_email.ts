import { createTransport } from "nodemailer"
import { APP_NAME } from "./app_name"

/**
 * The sign-in link email, in this app's own words. Only used when a mail
 * server is set up (AUTH_EMAIL_SERVER); otherwise Google is the only way in.
 */
export function signInEmailContent(url: string) {
  const subject = `Sign in to ${APP_NAME}`
  const text = `Sign in to ${APP_NAME}\n\n${url}\n\nThe link works once and expires in 20 minutes. If you didn't ask for it, ignore this email.\n`
  const html = `<div style="font-family:sans-serif;color:#1B2230;max-width:480px;margin:0 auto;padding:24px">
<p style="font-size:18px;font-weight:bold">${APP_NAME}</p>
<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#1B2230;color:#ffffff;text-decoration:none;border-radius:8px">Sign in</a></p>
<p style="color:#6E7A8E;font-size:14px">The link works once and expires in 20 minutes. If you didn't ask for it, ignore this email.</p>
</div>`
  return { subject, text, html }
}

export async function sendSignInEmail(params: {
  identifier: string
  url: string
  provider: { server: any; from?: string }
}) {
  const { subject, text, html } = signInEmailContent(params.url)
  const result = await createTransport(params.provider.server).sendMail({
    to: params.identifier,
    from: params.provider.from,
    subject,
    text,
    html,
  })
  const failed = result.rejected.filter(Boolean)
  if (failed.length) {
    throw new Error(`Sign-in email could not be sent to ${failed.join(", ")}`)
  }
}
