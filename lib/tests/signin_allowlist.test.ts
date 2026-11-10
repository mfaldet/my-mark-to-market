import { isAllowedToSignIn } from "../signin_allowlist"

describe("sign-in allow-list", () => {
  const saved = process.env.ALLOWED_SIGNIN_EMAILS
  afterEach(() => {
    if (saved === undefined) delete process.env.ALLOWED_SIGNIN_EMAILS
    else process.env.ALLOWED_SIGNIN_EMAILS = saved
  })

  it("with no list set, sign-in is open", () => {
    delete process.env.ALLOWED_SIGNIN_EMAILS
    expect(isAllowedToSignIn("anyone@example.com")).toBe(true)
    process.env.ALLOWED_SIGNIN_EMAILS = "  "
    expect(isAllowedToSignIn("anyone@example.com")).toBe(true)
  })

  it("with a list set, only those addresses get in", () => {
    process.env.ALLOWED_SIGNIN_EMAILS = "owner@example.com"
    expect(isAllowedToSignIn("owner@example.com")).toBe(true)
    expect(isAllowedToSignIn("someone.else@example.com")).toBe(false)
    expect(isAllowedToSignIn("owner@example.com.evil.test")).toBe(false)
    expect(isAllowedToSignIn(null)).toBe(false)
    expect(isAllowedToSignIn(undefined)).toBe(false)
    expect(isAllowedToSignIn("")).toBe(false)
  })

  it("ignores case and stray spaces, and takes several addresses", () => {
    process.env.ALLOWED_SIGNIN_EMAILS =
      " Owner@Example.com , second@example.com,"
    expect(isAllowedToSignIn("owner@example.COM ")).toBe(true)
    expect(isAllowedToSignIn("second@example.com")).toBe(true)
    expect(isAllowedToSignIn("third@example.com")).toBe(false)
  })
})
