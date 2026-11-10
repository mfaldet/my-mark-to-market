/**
 * @jest-environment node
 */
// The real service needs a database; here we only check what the MCP
// layer passes to it and how it reports back.
jest.mock("../../claims/service", () => {
  class ClaimError extends Error {
    constructor(
      public code: string,
      message: string,
      public reasons: string[] = [],
    ) {
      super(message)
    }
  }
  return {
    __esModule: true,
    ClaimError,
    logClaim: jest.fn(),
    answerQuestion: jest.fn(),
    updateConfidence: jest.fn(),
    linkParent: jest.fn(),
    listClaims: jest.fn(),
    resolveClaim: jest.fn(),
  }
})

import * as claimService from "../../claims/service"
import { callTool, MCP_INSTRUCTIONS, summarize, TOOLS } from "../server"

const mocked = claimService as any
const makeClaimError = (code: string, message: string, reasons: string[]) =>
  new mocked.ClaimError(code, message, reasons)
const service: Record<string, jest.Mock> = {
  logClaim: mocked.logClaim,
  answerQuestion: mocked.answerQuestion,
  updateConfidence: mocked.updateConfidence,
  linkParent: mocked.linkParent,
  listClaims: mocked.listClaims,
  resolveClaim: mocked.resolveClaim,
}

const view = {
  id: "c1",
  url: "http://localhost/q/c1",
  text: "Unemployment will hit 6% by 2028",
  claimDate: "2025-07-14",
  deadline: "2028-12-31",
  deadlineKind: "check back by",
  grade: 4,
  gradeReason: "Complete and checkable. No confirmed check link.",
  shape: "NUMBER_BY_DATE",
  parts: { value: { value: 6, status: "extracted" } },
  confidenceWord: "LIKELY",
  probability: 0.7,
  sharedPublicly: false,
  parent: null,
  resolved: false,
  nextQuestion: {
    part: "deadline",
    kind: "confirm",
    question: "Is this the deadline you meant?",
    suggestion: { value: "2028-12-31", label: "By Dec 31, 2028?" },
  },
  questionsAsked: 0,
} as any

const parse = (result: { content: { text: string }[] }) =>
  JSON.parse(result.content[0].text)

beforeEach(() => {
  Object.values(service).forEach((fn) => fn.mockReset().mockResolvedValue(view))
  service.listClaims.mockResolvedValue([view])
})

