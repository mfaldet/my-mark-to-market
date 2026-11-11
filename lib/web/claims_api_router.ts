/**
 * The claim endpoints of the public API, under /api/v0/claims/.
 *
 * They use the same API-key sign-in as the rest of the v0 API (a header,
 * or apiKey in the body or URL) and call the same functions as the web UI
 * (lib/claims/service.ts), so every rule - grading, the publish gate,
 * history - applies identically.
 *
 * Each endpoint records how the claim or change came in. A caller can say
 * source "phone" (the iPhone Shortcut does); otherwise it is "api".
 */
import { ConfidenceWord, EntrySource } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { findUserByApiKey } from "../api_keys"
import { getBaseHost } from "../base_url"
import { parseConfidenceWord, readConfidence } from "../claims/confidence"
import { parseResult } from "../claims/words"
import {
  answerQuestion,
  getClaim,
  linkParent,
  listClaims,
  logClaim,
  resolveClaim,
  updateConfidence,
} from "../claims/service"
import { toTrpcError } from "./claims_router"
import { Context, publicProcedure, router } from "./trpc_base"

const apiKey = z
  .string({
    description: `Your API key, from ${getBaseHost()}/api-setup. Better: leave this out and send the key in an "Authorization: Bearer" or "X-Api-Key" header.`,
  })
  .optional()

const source = z
  .enum(["api", "phone"], {
    description:
      'How this came in. The iPhone Shortcut sends "phone". Defaults to "api".',
  })
  .optional()

const toSource = (value?: "api" | "phone"): EntrySource =>
  value === "phone" ? "PHONE" : "API"

async function requireUser(ctx: Context, key?: string): Promise<string> {
  if (ctx.userId) return ctx.userId
  const user = await findUserByApiKey(key || ctx.apiKeyHeader)
  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: `Missing or unknown API key. See ${getBaseHost()}/api-setup`,
    })
  }
  return user.id
}

const part = z.object({
  value: z.union([z.string(), z.number()]),
  status: z.enum(["stated", "extracted", "working"]),
})

const question = z
  .object({
    part: z.string(),
    kind: z.enum(["fill", "confirm"]),
    question: z.string(),
    suggestion: z
      .object({ value: z.union([z.string(), z.number()]), label: z.string() })
      .nullable(),
  })
  .nullable()

/** One claim, as every endpoint returns it. */
const claim = z.object({
  id: z.string(),
  url: z.string(),
  kind: z.enum(["hunch", "prediction"]),
  imported: z.boolean(),
  text: z.string({ description: "Your raw words, never changed" }),
  headline: z
    .string({
      description:
        "The approved clean statement shown everywhere, or null when there is none yet",
    })
    .nullable(),
  shown: z.string({
    description: "The headline, or your words when there is none",
  }),
  claimDate: z.string(),
  loggedAt: z.string(),
  backDated: z.boolean(),
  entrySource: z.string().nullable(),
  deadline: z.string(),
  due: z.enum(["overdue", "due soon"]).nullable(),
  dueText: z.string().nullable(),
  deadlineKind: z.enum(["deadline", "check back by"]),
  shape: z.string().nullable(),
  parts: z.record(part),
  approximate: z.boolean(),
  grade: z.number(),
  gradeReason: z.string(),
  compound: z.boolean(),
  missing: z.array(z.string()),
  canPublish: z.boolean(),
  publishBlockers: z.array(z.string()),
  confidenceWord: z.string().nullable(),
  probability: z.number().nullable(),
  sharedPublicly: z.boolean(),
  checkLinkUrl: z.string().nullable(),
  checkLinkConfirmed: z.boolean(),
  parent: z.object({ id: z.string(), text: z.string() }).nullable(),
  children: z.array(z.object({ id: z.string(), text: z.string() })),
  withdrawn: z.boolean(),
  resolved: z.boolean(),
  resolution: z.string().nullable(),
  result: z.enum(["right", "wrong", "can't tell"]).nullable(),
  closeCall: z.boolean(),
  actualResult: z.string().nullable(),
  nextQuestion: question,
  questionsAsked: z.number(),
})

const tags = ["Hunches and predictions"]

