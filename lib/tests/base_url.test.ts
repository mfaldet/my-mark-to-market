/**
 * @jest-environment node
 */
import {
  getBaseHost,
  getBaseUrl,
  getEmailFrom,
  getEmailReplyTo,
} from "../base_url"

const KEYS = [
  "NEXT_PUBLIC_BASE_URL",
  "HOST_URL",
  "VERCEL_URL",
  "PORT",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
]

describe("base address", () => {
  const saved = { ...process.env }
  beforeEach(() => KEYS.forEach((k) => delete process.env[k]))
  afterAll(() => {
    process.env = saved
  })

  it("uses NEXT_PUBLIC_BASE_URL, without a trailing slash", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://claims.example.com/"
    process.env.HOST_URL = "https://ignored.example.com"
    expect(getBaseUrl()).toBe("https://claims.example.com")
    expect(getBaseHost()).toBe("claims.example.com")
  })

  it("falls back to HOST_URL, then VERCEL_URL, then localhost", () => {
    process.env.VERCEL_URL = "my-app.vercel.app"
    expect(getBaseUrl()).toBe("https://my-app.vercel.app")
    process.env.HOST_URL = "http://localhost:3000"
    expect(getBaseUrl()).toBe("http://localhost:3000")
    delete process.env.HOST_URL
    delete process.env.VERCEL_URL
    expect(getBaseUrl()).toBe("http://localhost:3000")
    process.env.PORT = "4000"
    expect(getBaseUrl()).toBe("http://localhost:4000")
  })

  it("never points at fatebook.io, even in production", () => {
    const env = process.env as Record<string, string>
    env.NODE_ENV = "production"
    expect(getBaseUrl()).not.toContain("fatebook.io")
    env.NODE_ENV = "test"
  })

  it("builds email addresses from the base address unless overridden", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://claims.example.com"
    expect(getEmailFrom()).toBe("reminders@claims.example.com")
    expect(getEmailReplyTo()).toBe("reminders@claims.example.com")
    process.env.EMAIL_FROM = "me@example.com"
    expect(getEmailFrom()).toBe("me@example.com")
    expect(getEmailReplyTo()).toBe("me@example.com")
    process.env.EMAIL_REPLY_TO = "replies@example.com"
    expect(getEmailReplyTo()).toBe("replies@example.com")
  })
})
