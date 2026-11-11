import { emailSignInConfigured, signInEmailContent } from "../signin_email"

describe("the sign-in email", () => {
  it("uses this app's name and carries the link", () => {
    const { subject, text, html } = signInEmailContent("https://x.test/link")
    expect(subject).toBe("Sign in to My Mark-to-Market")
    expect(text).toContain("https://x.test/link")
    expect(html).toContain('href="https://x.test/link"')
    expect(subject + text + html).not.toMatch(/fatebook/i)
  })
})

describe("whether email sign-in is offered", () => {
  it("is off with no mail server, as in production", () => {
    expect(emailSignInConfigured({})).toBe(false)
    expect(emailSignInConfigured({ AUTH_EMAIL_SERVER: "" })).toBe(false)
    expect(emailSignInConfigured({ AUTH_EMAIL_SERVER: "  " })).toBe(false)
  })
  it("is on only when a mail server is set", () => {
    expect(
      emailSignInConfigured({ AUTH_EMAIL_SERVER: "smtp://localhost:1025" }),
    ).toBe(true)
  })
})
