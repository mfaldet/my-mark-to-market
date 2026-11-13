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
    logWithSplit: jest.fn(),
    confirmProposal: jest.fn(),
    editClaim: jest.fn(),
    withdrawClaim: jest.fn(),
    previewClaim: jest.fn(),
    previewWithSplit: jest.fn(),
    setPublic: jest.fn(),
    addNote: jest.fn(),
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
  logWithSplit: mocked.logWithSplit,
  confirmProposal: mocked.confirmProposal,
  editClaim: mocked.editClaim,
  withdrawClaim: mocked.withdrawClaim,
  previewClaim: mocked.previewClaim,
  previewWithSplit: mocked.previewWithSplit,
  setPublic: mocked.setPublic,
  addNote: mocked.addNote,
}

const view = {
  id: "c1",
  url: "http://localhost/q/c1",
  text: "Unemployment will hit 6% by 2028",
  claimDate: "2025-07-14",
  deadline: "2028-12-31",
  deadlineKind: "check back by",
  kind: "prediction",
  grade: 4,
  gradeReason: "Complete and checkable. No confirmed check link.",
  compound: false,
  headline: null,
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
  it("offers exactly these tools", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      "preview_claim",
      "log_claim",
      "confirm_proposal",
      "edit_claim",
      "withdraw_claim",
      "answer_question",
      "update_confidence",
      "link_parent",
      "list_claims",
      "add_note",
      "publish_claim",
      "resolve_claim",
    ])
    for (const tool of TOOLS) {
      expect(tool.inputSchema.type).toBe("object")
      expect(tool.description.length).toBeGreaterThan(40)
    }
  })

  it("tells Claude to preview first, show it all in one reply, and save only what I approve", () => {
    expect(MCP_INSTRUCTIONS).toMatch(/raw words unchanged as text/)
    expect(MCP_INSTRUCTIONS).toMatch(/Clean aggressively, up front/)
    expect(MCP_INSTRUCTIONS).toMatch(/Write a headline/)
    expect(MCP_INSTRUCTIONS).toMatch(/Call preview_claim/)
    expect(MCP_INSTRUCTIONS).toMatch(/It saves NOTHING/)
    expect(MCP_INSTRUCTIONS).toMatch(/In ONE reply/)
    expect(MCP_INSTRUCTIONS).toMatch(/Expect them to steer/)
    expect(MCP_INSTRUCTIONS).toMatch(/Do not ask one field per message/)
    expect(MCP_INSTRUCTIONS).toMatch(/Only when they approve/)
    expect(MCP_INSTRUCTIONS).toMatch(
      /Nothing you wrote or guessed is saved unless they said yes/,
    )
    expect(MCP_INSTRUCTIONS).toMatch(
      /when they first said it, not when they approved it/,
    )
    // the hard rules that stay
    expect(MCP_INSTRUCTIONS).toMatch(/no "if … then"/)
    expect(MCP_INSTRUCTIONS).toMatch(/an event needs a way to tell/)
    // the old rule against using different words from mine is gone
    expect(MCP_INSTRUCTIONS).not.toMatch(/Do not swap in a different measure/)
    expect(MCP_INSTRUCTIONS).not.toMatch(/excerpt/)
    expect(MCP_INSTRUCTIONS).toMatch(/Nothing is ever deleted/)
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
      timeZone: undefined,
      proposal: undefined,
      proposalStatus: "stated",
      confidence: undefined,
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
      timeZone: undefined,
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
      timeZone: undefined,
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
    ["edit_claim", { claim_id: "c1", deadline: "next summer" }],
    ["confirm_proposal", {}],
    ["withdraw_claim", {}],
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

  describe("from the first real use", () => {
    const original =
      "The board won't fire Jensen Huang at NVIDIA, and NVIDIA stock price will still out perform Mag 7 average over 2027, but this Jensen scandal will be a huge WMD (weapon of mass distraction) for the new capitol hill."
    const split = [
      {
        headline: "Jensen Huang is still NVIDIA's CEO at the end of 2027",
        shape: "EVENT_BY_DATE",
        parts: {
          event: "Jensen Huang is still NVIDIA's CEO on Dec 31, 2027",
          howToTell: "NVIDIA's leadership page",
        },
        deadline: "2027-12-31",
      },
      {
        headline: "NVIDIA stock beats the Magnificent 7 average over 2027",
        shape: "A_BEATS_B",
        parts: { a: "NVIDIA", b: "Mag 7 average", metric: "total return" },
        deadline: "2027-12-31",
      },
    ]

    const pieces = [
      { ...view, id: "a" },
      { ...view, id: "b" },
    ]

    it("preview_claim returns how it would be saved, with no ids, and saves nothing", async () => {
      service.previewWithSplit.mockResolvedValue({
        original: { ...view, text: original },
        pieces,
      })
      const result = parse(
        await callTool("u1", "preview_claim", {
          text: original,
          split: split.map((piece, i) => ({
            ...piece,
            confidence: i === 0 ? "very likely" : "toss-up",
          })),
        }),
      )
      expect(service.previewWithSplit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
          text: original,
          source: "AGENT",
          proposalStatus: "extracted",
          split: [
            {
              ...split[0],
              confidence: { word: "VERY_LIKELY", note: undefined },
            },
            { ...split[1], confidence: { word: "TOSS_UP", note: undefined } },
          ],
        }),
      )
      // nothing that saves was called
      for (const name of ["logClaim", "logWithSplit", "confirmProposal"]) {
        expect(service[name]).not.toHaveBeenCalled()
      }
      expect(result.saved).toBe(false)
      expect(result.original).not.toHaveProperty("id")
      expect(result.pieces).toHaveLength(2)
      for (const piece of result.pieces) {
        expect(piece).not.toHaveProperty("id")
        expect(piece).not.toHaveProperty("url")
        expect(piece.saved).toBe(false)
        expect(piece).toHaveProperty("kind")
        expect(piece).toHaveProperty("grade")
      }
      expect(result.next).toMatch(/Nothing has been saved/)
      expect(TOOLS.find((t) => t.name === "preview_claim")?.readOnly).toBe(true)
    })

    it("preview_claim works for a single prediction too", async () => {
      service.previewClaim.mockResolvedValue(view)
      const result = parse(
        await callTool("u1", "preview_claim", {
          text: "Rates get cut this year",
          proposal: split[0],
          confidence: "70%",
        }),
      )
      expect(service.previewClaim).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalStatus: "extracted",
          confidence: { probability: 0.7, note: undefined },
        }),
      )
      expect(result.saved).toBe(false)
      expect(result).not.toHaveProperty("id")
    })

    it("log_claim refuses a proposal the user has not approved, and saves nothing", async () => {
      for (const args of [
        { text: original, split },
        { text: original, split, approved: false },
        { text: "x", proposal: split[0] },
      ]) {
        const result = await callTool("u1", "log_claim", args)
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toMatch(/Nothing was saved/)
        expect(result.content[0].text).toMatch(/preview_claim/)
      }
      expect(service.logClaim).not.toHaveBeenCalled()
      expect(service.logWithSplit).not.toHaveBeenCalled()
    })

    it("after I approve, log_claim saves the approved version as mine, dated when I said it", async () => {
      service.logWithSplit.mockResolvedValue({
        original: { ...view, id: "p", text: original },
        pieces,
      })
      const result = parse(
        await callTool("u1", "log_claim", {
          text: original,
          split: [{ ...split[0], confidence: "80%" }, split[1]],
          approved: true,
          claim_date: "2026-11-10",
          time_zone: "America/Chicago",
        }),
      )
      expect(service.logWithSplit).toHaveBeenCalledWith({
        userId: "u1",
        text: original,
        claimDate: "2026-11-10",
        parentId: undefined,
        source: "AGENT",
        timeZone: "America/Chicago",
        proposal: undefined,
        proposalStatus: "stated",
        confidence: undefined,
        split: [
          { ...split[0], confidence: { probability: 0.8, note: undefined } },
          { ...split[1], confidence: undefined },
        ],
      })
      expect(service.logClaim).not.toHaveBeenCalled()
      expect(result.original.id).toBe("p")
      expect(result.pieces.map((p: any) => p.id)).toEqual(["a", "b"])
    })

    it("a headline is saved only with my approval, and shows in place of my words", async () => {
      const refused = await callTool("u1", "log_claim", {
        text: "jensen stays i reckon",
        headline: "Jensen Huang is still NVIDIA's CEO at the end of 2027",
      })
      expect(refused.isError).toBe(true)
      expect(refused.content[0].text).toMatch(/Nothing was saved/)
      expect(service.logClaim).not.toHaveBeenCalled()

      service.logClaim.mockResolvedValue({
        ...view,
        text: "jensen stays i reckon",
        headline: "Jensen Huang is still NVIDIA's CEO at the end of 2027",
      })
      const saved = parse(
        await callTool("u1", "log_claim", {
          text: "jensen stays i reckon",
          headline: "Jensen Huang is still NVIDIA's CEO at the end of 2027",
          approved: true,
        }),
      )
      expect(service.logClaim).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "jensen stays i reckon",
          headline: "Jensen Huang is still NVIDIA's CEO at the end of 2027",
          proposalStatus: "stated",
        }),
      )
      expect(saved.headline).toBe(
        "Jensen Huang is still NVIDIA's CEO at the end of 2027",
      )
      expect(saved.originallySaid).toBe("jensen stays i reckon")
      expect(saved).not.toHaveProperty("text")
    })

    it("says so when the app's own AI step was asked and added nothing", () => {
      const quiet = summarize(view) as any
      expect(quiet).not.toHaveProperty("appAiStep")
      const failed = summarize({
        ...view,
        aiNote: "The AI returned an error (400): bad schema",
      }) as any
      expect(failed.appAiStep).toBe(
        "added nothing: The AI returned an error (400): bad schema",
      )
    })

    it("an item with no headline is reported with my words, as before", () => {
      const summary = summarize(view) as any
      expect(summary.text).toBe(view.text)
      expect(summary.headline).toBeNull()
    })

    it("edit_claim can add a headline to an older item", async () => {
      await callTool("u1", "edit_claim", {
        claim_id: "c1",
        headline: "US unemployment reaches 6% by the end of 2028",
      })
      expect(service.editClaim).toHaveBeenLastCalledWith(
        "u1",
        "c1",
        expect.objectContaining({
          headline: "US unemployment reaches 6% by the end of 2028",
        }),
        "AGENT",
      )
    })

    it("a split piece needs a headline", async () => {
      const result = await callTool("u1", "preview_claim", {
        text: original,
        split: [{ shape: "EVENT_BY_DATE", parts: { event: "x" } }],
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/headline/)
    })

    it("my words alone can still be logged as a plain hunch, with no approval step", async () => {
      await callTool("u1", "log_claim", {
        text: "The labor market is weakening",
      })
      expect(service.logClaim).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "The labor market is weakening",
          proposal: undefined,
        }),
      )
    })

    it("one confirm_proposal call carries my corrections and my confidence", async () => {
      await callTool("u1", "confirm_proposal", {
        claim_id: "b",
        edit: { parts: { metric: "price return" } },
        confidence: "70%",
      })
      expect(service.confirmProposal).toHaveBeenCalledWith(
        "u1",
        "b",
        {
          edit: { parts: { metric: "price return" } },
          confidence: { probability: 0.7, note: undefined },
        },
        "AGENT",
      )
    })

    it.each([
      ["30%", { probability: 0.3 }],
      ["0.3", { probability: 0.3 }],
      [0.3, { probability: 0.3 }],
      ["likely", { word: "LIKELY" }],
      ["toss up", { word: "TOSS_UP" }],
      ["probably", { word: "LIKELY" }],
    ])("update_confidence accepts %j", async (confidence, expected) => {
      await callTool("u1", "update_confidence", { claim_id: "c1", confidence })
      expect(service.updateConfidence).toHaveBeenCalledWith(
        "u1",
        "c1",
        { ...expected, note: undefined },
        "AGENT",
      )
    })

    it.each(["3", 3, "70", "maybe"])(
      "update_confidence does not guess at %j: it says to ask me",
      async (confidence) => {
        const result = await callTool("u1", "update_confidence", {
          claim_id: "c1",
          confidence,
        })
        expect(result.isError).toBe(true)
        expect(service.updateConfidence).not.toHaveBeenCalled()
        if (confidence !== "maybe") {
          expect(result.content[0].text).toMatch(/Ask the user what they mean/)
        }
      },
    )

    it("edit_claim changes parts and dates; my text only when I correct it", async () => {
      await callTool("u1", "edit_claim", {
        claim_id: "c1",
        parts: { event: "NVIDIA beats the Mag 7 average" },
        deadline: "2027-12-31",
      })
      expect(service.editClaim).toHaveBeenLastCalledWith(
        "u1",
        "c1",
        {
          shape: undefined,
          parts: { event: "NVIDIA beats the Mag 7 average" },
          deadline: "2027-12-31",
          headline: undefined,
          correctedText: undefined,
        },
        "AGENT",
      )
      await callTool("u1", "edit_claim", {
        claim_id: "c1",
        corrected_text: "outperform, not out perform",
      })
      expect(service.editClaim.mock.calls[1][2].correctedText).toBe(
        "outperform, not out perform",
      )
      expect(
        (await callTool("u1", "edit_claim", { claim_id: "c1" })).isError,
      ).toBe(true)
    })

    it("withdraw_claim withdraws; there is no tool that deletes", async () => {
      service.withdrawClaim.mockResolvedValue({ ...view, withdrawn: true })
      const result = parse(
        await callTool("u1", "withdraw_claim", { claim_id: "c1" }),
      )
      expect(service.withdrawClaim).toHaveBeenCalledWith("u1", "c1", "AGENT")
      expect(result.withdrawn).toBe(true)
      expect(TOOLS.map((t) => t.name).join(" ")).not.toMatch(/delete/)
    })

    it("a needed split is passed on to Claude; there is no flag for different wording", () => {
      const summary = summarize({ ...view, compound: true }) as any
      expect(summary.split).toMatch(/more than one prediction/)
      expect(summary).not.toHaveProperty("flags")
      expect(MCP_INSTRUCTIONS).not.toMatch(/flag/i)
      expect(MCP_INSTRUCTIONS).not.toMatch(/S&P 500/)
    })
  })

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

  describe("publish_claim", () => {
    it("is described as explicit-request-only, in the tool and in the instructions", () => {
      const tool = TOOLS.find((t) => t.name === "publish_claim")!
      expect(tool.description).toMatch(/ONLY when the user explicitly asks/)
      expect(tool.description).toMatch(/Never on your own initiative/)
      expect(tool.inputSchema.required).toEqual(["claim_id", "publish"])
      expect(MCP_INSTRUCTIONS).toMatch(
        /call publish_claim ONLY when the user asks, in so many words/,
      )
      expect(MCP_INSTRUCTIONS).toMatch(/Never on your own initiative/)
    })

    it("publishes and unpublishes through the same rule as the app", async () => {
      service.setPublic.mockResolvedValue({ ...view, sharedPublicly: true })
      const on = parse(
        await callTool("u1", "publish_claim", {
          claim_id: "c1",
          publish: true,
        }),
      )
      expect(service.setPublic).toHaveBeenLastCalledWith(
        "u1",
        "c1",
        true,
        "AGENT",
      )
      expect(on.public).toBe(true)
      await callTool("u1", "publish_claim", { claim_id: "c1", publish: false })
      expect(service.setPublic).toHaveBeenLastCalledWith(
        "u1",
        "c1",
        false,
        "AGENT",
      )
    })

    it("needs to be told which way, and passes on a refusal in plain words", async () => {
      const missing = await callTool("u1", "publish_claim", { claim_id: "c1" })
      expect(missing.isError).toBe(true)
      service.setPublic.mockRejectedValue(
        makeClaimError("BLOCKED", "This can't be published yet.", [
          "Not checkable yet (grade 2). Only a checkable prediction, grade 4 or 5, can be published. Missing a deadline.",
        ]),
      )
      const refused = await callTool("u1", "publish_claim", {
        claim_id: "c1",
        publish: true,
      })
      expect(refused.isError).toBe(true)
      expect(refused.content[0].text).toBe(
        "This can't be published yet.\nNot checkable yet (grade 2). Only a checkable prediction, grade 4 or 5, can be published. Missing a deadline.",
      )
    })
  })

  it("the instructions use one word, and say what checkable means", () => {
    expect(MCP_INSTRUCTIONS).toMatch(/everything the user logs is a prediction/)
    expect(MCP_INSTRUCTIONS).toMatch(/Grades 4 and 5 are checkable/)
    expect(MCP_INSTRUCTIONS).toMatch(/private until the user publishes it/)
    // "hunch" appears only to explain the unchanged field value
    expect(MCP_INSTRUCTIONS.match(/hunch/g)).toHaveLength(2)
    for (const tool of TOOLS) {
      expect(`${tool.title} ${tool.description}`).not.toMatch(/hunch/i)
    }
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

  describe("stories and notes", () => {
    it("tells Claude to suggest a story in every preview, preferring existing ones, saved only with approval", () => {
      expect(MCP_INSTRUCTIONS).toMatch(/Suggest a story in every preview/)
      expect(MCP_INSTRUCTIONS).toMatch(/prefer one they already have/)
      expect(MCP_INSTRUCTIONS).toMatch(/saved only with their approval/)
      for (const name of ["preview_claim", "log_claim", "edit_claim"]) {
        const tool = TOOLS.find((t) => t.name === name)!
        expect(Object.keys(tool.inputSchema.properties)).toContain("story")
      }
    })

    it("a story is passed to the preview, and saved by log_claim only with approval", async () => {
      await callTool("u1", "preview_claim", {
        text: "Unemployment will hit 6% by 2028",
        story: "Labor market",
      })
      expect(service.previewClaim).toHaveBeenCalledWith(
        expect.objectContaining({ story: "Labor market" }),
      )
      const refused = await callTool("u1", "log_claim", {
        text: "Unemployment will hit 6% by 2028",
        story: "Labor market",
      })
      expect(refused.isError).toBe(true)
      expect(service.logClaim).not.toHaveBeenCalled()
      await callTool("u1", "log_claim", {
        text: "Unemployment will hit 6% by 2028",
        story: "Labor market",
        approved: true,
      })
      expect(service.logClaim).toHaveBeenCalledWith(
        expect.objectContaining({ story: "Labor market" }),
      )
    })

    it("replies and list_claims include each prediction's story", async () => {
      service.listClaims.mockResolvedValue([
        { ...view, story: { id: "s1", name: "Labor market" } },
      ])
      const listed = parse(await callTool("u1", "list_claims", {}))
      expect(JSON.stringify(listed)).toContain('"story":"Labor market"')
      expect(summarize(view).story).toBeNull()
    })

    it("add_note is private unless public is true, and says so to Claude", async () => {
      const tool = TOOLS.find((t) => t.name === "add_note")!
      expect(tool.description).toMatch(/PRIVATE by default/)
      expect(tool.description).toMatch(/in so many words/)
      service.addNote.mockResolvedValue({
        ...view,
        notes: [{ text: "why", link: null, isPublic: false }],
      })
      await callTool("u1", "add_note", { claim_id: "c1", text: "why" })
      expect(service.addNote).toHaveBeenLastCalledWith(
        "u1",
        "c1",
        { text: "why", link: undefined, isPublic: false },
        "AGENT",
      )
      await callTool("u1", "add_note", {
        claim_id: "c1",
        text: "why",
        link: "https://example.com",
        public: true,
      })
      expect(service.addNote).toHaveBeenLastCalledWith(
        "u1",
        "c1",
        { text: "why", link: "https://example.com", isPublic: true },
        "AGENT",
      )
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
