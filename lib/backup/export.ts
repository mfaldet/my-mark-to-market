/**
 * Everything needed to rebuild my data, as plain JSON.
 *
 * Read-only: this file only ever reads. Rows are exported as they are
 * stored, column for column, so a restore can put them back unchanged and
 * the history's hash chain still verifies.
 *
 * Left out on purpose, because they are secrets or of no use in a rebuild:
 * API keys and their hashes, sign-in tokens, and anything Slack or Discord.
 * After a restore a new API key is made in the app.
 */
import { Prisma } from "@prisma/client"
import prisma from "../prisma"

export const BACKUP_FORMAT = 1
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500

/** Dates become ISO strings and decimals become strings, at every level. */
export function plain(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (Prisma.Decimal.isDecimal(value)) return value.toString()
  if (Array.isArray(value)) return value.map(plain)
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        plain(v),
      ]),
    )
  }
  return value
}

export type BackupPage = {
  format: number
  exportedAt: string
  /** the commit the app was running, so the same hash check can be used */
  appCommit: string | null
  totalItems: number
  /** where the next page starts, or null when this is the last one */
  nextOffset: number | null
  /** only on the first page */
  users?: unknown[]
  accounts?: unknown[]
  tags?: unknown[]
  items: unknown[]
}

export async function exportBackup(
  offset = 0,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<BackupPage> {
  const take = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE)
  const skip = Math.max(0, offset)

  const [totalItems, rows] = await Promise.all([
    prisma.question.count(),
    prisma.question.findMany({
      // every hunch and prediction, withdrawn ones included
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take,
      include: {
        versions: { orderBy: { version: "asc" } },
        forecasts: { orderBy: { id: "asc" } },
        comments: { orderBy: { id: "asc" } },
        questionScores: { orderBy: { id: "asc" } },
        options: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        tags: { select: { id: true }, orderBy: { id: "asc" } },
      },
    }),
  ])

  const items = rows.map((row) => {
    const {
      versions,
      forecasts,
      comments,
      questionScores,
      options,
      tags,
      ...question
    } = row
    return plain({
      question,
      tagIds: tags.map((t) => t.id),
      versions,
      forecasts,
      comments,
      scores: questionScores,
      options,
    })
  })

  const page: BackupPage = {
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    appCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    totalItems,
    nextOffset: skip + rows.length < totalItems ? skip + rows.length : null,
    items,
  }

  if (skip === 0) {
    const [users, accounts, tags] = await Promise.all([
      prisma.user.findMany({
        orderBy: { id: "asc" },
        // account settings; never the API key or its hash
        select: {
          id: true,
          name: true,
          createdAt: true,
          email: true,
          timeZone: true,
          image: true,
          staleReminder: true,
          unsubscribedFromEmailsAt: true,
          emailVerified: true,
        },
      }),
      prisma.account.findMany({
        orderBy: { id: "asc" },
        // which sign-in belongs to which user; never the tokens
        select: {
          id: true,
          userId: true,
          type: true,
          provider: true,
          providerAccountId: true,
        },
      }),
      prisma.tag.findMany({ orderBy: { id: "asc" } }),
    ])
    page.users = plain(users) as unknown[]
    page.accounts = plain(accounts) as unknown[]
    page.tags = plain(tags) as unknown[]
  }

  return page
}
