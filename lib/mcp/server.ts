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
import { readConfidence } from "../claims/confidence"
import { parseResult } from "../claims/words"
import {
  answerQuestion,
  ClaimError,
  ClaimView,
  confirmProposal,
  ConfidenceUpdate,
  previewClaim,
  previewWithSplit,
  editClaim,
  linkParent,
  listClaims,
  logClaim,
  logWithSplit,
  resolveClaim,
  setPublic,
  updateConfidence,
  withdrawClaim,
} from "../claims/service"

/** What Claude is told about how to use these tools. */
export const MCP_INSTRUCTIONS = `${APP_NAME} is the user's personal tracker for their own predictions.

One word: everything the user logs is a prediction. It can be loose ("the labor market is weakening"). A grade from 1 to 5 says how checkable it is:
- Grades 1 to 3 are not checkable yet. That is fine: a loose prediction is still worth keeping.
- Grades 4 and 5 are checkable: ONE outcome, a deadline and a way to tell. Only a checkable prediction can be published, resolved and scored.
Every prediction is private until the user publishes it.

Every prediction has two texts:
- the user's raw words, saved exactly as they said them and never changed ("originally said");
- a headline: your clean, sharp rewrite of what they meant, which they approve. The headline is what shows everywhere: lists, the detail page, the Due tab, the public track record.

Logging: clean it hard, preview it, save only what the user approves.
1. Log a prediction only when the user asks you to, or clearly states one and wants it recorded. Never log things other people said.
2. Pass the user's raw words unchanged as text. Do all your cleaning in the headline and the outcome parts, never in text.
3. Clean aggressively, up front. People talk loosely; your job is to turn that into something that can be checked. Write a headline: one clear, sharp sentence in plain words, naming exactly who or what, the measure, the threshold and the date. Prefer precise terms to the user's loose ones, and fill gaps with your best reading of what they meant. Then work out the shape, every outcome part (for an event, including howToTell: a source, a measure or a fact anyone could look up), a deadline and a confidence word.
4. If their words hold several predictions ("X won't happen, and Y will beat Z, but W"), split them: one piece per prediction, each with its own headline, parts, deadline and confidence. The original sentence is kept as the one they grew out of, and stays under every piece as what was originally said.
5. The hard rules, which the app enforces: a checkable prediction is ONE outcome (no "if … then", no "and/or", no two results joined by "and"), and an event needs a way to tell. Anything that breaks them stays below grade 4.
6. Call preview_claim with their raw words and your whole proposal. It saves NOTHING. It returns how the app would grade and store it.
7. In ONE reply, show the user the whole preview: each headline, its parts, the deadline, the confidence you suggest, and the grade with whether that is checkable. Say plainly that nothing is saved yet. Expect them to steer: they will often change your wording, a number or a date. Do not ask one field per message.
8. When they steer, apply what they said and, if the change is more than small, preview again. Only when they approve call log_claim, with their raw words, the version they approved, their confidence, and approved: true. Nothing you wrote or guessed is saved unless they said yes to it.
9. Pass claim_date from the preview's claimDate, so the date is when they first said it, not when they approved it.
10. If they do not answer or say no, save nothing. If they say "just log it as it is", call log_claim with their words only: a loose prediction with no headline is fine.

Other rules:
- A loose prediction is fine left loose. Do not push the user to sharpen it.
- Confidence: pass what the user said ("30%", "0.3", "likely"). If they give a bare number like "3", ask what they mean before sending it.
- Older items may have no headline. To add or change one, propose it, and once the user approves call edit_claim with headline. Use edit_claim for outcome parts and dates too. The raw words never change; pass corrected_text only when the user explicitly says their words were recorded wrongly.
- When you talk about a prediction, use its headline. Mention the raw words only if the user asks what they originally said.
- Publishing: call publish_claim ONLY when the user asks, in so many words, to publish or unpublish a specific prediction. Never on your own initiative, never as part of logging or sharpening, and never because it "seems ready". Only a checkable prediction can be published; if the app refuses, tell the user its reason.
- Use withdraw_claim when the user wants something gone. Nothing is ever deleted; a withdrawn prediction is hidden but kept with its history.
- When the user asks what is due, coming up or overdue, call list_claims with due set, and tell them each prediction's headline and its "due" line.
- Record how a prediction turned out only when the user tells you. One that is not checkable yet cannot be resolved.
- Say "prediction" to the user, and "checkable" for grade 4 or 5. The tool and field names say "claim", and the field called kind still answers "hunch" (grades 1 to 3) or "prediction" (grades 4 and 5), for technical reasons; do not repeat "claim" or "hunch" to them.`

