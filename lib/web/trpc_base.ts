import { inferAsyncReturnType, initTRPC } from "@trpc/server"
import { CreateNextContextOptions } from "@trpc/server/adapters/next"
import { getServerSession } from "next-auth"
import { OpenApiMeta } from "trpc-openapi"
import transformer from "trpc-transformer"
import { apiKeyFromHeaders } from "../api_keys"
import { authOptions } from "../../pages/api/auth/[...nextauth]"

export const createContext = async (opts: CreateNextContextOptions) => {
  const session = await getServerSession(opts.req, opts.res, authOptions)

  return {
    session,
    userId: session?.user?.id,
    // an API key sent as "Authorization: Bearer <key>" or "X-Api-Key: <key>"
    apiKeyHeader: apiKeyFromHeaders(opts.req.headers),
  }
}

export type Context = inferAsyncReturnType<typeof createContext>
const t = initTRPC.meta<OpenApiMeta>().context<Context>().create({
  transformer,
})

export const router = t.router
export const publicProcedure = t.procedure
