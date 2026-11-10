/**
 * @jest-environment node
 */
import { isAuthorizedCron } from "../cron_auth"

describe("scheduled-job sign-in", () => {
  const saved = process.env.CRON_SECRET
  afterEach(() => {
    if (saved === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = saved
  })

  it("accepts Vercel's header when it carries the secret", () => {
    process.env.CRON_SECRET = "s3cret-value"
    expect(isAuthorizedCron({ authorization: "Bearer s3cret-value" })).toBe(
      true,
    )
  })

  it.each([
    ["no header", {}],
    ["the wrong secret", { authorization: "Bearer wrong-value!" }],
    ["the secret without Bearer", { authorization: "s3cret-value" }],
    [
      "a longer value that starts correctly",
      { authorization: "Bearer s3cret-value-and-more" },
    ],
    ["an empty header", { authorization: "" }],
  ])("rejects %s", (_name, headers) => {
    process.env.CRON_SECRET = "s3cret-value"
    expect(isAuthorizedCron(headers)).toBe(false)
  })

  it("with no secret set, nobody gets in - not even an empty request", () => {
    delete process.env.CRON_SECRET
    expect(isAuthorizedCron({})).toBe(false)
    expect(isAuthorizedCron({ authorization: "Bearer " })).toBe(false)
    expect(isAuthorizedCron({ authorization: "Bearer undefined" })).toBe(false)
    process.env.CRON_SECRET = ""
    expect(isAuthorizedCron({ authorization: "Bearer " })).toBe(false)
  })
})
