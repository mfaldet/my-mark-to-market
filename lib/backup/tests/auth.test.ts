/**
 * @jest-environment node
 */
import { isAuthorizedBackup } from "../auth"

describe("backup export sign-in", () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it("accepts the backup token as a Bearer header", () => {
    process.env.BACKUP_TOKEN = "backup-token-value"
    expect(
      isAuthorizedBackup({ authorization: "Bearer backup-token-value" }),
    ).toBe(true)
  })

  it.each([
    ["no header", {}],
    ["the wrong token", { authorization: "Bearer wrong" }],
    ["the token without Bearer", { authorization: "backup-token-value" }],
    [
      "a longer value that starts correctly",
      { authorization: "Bearer backup-token-value-and-more" },
    ],
  ])("refuses %s", (_name, headers) => {
    process.env.BACKUP_TOKEN = "backup-token-value"
    expect(isAuthorizedBackup(headers)).toBe(false)
  })

  it("refuses everyone when BACKUP_TOKEN is not set, even an empty Bearer", () => {
    delete process.env.BACKUP_TOKEN
    expect(isAuthorizedBackup({})).toBe(false)
    expect(isAuthorizedBackup({ authorization: "Bearer " })).toBe(false)
    expect(isAuthorizedBackup({ authorization: "Bearer undefined" })).toBe(
      false,
    )
    process.env.BACKUP_TOKEN = ""
    expect(isAuthorizedBackup({ authorization: "Bearer " })).toBe(false)
  })

  it("the cron secret and the backup token do not open each other's door", () => {
    process.env.BACKUP_TOKEN = "backup-token-value"
    process.env.CRON_SECRET = "cron-secret-value"
    expect(
      isAuthorizedBackup({ authorization: "Bearer cron-secret-value" }),
    ).toBe(false)
  })
})
