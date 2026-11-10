/**
 * The web UI's door to the claim functions in lib/claims/service.ts.
 * Every procedure needs a signed-in user and records the entry source
 * as "WEB". The API and MCP server call the same service functions.
 */
import { ClaimShape, ConfidenceWord } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  answerQuestion,
  ClaimError,
  confirmCheckLink,
  confirmPart,
  getClaim,
  getTimeline,
  linkParent,
  listClaims,
  logClaim,
  resolveClaim,
  setCheckLink,
  setPart,
  setPublic,
  setShape,
  updateConfidence,
  verifyHistory,
  withdrawClaim,
} from "../claims/service"
import { Context, publicProcedure, router } from "./trpc_base"

/** Turns a ClaimError into the matching tRPC error, reasons included. */
export function toTrpcError(error: unknown): never {
  if (error instanceof ClaimError) {
    const message = [error.message, ...error.reasons].join("\n")
    throw new TRPCError({
      code:
        error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : error.code === "FORBIDDEN"
            ? "FORBIDDEN"
            : error.code === "BLOCKED"
              ? "PRECONDITION_FAILED"
              : "BAD_REQUEST",
      message,
    })
  }
  throw error
}

function requireUser(ctx: Context): string {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in first." })
  }
  return ctx.userId
}

const id = z.object({ claimId: z.string() })
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const claimsRouter = router({
  log: publicProcedure
    .input(
      z.object({
        text: z.string().min(1),
        claimDate: isoDay.optional(),
        parentId: z.string().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      logClaim({ ...input, userId: requireUser(ctx), source: "WEB" }).catch(
        toTrpcError,
      ),
    ),

  get: publicProcedure
    .input(id)
    .query(({ input, ctx }) =>
      getClaim(requireUser(ctx), input.claimId).catch(toTrpcError),
    ),

  list: publicProcedure
    .input(
      z
        .object({
          status: z.enum(["open", "resolved", "all"]).optional(),
          due: z.enum(["soon", "overdue", "soon_or_overdue"]).optional(),
          limit: z.number().optional(),
        })
        .optional(),
    )
    .query(({ input, ctx }) =>
      listClaims(requireUser(ctx), input ?? {}).catch(toTrpcError),
    ),

  answer: publicProcedure
    .input(
      id.extend({
        answer: z.union([
          z.object({ accept: z.literal(true) }),
          z.object({ value: z.union([z.string(), z.number()]) }),
          z.object({ skip: z.literal(true) }),
        ]),
      }),
    )
    .mutation(({ input, ctx }) =>
      answerQuestion(
        requireUser(ctx),
        input.claimId,
        input.answer,
        "WEB",
      ).catch(toTrpcError),
    ),

  setShape: publicProcedure
    .input(id.extend({ shape: z.nativeEnum(ClaimShape) }))
    .mutation(({ input, ctx }) =>
      setShape(requireUser(ctx), input.claimId, input.shape, "WEB").catch(
        toTrpcError,
      ),
    ),

  setPart: publicProcedure
    .input(
      id.extend({
        part: z.string(),
        value: z.union([z.string(), z.number(), z.null()]),
      }),
    )
    .mutation(({ input, ctx }) =>
      setPart(
        requireUser(ctx),
        input.claimId,
        input.part,
        input.value,
        "WEB",
      ).catch(toTrpcError),
    ),

  confirmPart: publicProcedure
    .input(id.extend({ part: z.string() }))
    .mutation(({ input, ctx }) =>
      confirmPart(requireUser(ctx), input.claimId, input.part, "WEB").catch(
        toTrpcError,
      ),
    ),

  updateConfidence: publicProcedure
    .input(
      id.extend({
        word: z.nativeEnum(ConfidenceWord).optional(),
        probability: z.number().min(0).max(1).optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ input, ctx }) => {
      const { claimId, ...update } = input
      return updateConfidence(requireUser(ctx), claimId, update, "WEB").catch(
        toTrpcError,
      )
    }),

  setCheckLink: publicProcedure
    .input(id.extend({ url: z.string().nullable() }))
    .mutation(({ input, ctx }) =>
      setCheckLink(requireUser(ctx), input.claimId, input.url, "WEB").catch(
        toTrpcError,
      ),
    ),

  confirmCheckLink: publicProcedure
    .input(id)
    .mutation(({ input, ctx }) =>
      confirmCheckLink(requireUser(ctx), input.claimId, "WEB").catch(
        toTrpcError,
      ),
    ),

  linkParent: publicProcedure
    .input(id.extend({ parentId: z.string().nullable() }))
    .mutation(({ input, ctx }) =>
      linkParent(requireUser(ctx), input.claimId, input.parentId, "WEB").catch(
        toTrpcError,
      ),
    ),

  setPublic: publicProcedure
    .input(id.extend({ sharedPublicly: z.boolean() }))
    .mutation(({ input, ctx }) =>
      setPublic(
        requireUser(ctx),
        input.claimId,
        input.sharedPublicly,
        "WEB",
      ).catch(toTrpcError),
    ),

  withdraw: publicProcedure
    .input(id)
    .mutation(({ input, ctx }) =>
      withdrawClaim(requireUser(ctx), input.claimId, "WEB").catch(toTrpcError),
    ),

  timeline: publicProcedure
    .input(id)
    .query(({ input, ctx }) =>
      getTimeline(requireUser(ctx), input.claimId).catch(toTrpcError),
    ),

  verifyHistory: publicProcedure
    .input(id)
    .mutation(({ input, ctx }) =>
      verifyHistory(requireUser(ctx), input.claimId).catch(toTrpcError),
    ),

  resolve: publicProcedure
    .input(
      id.extend({
        resolution: z.enum(["YES", "NO", "AMBIGUOUS"]).optional(),
        actual: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .mutation(({ input, ctx }) => {
      const { claimId, ...rest } = input
      return resolveClaim(requireUser(ctx), claimId, rest, "WEB").catch(
        toTrpcError,
      )
    }),
})
