/**
 * Who may call the scheduled-job endpoints.
 *
 * Vercel calls a cron job with "Authorization: Bearer <CRON_SECRET>" when
 * the CRON_SECRET environment variable is set. Nothing else is accepted.
 *
 * Upstream compared a key in the URL with an environment variable, and
 * shipped that key in vercel.json. Worse, with the variable unset, a
 * request with no key at all matched (undefined equals undefined). Here an
 * unset secret means nobody gets in.
 */
import { createHash, timingSafeEqual } from "crypto"
import type { IncomingHttpHeaders } from "http"

export function isAuthorizedCron(headers: IncomingHttpHeaders): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  // Hash both sides, then compare the hashes in constant time, so the
  // secret cannot be guessed a character at a time.
  const digest = (value: string) =>
    new Uint8Array(createHash("sha256").update(value, "utf8").digest())
  return timingSafeEqual(
    digest(headers.authorization ?? ""),
    digest(`Bearer ${secret}`),
  )
}
