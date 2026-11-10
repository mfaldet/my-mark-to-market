/**
 * The public JSON feed: GET /api/public/track-record/<userId>
 *
 * No key needed, readable from any website. It contains only claims the
 * owner has shared publicly (see lib/claims/public_record.ts).
 */
import { NextApiRequest, NextApiResponse } from "next"
import { loadPublicRecord } from "../../../../lib/claims/public_record"

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Use GET." })
  }

  const record = await loadPublicRecord(String(req.query.userId))
  if (!record) return res.status(404).json({ error: "Not found." })

  // let other sites and their CDNs reuse the answer for a few minutes
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=600",
  )
  res.status(200).json(record)
}
