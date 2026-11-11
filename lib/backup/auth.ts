/**
 * Who may call the backup export.
 *
 * Only a request with "Authorization: Bearer <BACKUP_TOKEN>". The token is
 * its own secret: not the API key, not CRON_SECRET. With BACKUP_TOKEN unset
 * nobody gets in.
 */
import { createHash, timingSafeEqual } from "crypto"
import type { IncomingHttpHeaders } from "http"

export function isAuthorizedBackup(headers: IncomingHttpHeaders): boolean {
  const token = process.env.BACKUP_TOKEN
  if (!token) return false

  // Hash both sides, then compare the hashes in constant time, so the
  // token cannot be guessed a character at a time.
  const digest = (value: string) =>
    new Uint8Array(createHash("sha256").update(value, "utf8").digest())
  return timingSafeEqual(
    digest(headers.authorization ?? ""),
    digest(`Bearer ${token}`),
  )
}