export const claimsApiRouter = router({
  log: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/v0/claims/log",
        tags,
        description:
          "Log a hunch from raw text. The text is saved exactly as given. Returns the item with its kind (hunch or prediction), its grade and the first question to answer (nextQuestion), if there is one.",
        example: {
          request: {
            text: "S&P 500 falls 20% from today's close by end of 2027, likely",
          },
        },
      },
    })
    .input(
      z.object({
        text: z.string().min(1),
        claimDate: z
          .string({
            description:
              "YYYY-MM-DD. When you said it, if not today. Relative dates in the text are worked out from this.",
          })
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        parentId: z.string().optional(),
        timeZone: z
          .string({
            description:
              'IANA time zone, e.g. "America/Chicago". "Today" and due dates are worked out in it. Defaults to the one saved on your account.',
          })
          .optional(),
        source,
        apiKey,
      }),
    )
    .output(claim)
    .mutation(async ({ input, ctx }) =>
      logClaim({
        userId: await requireUser(ctx, input.apiKey),
        text: input.text,
        claimDate: input.claimDate,
        parentId: input.parentId,
        timeZone: input.timeZone,
        source: toSource(input.source),
      }).catch(toTrpcError),
    ),

  get: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/v0/claims/get",
        tags,
        description: "Get one of your hunches or predictions.",
      },
    })
    .input(z.object({ claimId: z.string(), apiKey }))
    .output(claim)
    .query(async ({ input, ctx }) =>
      getClaim(await requireUser(ctx, input.apiKey), input.claimId).catch(
        toTrpcError,
      ),
    ),

  nextQuestion: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/v0/claims/nextQuestion",
        tags,
        description:
          "The one open question on a hunch or prediction: the most important gap, with a suggested default where there is one. `question` is null when there is nothing to ask or three have been asked.",
      },
    })
    .input(z.object({ claimId: z.string(), apiKey }))
    .output(
      z.object({
        claimId: z.string(),
        grade: z.number(),
        question,
        questionsAsked: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const view = await getClaim(
        await requireUser(ctx, input.apiKey),
        input.claimId,
      ).catch(toTrpcError)
      return {
        claimId: view.id,
        grade: view.grade,
        question: view.nextQuestion,
        questionsAsked: view.questionsAsked,
      }
    }),

  answer: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/v0/claims/answer",
        tags,
        description:
          'Answer the open question. Send exactly one of: `accept: true` (take the suggested default; it is stored as "working"), `value` (your own answer; stored as "stated"), or `skip: true`. Returns the updated item, including whether it has become a prediction, and the next question.',
        example: { request: { claimId: "CLAIM_ID", accept: true } },
      },
    })
    .input(
      z.object({
        claimId: z.string(),
        accept: z.boolean().optional(),
        value: z.union([z.string(), z.number()]).optional(),
        skip: z.boolean().optional(),
        source,
        apiKey,
      }),
    )
    .output(claim)
    .mutation(async ({ input, ctx }) => {
      const given = [
        input.accept === true,
        input.value !== undefined,
        input.skip === true,
      ].filter(Boolean).length
      if (given !== 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Send exactly one of: accept, value, skip.",
        })
      }
      return answerQuestion(
        await requireUser(ctx, input.apiKey),
        input.claimId,
        input.accept
          ? { accept: true }
          : input.skip
            ? { skip: true }
            : { value: input.value! },
        toSource(input.source),
      ).catch(toTrpcError)
    }),

  confidence: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/v0/claims/confidence",
        tags,
        description:
          "Update how sure you are with a word or a number, and an optional note on why. Words: almost certain, very likely, likely, toss-up, unlikely, very unlikely, almost no chance. A word is stored with the midpoint of its range as the number.",
        example: {
          request: {
            claimId: "CLAIM_ID",
            word: "unlikely",
            note: "Jobs report came in strong",
          },
        },
      },
    })
    .input(
      z.object({
        claimId: z.string(),
        confidence: z
          .union([z.string(), z.number()], {
            description:
              'What you would say: "30%", "0.3" or a confidence word. A bare number like "3" is refused, because it could mean several things.',
          })
          .optional(),
        word: z.string().optional(),
        probability: z
          .number({ description: "Between 0 and 1" })
          .min(0)
          .max(1)
          .optional(),
        note: z.string().optional(),
        source,
        apiKey,
      }),
    )
    .output(claim)
    .mutation(async ({ input, ctx }) => {
      let word: ConfidenceWord | undefined
      let probability = input.probability
      if (input.confidence !== undefined) {
        const reading = readConfidence(input.confidence)
        if (!reading.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: reading.error })
        }
        if ("word" in reading) word = reading.word
        else probability = reading.probability
      } else if (input.word !== undefined) {
        const parsed = parseConfidenceWord(input.word)
        if (!parsed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Unknown confidence word. Use one of: almost certain, very likely, likely, toss-up, unlikely, very unlikely, almost no chance.",
          })
        }
        word = parsed
      }
      return updateConfidence(
        await requireUser(ctx, input.apiKey),
        input.claimId,
        { word, probability, note: input.note },
        toSource(input.source),
      ).catch(toTrpcError)
    }),

  linkParent: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/v0/claims/linkParent",
        tags,
        description:
          "Link an item to the earlier, vaguer hunch it grew out of. Send parentId null to remove the link.",
      },
    })
    .input(
      z.object({
        claimId: z.string(),
        parentId: z.string().nullable(),
        source,
        apiKey,
      }),
    )
    .output(claim)
    .mutation(async ({ input, ctx }) =>
      linkParent(
        await requireUser(ctx, input.apiKey),
        input.claimId,
        input.parentId,
        toSource(input.source),
      ).catch(toTrpcError),
    ),

  list: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/v0/claims/list",
        tags,
        description:
          'List your hunches and predictions, newest first. To ask "what\'s due?", set `due`: "soon" (deadline today or within `withinDays`, default 7), "overdue" (deadline passed, not resolved) or "soon_or_overdue". Those come back most pressing first.',
      },
    })
    .input(
      z.object({
        status: z.enum(["open", "resolved", "all"]).optional(),
        due: z.enum(["soon", "overdue", "soon_or_overdue"]).optional(),
        withinDays: z.coerce.number().int().min(0).max(366).optional(),
        limit: z.coerce.number().min(1).max(200).optional(),
        timeZone: z
          .string({
            description:
              'IANA time zone, e.g. "America/Chicago". "Today" and due dates are worked out in it. Defaults to the one saved on your account.',
          })
          .optional(),
        apiKey,
      }),
    )
    .output(z.object({ claims: z.array(claim) }))
    .query(async ({ input, ctx }) => ({
      claims: await listClaims(await requireUser(ctx, input.apiKey), {
        status: input.status,
        due: input.due,
        withinDays: input.withinDays,
        limit: input.limit,
        timeZone: input.timeZone,
      }).catch(toTrpcError),
    })),

  resolve: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/v0/claims/resolve",
        tags,
        description:
          'Resolve a prediction. Give `result` (right, wrong or can\'t tell), or for a prediction about a number just give `actual` and the code works out right or wrong. A near miss on an "about" number is marked as a close call. A hunch cannot be resolved.',
        example: { request: { claimId: "CLAIM_ID", actual: 5.8 } },
      },
    })
    .input(
      z.object({
        claimId: z.string(),
        result: z
          .string({ description: "right, wrong or can't tell" })
          .optional(),
        resolution: z
          .enum(["YES", "NO", "AMBIGUOUS"], {
            description: "Older form of `result`. Still accepted.",
          })
          .optional(),
        actual: z.union([z.string(), z.number()]).optional(),
        source,
        apiKey,
      }),
    )
    .output(claim)
    .mutation(async ({ input, ctx }) => {
      let resolution = input.resolution
      if (input.result !== undefined) {
        const parsed = parseResult(input.result)
        if (!parsed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "result must be right, wrong or can't tell.",
          })
        }
        resolution = parsed
      }
      return resolveClaim(
        await requireUser(ctx, input.apiKey),
        input.claimId,
        { resolution, actual: input.actual },
        toSource(input.source),
      ).catch(toTrpcError)
    }),
})
