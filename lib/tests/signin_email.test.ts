import { signInEmailContent } from "../signin_email"

describe("the sign-in email", () => {
  it("uses this app's name and carries the link", () => {
    const { subject, text, html } = signInEmailContent("https://x.test/link")
    expect(subject).toBe("Sign in to My Mark-to-Market")
    expect(text).toContain("https://x.test/link")
    expect(html).toContain('href="https://x.test/link"')
    expect(subject + text + html).not.toMatch(/fatebook/i)
  })
})