/** A compact, readable summary of a claim for the model. */
export function summarize(claim: ClaimView) {
  return {
    id: claim.id,
    url: claim.url,
    kind: claim.kind,
    ...(claim.imported ? { imported: true } : {}),
    // the headline is what shows everywhere; the raw words sit underneath
    ...(claim.headline
      ? { headline: claim.headline, originallySaid: claim.text }
      : { text: claim.text, headline: null }),
    claimDate: claim.claimDate,
    [claim.deadlineKind === "deadline" ? "deadline" : "checkBackBy"]:
      claim.deadline,
    ...(claim.dueText ? { due: claim.dueText } : {}),
    grade: claim.grade,
    gradeReason: claim.gradeReason,
    ...(claim.compound
      ? { split: "needed: this holds more than one prediction" }
      : {}),
    // the app's own AI step was asked to read the words and added nothing
    ...(claim.aiNote ? { appAiStep: `added nothing: ${claim.aiNote}` } : {}),
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
    ...(Object.values(claim.parts).some((part) => part.status !== "stated")
      ? {
          unconfirmed:
            "parts marked (extracted) or (working) are not the user's until they confirm them",
        }
      : {}),
    public: claim.sharedPublicly,
    parent: claim.parent,
    ...(claim.withdrawn ? { withdrawn: true } : {}),
    ...(claim.resolved
      ? {
          result: claim.result,
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

const SHAPES = [
  "NUMBER_BY_DATE",
  "EVENT_BY_DATE",
  "A_BEATS_B",
  "RANK_OR_AWARD",
] as const

const PARTS_HELP =
  "Outcome parts for the shape. NUMBER_BY_DATE: measure, comparison (above, below, at_least, at_most, between), value, unit, and optionally valueHigh, baseline. EVENT_BY_DATE: event (what would be seen to happen) and howToTell (a source, a measure or a fact anyone could look up). A_BEATS_B: a, b, metric. RANK_OR_AWARD: subject, rankOrAward."

const proposalSchema = {
  shape: { type: "string", enum: [...SHAPES] },
  parts: { type: "object", description: PARTS_HELP },
  deadline: str("YYYY-MM-DD."),
}
const partValues = z.record(z.union([z.string(), z.number()]))
const proposalInput = z.object({
  shape: z.enum(SHAPES),
  parts: partValues.optional(),
  deadline: isoDay.optional(),
})
const timeZoneProp = str(
  'IANA time zone, e.g. "America/Chicago". Only if the user says they are somewhere other than usual; otherwise the one saved on their account is used.',
)
const confidenceProp = stringOrNumber(
  'How sure: "30%", "0.3", or a confidence word. In preview_claim this is your suggestion; in log_claim it must be what the user agreed to.',
)
const confidenceInput = z.union([z.string(), z.number()]).optional()

/** The inputs preview_claim and log_claim share. */
const headlineProp = str(
  "Your clean, sharp rewrite: one clear sentence naming who or what, the measure, the threshold and the date. This is what will show everywhere once the user approves it.",
)
const hunchProperties = {
  text: str(
    "The user's raw words, exactly as they said them. Do not rewrite them here; put your rewrite in headline.",
  ),
  headline: headlineProp,
  proposal: {
    type: "object",
    description:
      "The sharpening, when the user's words are ONE prediction. Leave out if you are sending split.",
    properties: proposalSchema,
    required: ["shape"],
  },
  confidence: confidenceProp,
  split: {
    type: "array",
    description:
      "When the user's words hold more than one prediction: one piece per prediction. Each piece becomes its own item with the original as its parent.",
    items: {
      type: "object",
      properties: {
        headline: headlineProp,
        ...proposalSchema,
        confidence: confidenceProp,
      },
      required: ["headline", "shape"],
    },
  },
  claim_date: str(
    "YYYY-MM-DD. The day the user first said it. In log_claim, pass the claimDate the preview returned.",
  ),
  parent_id: str(
    "Id of an earlier, looser prediction this one grew out of, if the user says so.",
  ),
  time_zone: timeZoneProp,
}
const hunchInput = z.object({
  text: z.string().min(1),
  headline: z.string().min(1).optional(),
  proposal: proposalInput.optional(),
  confidence: confidenceInput,
  split: z
    .array(
      proposalInput.extend({
        headline: z.string().min(1),
        // older callers sent the excerpt of the user's words here; still accepted
        text: z.string().min(1).optional(),
        confidence: confidenceInput,
      }),
    )
    .max(8)
    .optional(),
  claim_date: isoDay.optional(),
  parent_id: z.string().optional(),
  time_zone: z.string().optional(),
})

/** Turns tool arguments into what the service takes. */
function hunchArgs(userId: string, args: any, approved: boolean) {
  return {
    userId,
    text: args.text as string,
    headline: args.headline as string | undefined,
    claimDate: args.claim_date as string | undefined,
    parentId: args.parent_id as string | undefined,
    source: "AGENT" as const,
    timeZone: args.time_zone as string | undefined,
    proposal: args.proposal,
    proposalStatus: approved ? ("stated" as const) : ("extracted" as const),
    confidence:
      args.confidence === undefined || args.split?.length
        ? undefined
        : confidenceFrom(args.confidence),
    split: (args.split ?? []).map((piece: any) => ({
      headline: piece.headline,
      text: piece.text,
      shape: piece.shape,
      parts: piece.parts,
      deadline: piece.deadline,
      confidence:
        piece.confidence === undefined
          ? undefined
          : confidenceFrom(piece.confidence),
    })),
  }
}

/** A preview, summarised like a saved item but with no id. */
function summarizePreview(preview: any) {
  // eslint-disable-next-line no-unused-vars
  const { id, url, ...rest } = summarize({ ...preview, id: "", url: "" })
  return { ...rest, saved: false }
}

/** Reads "30%", "0.3" or a word; a bare "3" comes back as a question to ask. */
function confidenceFrom(raw: string | number, note?: string): ConfidenceUpdate {
  const reading = readConfidence(raw)
  if (!reading.ok) throw new ClaimError("BAD_REQUEST", reading.error)
  return "word" in reading
    ? { word: reading.word, note }
    : { probability: reading.probability, note }
}

export const TOOLS: Tool[] = [
  {
    name: "preview_claim",
    title: "Preview a prediction (saves nothing)",
    description:
      "Shows how the app would grade and save a prediction with your proposed sharpening, WITHOUT saving anything. Call this first, every time, then show the user the whole result in one reply and ask them to approve or correct it. Returns the original and any pieces, each with its headline, grade (4 or 5 is checkable), the reason for the grade and what is missing.",
    inputSchema: {
      type: "object",
      properties: hunchProperties,
      required: ["text"],
    },
    readOnly: true,
    input: hunchInput,
    handler: async (userId, args) => {
      const input = hunchArgs(userId, args, false)
      const next =
        "Nothing has been saved. Show the user all of this in one reply and ask them to approve or correct it. Only then call log_claim with approved: true, the version they approved, and claim_date set to the claimDate above."
      if (input.split.length) {
        const { original, pieces } = await previewWithSplit(input)
        return {
          saved: false,
          original: { ...summarizePreview(original), nextQuestion: null },
          pieces: pieces.map(summarizePreview),
          next,
        }
      }
      // eslint-disable-next-line no-unused-vars
      const { split, ...single } = input
      return { ...summarizePreview(await previewClaim(single)), next }
    },
  },
  {
    name: "log_claim",
    title: "Log a prediction (after the user approves)",
    description:
      "Saves a prediction in the user's exact words. With a proposal or a split, call it only after the user has seen the preview and approved it, and pass approved: true with exactly the version they approved: those parts are saved as theirs. Without a proposal it saves their words alone, as a loose prediction. Returns the saved item(s) with ids.",
    inputSchema: {
      type: "object",
      properties: {
        ...hunchProperties,
        approved: {
          type: "boolean",
          description:
            "true only when the user has seen this exact version (from preview_claim) and said yes to it. Required with headline, proposal or split.",
        },
      },
      required: ["text"],
    },
    input: hunchInput.extend({ approved: z.boolean().optional() }),
    handler: async (userId, args) => {
      const sharpened =
        !!args.proposal || !!args.split?.length || !!args.headline
      if (sharpened && args.approved !== true) {
        throw new ClaimError(
          "BLOCKED",
          "Nothing was saved. A headline or a proposal is saved only after the user approves it: call preview_claim, show them the result, and call log_claim with approved: true once they say yes. To save their words alone, send text on its own.",
        )
      }
      const input = hunchArgs(userId, args, true)
      if (input.split.length) {
        const { original, pieces } = await logWithSplit(input)
        return {
          // the original stays as the hunch; the questions belong to its pieces
          original: { ...summarize(original), nextQuestion: null },
          pieces: pieces.map(summarize),
        }
      }
      // eslint-disable-next-line no-unused-vars
      const { split, ...single } = input
      return summarize(await logClaim(single))
    },
  },
  {
    name: "confirm_proposal",
    title: "Confirm a proposal",
    description:
      "For an item that is already saved with unconfirmed (extracted or working) parts: the user has confirmed or corrected them. Applies their corrections, marks every part as stated by them, and records their confidence, as one recorded version. Call it only after the user has answered; once per item.",
    inputSchema: {
      type: "object",
      properties: {
        claim_id: str(),
        edit: {
          type: "object",
          description:
            "The user's corrections, if any. parts: part name to the corrected value, or null to remove it.",
          properties: {
            shape: { type: "string", enum: [...SHAPES] },
            parts: { type: "object", description: PARTS_HELP },
            deadline: str("YYYY-MM-DD."),
          },
        },
        confidence: stringOrNumber(
          'How sure the user said they are: "30%", "0.3", or a confidence word. Leave out if they gave none.',
        ),
      },
      required: ["claim_id"],
    },
    input: z.object({
      claim_id: z.string(),
      edit: z
        .object({
          shape: z.enum(SHAPES).optional(),
          parts: z
            .record(z.union([z.string(), z.number(), z.null()]))
            .optional(),
          deadline: isoDay.optional(),
        })
        .optional(),
      confidence: z.union([z.string(), z.number()]).optional(),
    }),
    handler: async (userId, args) =>
      summarize(
        await confirmProposal(
          userId,
          args.claim_id,
          {
            edit: args.edit,
            confidence:
              args.confidence === undefined
                ? undefined
                : confidenceFrom(args.confidence),
          },
          "AGENT",
        ),
      ),
  },
  {
    name: "edit_claim",
    title: "Edit a prediction",
    description:
      "Change the headline, shape, outcome parts, deadline or check-back date of an item. Each call is one recorded version; nothing is overwritten silently. The original text stays as the user said it: pass corrected_text only when the user explicitly says their words were recorded wrongly.",
    inputSchema: {
      type: "object",
      properties: {
        claim_id: str(),
        shape: { type: "string", enum: [...SHAPES] },
        parts: {
          type: "object",
          description: `${PARTS_HELP} Give only the parts to change; null removes one.`,
        },
        deadline: str(
          "YYYY-MM-DD. The deadline, or the check-back date of one that is not checkable yet.",
        ),
        headline: {
          type: ["string", "null"],
          description:
            "Set or replace the headline, once the user has approved the wording. null removes it.",
        },
        corrected_text: str(
          "Only when the user explicitly corrects what they said. Their words, exactly.",
        ),
      },
      required: ["claim_id"],
    },
    input: z.object({
      claim_id: z.string(),
      shape: z.enum(SHAPES).optional(),
      parts: z.record(z.union([z.string(), z.number(), z.null()])).optional(),
      deadline: isoDay.optional(),
      headline: z.string().min(1).nullable().optional(),
      corrected_text: z.string().min(1).optional(),
    }),
    handler: async (userId, args) => {
      if (
        args.shape === undefined &&
        args.parts === undefined &&
        args.deadline === undefined &&
        args.headline === undefined &&
        args.corrected_text === undefined
      ) {
        throw new ClaimError("BAD_REQUEST", "Nothing to change was given.")
      }
      return summarize(
        await editClaim(
          userId,
          args.claim_id,
          {
            shape: args.shape,
            parts: args.parts,
            deadline: args.deadline,
            headline: args.headline,
            correctedText: args.corrected_text,
          },
          "AGENT",
        ),
      )
    },
  },
  {
    name: "withdraw_claim",
    title: "Withdraw a prediction",
    description:
      "Withdraw an item at the user's request. It is hidden everywhere, including the public track record, but it is never deleted: it is kept with its full history.",
    inputSchema: {
      type: "object",
      properties: { claim_id: str() },
      required: ["claim_id"],
    },
    input: z.object({ claim_id: z.string() }),
    handler: async (userId, args) =>
      summarize(await withdrawClaim(userId, args.claim_id, "AGENT")),
  },
  {
    name: "answer_question",
    title: "Answer the app's question",
    description:
      "Give the user's reply to the open question on a prediction. Send exactly one of: accept=true (the user agreed to the suggested default), value (the user's own answer, in their words; a date as YYYY-MM-DD), or skip=true. Returns the updated item, whether it has become a prediction, and the next question, if any.",
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
      'Record how sure the user is, or a change in it. Pass what they said: a percentage ("30%"), a number between 0 and 1 ("0.3"), or a confidence word ("probably" means likely). A bare number like "3" is not accepted: ask the user what they mean first. Add a note on why, if they gave one.',
    inputSchema: {
      type: "object",
      properties: {
        claim_id: str(),
        confidence: stringOrNumber(
          `"30%", "0.3", or one of: ${CONFIDENCE_WORDS.join(", ")}.`,
        ),
        note: str("Why, in the user's words."),
      },
      required: ["claim_id"],
    },
    input: z.object({
      claim_id: z.string(),
      confidence: z.union([z.string(), z.number()]).optional(),
      // accepted for older callers
      word: z.string().optional(),
      probability: z.number().min(0).max(1).optional(),
      note: z.string().optional(),
    }),
    handler: async (userId, args) => {
      const given = args.confidence ?? args.word ?? args.probability
      if (given === undefined) {
        throw new ClaimError(
          "BAD_REQUEST",
          'Give a confidence: a percentage ("30%"), a number between 0 and 1, or a confidence word.',
        )
      }
      const update =
        args.confidence === undefined && args.probability !== undefined
          ? { probability: args.probability, note: args.note }
          : confidenceFrom(given, args.note)
      return summarize(
        await updateConfidence(userId, args.claim_id, update, "AGENT"),
      )
    },
  },
  {
    name: "link_parent",
    title: "Link to an earlier prediction",
    description:
      "Link a prediction to the earlier, looser one it grew out of, so the user can see how it was sharpened. Pass parent_id null to remove the link.",
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
    title: "List predictions",
    description:
      'List the user\'s predictions, newest first, with ids, grades, dates and confidence. Use it to find an id before updating something. To answer "what\'s due?", set due: "soon" for open items due today or within within_days (default 7), "overdue" for open items whose date has passed, or "soon_or_overdue" for both. Those come back most pressing first, each with a "due" line such as "overdue by 3 days".',
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "resolved", "all"] },
        due: {
          type: "string",
          enum: ["soon", "overdue", "soon_or_overdue"],
          description: "Only open items that are due soon, overdue, or either.",
        },
        within_days: {
          type: "integer",
          minimum: 0,
          maximum: 366,
          description: 'How far ahead "soon" looks. Default 7.',
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        time_zone: timeZoneProp,
      },
    },
    readOnly: true,
    input: z.object({
      status: z.enum(["open", "resolved", "all"]).optional(),
      due: z.enum(["soon", "overdue", "soon_or_overdue"]).optional(),
      within_days: z.number().int().min(0).max(366).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      time_zone: z.string().optional(),
    }),
    handler: async (userId, args) =>
      (
        await listClaims(userId, {
          status: args.status,
          due: args.due,
          withinDays: args.within_days,
          limit: args.limit ?? 20,
          timeZone: args.time_zone,
        })
      ).map(summarize),
  },
  {
    name: "publish_claim",
    title: "Publish or unpublish a prediction",
    description:
      "Publishes a prediction to the user's public track record, or takes it off again. Use it ONLY when the user explicitly asks, in so many words, to publish or unpublish that prediction. Never on your own initiative, and never as a step of logging, sharpening or resolving. Only a checkable prediction (grade 4 or 5, every part confirmed) that is not withdrawn can be published, at any time including after it is resolved; if the app refuses, it says why in plain words: pass that on. Unpublishing always works and takes effect at once. Each change is recorded in the user's private history.",
    inputSchema: {
      type: "object",
      properties: {
        claim_id: str(),
        publish: {
          type: "boolean",
          description:
            "true to publish, false to unpublish. Exactly what the user asked for.",
        },
      },
      required: ["claim_id", "publish"],
    },
    input: z.object({ claim_id: z.string(), publish: z.boolean() }),
    handler: async (userId, args) =>
      summarize(await setPublic(userId, args.claim_id, args.publish, "AGENT")),
  },
  {
    name: "resolve_claim",
    title: "Resolve a prediction",
    description:
      "Record how a prediction turned out. Only on the user's say-so, and only for a checkable prediction (grade 4 or 5): one that is not checkable yet cannot be resolved. Give result (right, wrong or can't tell), or for a prediction about a number give actual and the app works out right or wrong itself. A near miss on an \"about\" number is marked as a close call.",
    inputSchema: {
      type: "object",
      properties: {
        claim_id: str(),
        result: { type: "string", enum: ["right", "wrong", "can't tell"] },
        actual: stringOrNumber(
          "What actually happened: a number, or a short phrase.",
        ),
      },
      required: ["claim_id"],
    },
    input: z.object({
      claim_id: z.string(),
      result: z.enum(["right", "wrong", "can't tell"]).optional(),
      // accepted for older callers
      resolution: z.enum(["YES", "NO", "AMBIGUOUS"]).optional(),
      actual: z.union([z.string(), z.number()]).optional(),
    }),
    handler: async (userId, args) =>
      summarize(
        await resolveClaim(
          userId,
          args.claim_id,
          {
            resolution:
              (args.result && parseResult(args.result)) ||
              args.resolution ||
              undefined,
            actual: args.actual,
          },
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
