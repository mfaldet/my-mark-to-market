/**
 * The hosted MCP endpoint: POST /api/mcp
 *
 * Speaks MCP's "Streamable HTTP" transport in its simplest, stateless
 * form: each request is answered with plain JSON and no session is kept,
 * which suits a serverless host like Vercel.
 *
 * Sign-in is the same API key as the rest of the API:
 *   Authorization: Bearer <key>      (Claude Code, Claude Desktop)
 *   X-Api-Key: <key>
 *   /api/mcp?key=<key>               only if MCP_ALLOW_URL_KEY=true (see below)
 *
 * A key in the URL can end up in server logs and browser history, so it
 * is off unless switched on. It exists for Claude apps that can be given
 * a connector URL but not a request header.
 */
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { NextApiRequest, NextApiResponse } from "next"
import { apiKeyFromHeaders, findUserByApiKey } from "../../lib/api_keys"
import { buildMcpServer } from "../../lib/mcp/server"

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Stateless: there is no stream to open and no session to close.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. Use POST." },
      id: null,
    })
  }

  const queryKey =
    process.env.MCP_ALLOW_URL_KEY === "true" &&
    typeof req.query.key === "string"
      ? req.query.key
      : undefined
  const user = await findUserByApiKey(
    apiKeyFromHeaders(req.headers) ?? queryKey,
  )
  if (!user) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Missing or unknown API key." },
      id: null,
    })
  }

  const server = buildMcpServer(user.id)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  res.on("close", () => {
    void transport.close()
    void server.close()
  })

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error("MCP request failed", error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error." },
        id: null,
      })
    }
  }
}
