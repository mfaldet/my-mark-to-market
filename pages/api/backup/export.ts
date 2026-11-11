import type { NextApiRequest, NextApiResponse } from "next"
import { isAuthorizedBackup } from "../../../lib/backup/auth"
import { DEFAULT_PAGE_SIZE, exportBackup } from "../../../lib/backup/export"

/**
 * GET /api/backup/export[?offset=0&pageSize=100]
 *
 * Read-only copy of all my data, for the daily backup. Needs
 * "Authorization: Bearer <BACKUP_TOKEN>". Refuses everyone when
 * BACKUP_TOKEN is not set. Large exports come in pages: follow nextOffset.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store")
  if (!isAuthorizedBackup(req.headers)) {
    return res.status(401).json({ error: "Not allowed." })
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    return res.status(405).json({ error: "This endpoint only reads: use GET." })
  }
  const number = (value: unknown, fallback: number) => {
    const n = Number(Array.isArray(value) ? value[0] : value)
    return Number.isInteger(n) && n >= 0 ? n : fallback
  }
  const page = await exportBackup(
    number(req.query.offset, 0),
    number(req.query.pageSize, DEFAULT_PAGE_SIZE),
  )
  return res.status(200).json(page)
}
