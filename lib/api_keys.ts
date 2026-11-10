/**
 * API keys.
 *
 * Upstream Fatebook made keys with Math.random(), stored them as plain
 * text, and only accepted them in the URL or request body. This fork:
 *   - makes keys with a cryptographically secure generator
 *   - stores only a SHA-256 hash, so a database leak does not leak keys
 *     (the key itself is shown once, when it is generated)
 *   - also accepts the key in a header, which keeps it out of URLs and logs
 *
 * The old way of sending a key (apiKey in the URL or body) still works.
 *
 * Why plain SHA-256 and not a slow password hash: keys are 32 random
 * bytes, not human-chosen passwords, so they cannot be guessed and there
 * is nothing for a slow hash to protect.
 *
 * Server-side only.
 */
import { createHash, randomBytes } from "crypto"
import type { IncomingHttpHeaders } from "http"
import prisma from "./prisma"

export const API_KEY_PREFIX = "mtm_"

/** A new key: "mtm_" followed by 43 random URL-safe characters. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString("base64url")
}

/** What is stored in the database in place of the key. */
export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex")
}

/** The last four characters, kept so the settings page can say which key is active. */
export function lastFour(apiKey: string): string {
  return apiKey.slice(-4)
}

/**
 * Reads a key from request headers. Either works:
 *   Authorization: Bearer <key>
 *   X-Api-Key: <key>
 */
export function apiKeyFromHeaders(
  headers: IncomingHttpHeaders,
): string | undefined {
  const authorization = headers.authorization
  if (authorization) {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization)
    if (match) return match[1]
  }
  const header = headers["x-api-key"]
  const value = Array.isArray(header) ? header[0] : header
  return value?.trim() || undefined
}

/**
 * The key for a request: the explicit one (URL or body, the upstream way)
 * if given, otherwise the header.
 */
export function resolveApiKey(
  explicit: string | undefined | null,
  headers: IncomingHttpHeaders,
): string | undefined {
  return explicit || apiKeyFromHeaders(headers)
}

/** The user who owns this key, or null. */
export async function findUserByApiKey(apiKey: string | undefined | null) {
  if (!apiKey) return null
  return await prisma.user.findUnique({
    where: { apiKeyHash: hashApiKey(apiKey) },
  })
}
