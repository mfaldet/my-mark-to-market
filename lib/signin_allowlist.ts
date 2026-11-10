/**
 * Who may sign in.
 *
 * This is a personal app. Set ALLOWED_SIGNIN_EMAILS to a comma-separated
 * list of email addresses and nobody else can sign in or create an
 * account. Leave it unset (as in local development) and sign-in is open,
 * which is how upstream Fatebook behaves.
 */
export function allowedSignInEmails(): string[] | null {
  const raw = process.env.ALLOWED_SIGNIN_EMAILS
  if (!raw || !raw.trim()) return null
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedToSignIn(email: string | null | undefined): boolean {
  const allowed = allowedSignInEmails()
  if (allowed === null) return true
  return !!email && allowed.includes(email.trim().toLowerCase())
}
