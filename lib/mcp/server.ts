/**
 * The MCP server: lets Claude log and update my claims in the middle of a
 * conversation. It is a thin wrapper - every tool calls the same function
 * the web UI and API call (lib/claims/service.ts), and records the entry
 * source as "AGENT" so the history shows the claim came in through an agent.
 *
 * Tool inputs are described twice on purpose: as JSON Schema (what Claude
 * is shown) and as a zod schema (what is actually enforced). The MCP
 * library can derive one from the other, but doing so overwhelms the
 * TypeScript checker in this project, so they are written out.
 *
 * Served by pages/api/mcp.ts. Server-side only.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { APP_NAME } from "../app_name"
import { parseConfidenceWord } from "../claims/confidence"
import {
  answerQuestion,
  ClaimError,
  ClaimView,
  linkParent,
  listClaims,
  logClaim,
  resolveClaim,
  updateConfidence,
} from "../claims/service"

/** What Claude is told about how to use these tools. */
export const MCP_INSTRUCTIONS = `${APP_NAME} is the user's personal log of their own claims and predictions.

- Log a claim only when the user asks you to, or clearly states a prediction and wants it recorded. Never log claims made by other people.
- Pass the user's claim in their own words, exactly as they said it. Do not tidy, sharpen or complete it: the app grades how checkable the claim is, and filling gaps for them would hide what they actually said.
- After logging, the app may return one question. Ask the user that question, with its suggested default if there is one, and wait for their reply. Do not answer it yourself. Use accept only when the user agrees to the suggested default.
- When the user asks what is due, coming up or overdue, call list_claims with due set, and tell them each claim's text and its "due" line. Do not resolve anything unless they tell you how it turned out.
- A grade of 1 to 3 is fine. Those are hunches, and they stay private. Do not push the user to keep answering.`

/** A compact, readable summary of a claim for the model. */
export function summarize(claim: ClaimView) {
  return {
    id: claim.id,
    url: claim.url,
    text: claim.text,
    claimDate: claim.claimDate,
    [claim.deadlineKind === "deadline" ? "deadline" : "checkBackBy"]:
      claim.deadline,
    ...(claim.dueText ? { due: claim.dueText } : {}),
    grade: claim.grade,
    gradeReason: claim.gradeReason,
    shape: claim.shape,
    outcome: Object.fromEntries(
      Object.entries(claim.parts).map(([name, part]) => [
        name,
        `${part.value} (${part.status})`,
      ]),
    ),
    confidence:
      claim.probability === null
        ? "not given"
        : `${Math.round(claim.probability * 1000) / 10}%${
            claim.confidenceWord
              ? ` (${claim.confidenceWord.toLowerCase().replace(/_/g, " ")})`
              : ""
          }`,
    public: claim.sharedPublicly,
    parent: claim.parent,
    ...(claim.resolved
      ? {
          resolution: claim.resolution,
          closeCall: claim.closeCall,
          actualResult: claim.actualResult,
        }
      : {}),
    nextQuestion: claim.nextQuestion
      ? {
          question: claim.nextQuestion.question,
          suggestedDefault: claim.nextQuestion.suggestion?.label ?? null,
          number: claim.questionsAsked + 1,
        }
      : null,
  }
}

const CONFIDENCE_WORDS = [
  "almost certain",
  "very likely",
  "likely",
  "toss-up",
  "unlikely",
  "very unlikely",
  "almost no chance",
] as const

const str = (description?: string) => ({ type: "string", description })
const bool = { type: "boolean" }
const stringOrNumber = (description?: string) => ({
  type: ["string", "number"],
  description,
})