describe("the MCP tools", () => {
  it("offers exactly the six tools", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      "log_claim",
      "answer_question",
      "update_confidence",
      "link_parent",
      "list_claims",
      "resolve_claim",
    ])
    for (const tool of TOOLS) {
      expect(tool.inputSchema.type).toBe("object")
      expect(tool.description.length).toBeGreaterThan(40)
    }
  })

  it("tells Claude to pass my words unchanged and not answer for me", () => {
    expect(MCP_INSTRUCTIONS).toMatch(/exactly as they said them/)
    expect(MCP_INSTRUCTIONS).toMatch(/Do not answer it yourself/)
  })

  it("log_claim passes the text through untouched and records the source as AGENT", async () => {
    const text = "  Unemployment will hit 6% by 2028  "
    const result = await callTool("u1", "log_claim", {
      text,
      claim_date: "2025-07-14",
    })
    expect(service.logClaim).toHaveBeenCalledWith({
      userId: "u1",
      text,
      claimDate: "2025-07-14",
      parentId: undefined,
      source: "AGENT",
    })
    expect(parse(result)).toMatchObject({
      id: "c1",
      grade: 4,
      checkBackBy: "2028-12-31",
      confidence: "70% (likely)",
      nextQuestion: {
        question: "Is this the deadline you meant?",
        suggestedDefault: "By Dec 31, 2028?",
        number: 1,
      },
    })
  })

  it("every changing tool acts as the signed-in user, via AGENT", async () => {
    await callTool("u1", "answer_question", { claim_id: "c1", accept: true })
    expect(service.answerQuestion).toHaveBeenCalledWith(
      "u1",
      "c1",
      { accept: true },
      "AGENT",
    )
    await callTool("u1", "answer_question", {
      claim_id: "c1",
      value: "2027-06-30",
    })
    expect(service.answerQuestion).toHaveBeenLastCalledWith(
      "u1",
      "c1",
      { value: "2027-06-30" },
      "AGENT",
    )
    await callTool("u1", "update_confidence", {
      claim_id: "c1",
      word: "very unlikely",
      note: "why",
    })
    expect(service.updateConfidence).toHaveBeenCalledWith(
      "u1",
      "c1",
      { word: "VERY_UNLIKELY", probability: undefined, note: "why" },
      "AGENT",
    )
    await callTool("u1", "link_parent", { claim_id: "c1", parent_id: "c0" })
    expect(service.linkParent).toHaveBeenCalledWith("u1", "c1", "c0", "AGENT")
    await callTool("u1", "resolve_claim", { claim_id: "c1", actual: 5.8 })
    expect(service.resolveClaim).toHaveBeenCalledWith(
      "u1",
      "c1",
      { resolution: undefined, actual: 5.8 },
      "AGENT",
    )
    await callTool("u1", "list_claims", {})
    expect(service.listClaims).toHaveBeenCalledWith("u1", {
      status: undefined,
      limit: 20,
    })
  })

  it('list_claims can answer "what\'s due?"', async () => {
    mocked.listClaims.mockResolvedValue([
      { ...view, due: "overdue", dueText: "overdue by 3 days" },
    ])
    const result = await callTool("u1", "list_claims", {
      due: "soon_or_overdue",
      within_days: 14,
    })
    expect(service.listClaims).toHaveBeenCalledWith("u1", {
      status: undefined,
      due: "soon_or_overdue",
      withinDays: 14,
      limit: 20,
    })
    expect(parse(result)[0]).toMatchObject({
      id: "c1",
      due: "overdue by 3 days",
    })
    expect(MCP_INSTRUCTIONS).toMatch(/what is due/)
    expect(
      (await callTool("u1", "list_claims", { due: "eventually" })).isError,
    ).toBe(true)
  })

  it.each([
    ["log_claim", {}],
    ["log_claim", { text: "x", claim_date: "last July" }],
    ["update_confidence", { claim_id: "c1", word: "maybe" }],
    ["update_confidence", { claim_id: "c1", probability: 70 }],
    ["resolve_claim", { claim_id: "c1", resolution: "PROBABLY" }],
    ["list_claims", { limit: 5000 }],
  ])(
    "rejects bad input without touching the app: %s %j",
    async (name, args) => {
      const result = await callTool("u1", name, args)
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/^Invalid input for /)
      Object.values(service).forEach((fn) => expect(fn).not.toHaveBeenCalled())
    },
  )

  it("answer_question needs exactly one of accept, value, skip", async () => {
    for (const args of [
      { claim_id: "c1" },
      { claim_id: "c1", accept: true, skip: true },
    ]) {
      const result = await callTool("u1", "answer_question", args)
      expect(result).toMatchObject({ isError: true })
    }
    expect(service.answerQuestion).not.toHaveBeenCalled()
  })

  it("a broken rule comes back as a readable error, with its reasons", async () => {
    service.answerQuestion.mockRejectedValue(
      makeClaimError("BLOCKED", "This claim can't be made public yet.", [
        "Grade 2, needs 4 or 5 to be public.",
      ]),
    )
    const result = await callTool("u1", "answer_question", {
      claim_id: "c1",
      skip: true,
    })
    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "This claim can't be made public yet.\nGrade 2, needs 4 or 5 to be public.",
        },
      ],
    })
  })

  it("an unknown tool is an error, not a crash", async () => {
    expect(await callTool("u1", "delete_everything", {})).toMatchObject({
      isError: true,
    })
  })
})

describe("summarize", () => {
  it("says 'deadline' once I have confirmed it, and shows a resolution", () => {
    const summary = summarize({
      ...view,
      deadlineKind: "deadline",
      probability: null,
      confidenceWord: null,
      resolved: true,
      result: "wrong",
      closeCall: true,
      actualResult: "5.8",
      nextQuestion: null,
    })
    expect(summary).toMatchObject({
      deadline: "2028-12-31",
      confidence: "not given",
      result: "wrong",
      closeCall: true,
      actualResult: "5.8",
      nextQuestion: null,
    })
    expect(summary).not.toHaveProperty("checkBackBy")
  })
})
