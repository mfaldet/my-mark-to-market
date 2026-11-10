import { NextApiRequest, NextApiResponse } from "next"
import { isAuthorizedCron } from "../../lib/cron_auth"
import { sendBatchedEmails } from "../../lib/web/notifications"

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // No longer on a schedule (see vercel.json): this fork sends no email.
  // The endpoint is kept, locked to the cron secret, so the upstream
  // feature can be switched back on.
  if (!isAuthorizedCron(req.headers)) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  await sendBatchedEmails()
  res.status(200).json({ status: "Batched emails sent" })
}