type Tool = {
  name: string
  title: string
  description: string
  /** shown to Claude */
  inputSchema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
  readOnly?: boolean
  /** enforced on every call */
  input: z.ZodTypeAny
  handler: (userId: string, args: any) => Promise<unknown>
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")

export const TOOLS: Tool[] = [
  {
    name: "log_claim",
    title: "Log a claim",
    description:
      "Log one of the user's own claims or predictions. Pass their words exactly as said, unedited. Returns the claim's id, its grade (1-5, how checkable it is) and nextQuestion: one question from the app about the most important gap, which you should ask the user.",
    inputSchema: {
      type: "object",
      properties: {
        text: str("The claim, in the user's own words. Do not rewrite it."),
        claim_date: str(
          "YYYY-MM-DD. Only if the user says they made the claim on an earlier day. Leave out for today.",
        ),
        parent_id: str(
          "Id of an earlier, vaguer claim this one grew out of, if the user says so.",
        ),
      },
      required: ["text"],
    },
    input: z.object({
      text: z.string().min(1),
      claim_date: isoDay.optional(),
      parent_id: z.string().optional(),
    }),
    handler: async (userId, args) =>
      summarize(
        await logClaim({
          userId,
          text: args.text,
          claimDate: args.claim_date,
          parentId: args.parent_id,
          source: "AGENT",
        }),
      ),
  },
  {
    name: "answer_question",
    title: "Answer the app's question",
    description:
      "Give the user's reply to a claim's open question. Send exactly one of: accept=true (the user agreed to the suggested default), value (the user's own answer, in their words; a date as YYYY-MM-DD), or skip=true. Returns the updated claim and the next question, if any.",
    inputSchema: {
      type: "object",
      properties: {
        claim_id: str(),
        accept: bool,
        value: stringOrNumber(),
        skip: bool,
      },
      required: ["claim_id"],
    },
    input: z.object({
      claim_id: z.string(),
      accept: z.boolean().optional(),
      value: z.union([z.string(), z.number()]).optional(),
      skip: z.boolean().optional(),
    }),
    handler: async (userId, args) => {
      const given = [
        args.accept === true,
        args.value !== undefined,
        args.skip === true,
      ]
      if (given.filter(Boolean).length !== 1) {
        throw new ClaimError(
          "BAD_REQUEST",
          "Send exactly one of: accept, value, skip.",
        )
      }
      return summarize(
        await answerQuestion(
          userId,
          args.claim_id,
          args.accept
            ? { accept: true }
            : args.skip
              ? { skip: true }
              : { value: args.value },
          "AGENT",
        ),
      )
    },
  },
  {
    name: "update_confidence",
    title: "Update confidence",
    description:
      "Record a change in how confident the user is in a claim. Give either word or probability, plus an optional note on why they changed their mind.",
    inputSchema: {
      type: "object",
      properties: {
        claim_id: str(),
        word: { type: "string", enum: [...CONFIDENCE_WORDS] },
        probability: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Between 0 and 1, e.g. 0.7 for 70%.",
        },
        note: str("Why, in the user's words."),
      },
      required: ["claim_id"],
    },
    input: z.object({
      claim_id: z.string(),
      word: z.enum(CONFIDENCE_WORDS).optional(),
      probability: z.number().min(0).max(1).optional(),
      note: z.string().optional(),
    }),
    handler: async (userId, args) =>
      summarize(
        await updateConfidence(
          userId,
          args.claim_id,
          {
            word: args.word
              ? parseConfidenceWord(args.word) ?? undefined
              : undefined,
            probability: args.probability,
            note: args.note,
          },
          "AGENT",
        ),
      ),
  },
  {
    name: "link_parent",
    title: "Link to a parent claim",
    description:
      "Link a claim to the earlier, vaguer claim it grew out of, so the user can see how a hunch became a sharper claim. Pass parent_id null to remove the link.",
    inputSchema: {
      type: "object",
      properties: {
        claim_id: str(),
        parent_id: { type: ["string", "null"] },
      },
      required: ["claim_id", "parent_id"],
    },
    input: z.object({ claim_id: z.string(), parent_id: z.string().nullable() }),
    handler: async (userId, args) =>
      summarize(
        await linkParent(userId, args.claim_id, args.parent_id, "AGENT"),
      ),
  },
  {
    name: "list_claims",
    title: "List claims",
    description:
      'List the user\'s claims, newest first, with ids, grades, deadlines and confidence. Use it to find a claim\'s id before updating it. To answer "what\'s due?", set due: "soon" for unresolved claims due today or within within_days (default 7), "overdue" for unresolved claims whose deadline has passed, or "soon_or_overdue" for both. Those come back most pressing first, each with a "due" line such as "overdue by 3 days".',
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "resolved", "all"] },
        due: {
          type: "string",
          enum: ["soon", "overdue", "soon_or_overdue"],
          description:
            "Only unresolved claims that are due soon, overdue, or either.",
        },
        within_days: {
          type: "integer",
          minimum: 0,
          maximum: 366,
          description: 'How far ahead "soon" looks. Default 7.',
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    readOnly: true,
    input: z.object({
      status: z.enum(["open", "resolved", "all"]).optional(),
      due: z.enum(["soon", "overdue", "soon_or_overdue"]).optional(),
      within_days: z.number().int().min(0).max(366).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    handler: async (userId, args) =>
      (
        await listClaims(userId, {
          status: args.status,
          due: args.due,
          withinDays: args.within_days,
          limit: args.limit ?? 20,
        })
      ).map(summarize),
  },
  {
    name: "resolve_claim",
    title: "Resolve a claim",
    description:
      'Record how a claim turned out. Only on the user\'s say-so. Give resolution (YES, NO or AMBIGUOUS), or for a number claim give actual and the app works out YES or NO itself. A near miss on an "about" claim is marked as a close call.',
    inputSchema: {
      type: "object",
      properties: {
        claim_id: str(),
        resolution: { type: "string", enum: ["YES", "NO", "AMBIGUOUS"] },
        actual: stringOrNumber(
          "What actually happened: a number, or a short phrase.",
        ),
      },
      required: ["claim_id"],
    },
    input: z.object({
      claim_id: z.string(),
      resolution: z.enum(["YES", "NO", "AMBIGUOUS"]).optional(),
      actual: z.union([z.string(), z.number()]).optional(),
    }),
    handler: async (userId, args) =>
      summarize(
        await resolveClaim(
          userId,
          args.claim_id,
          { resolution: args.resolution, actual: args.actual },
          "AGENT",
        ),
      ),
  },
]

const text = (value: string) => [{ type: "text" as const, text: value }]

/**
 * Runs one tool for one user. A bad input or a broken rule comes back as
 * an error result the model can read and relay, not a crash.
 */
export async function callTool(userId: string, name: string, args: unknown) {
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) {
    return { isError: true, content: text(`Unknown tool: ${name}`) }
  }
  const parsed = tool.input.safeParse(args ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      isError: true,
      content: text(
        `Invalid input for ${name}: ${issue.path.join(".")} ${issue.message}`,
      ),
    }
  }
  try {
    const result = await tool.handler(userId, parsed.data)
    return { content: text(JSON.stringify(result, null, 2)) }
  } catch (error) {
    if (error instanceof ClaimError) {
      return {
        isError: true,
        content: text([error.message, ...error.reasons].join("\n")),
      }
    }
    throw error
  }
}

/** Builds the server for one signed-in user. */
export function buildMcpServer(userId: string) {
  const server = new Server(
    { name: "my-mark-to-market", version: "1.0.0" },
    { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS },
  )

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { title: tool.title, readOnlyHint: !!tool.readOnly },
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, (request) =>
    callTool(userId, request.params.name, request.params.arguments),
  )

  return server
}
