/**
 * @jest-environment node
 */
jest.mock("../prisma", () => ({ __esModule: true, default: {} }))

import {
  API_KEY_PREFIX,
  apiKeyFromHeaders,
  generateApiKey,
  hashApiKey,
  lastFour,
  resolveApiKey,
} from "../api_keys"

describe("API keys", () => {
  it("generates long, unique, URL-safe keys", () => {
    const keys = Array.from({ length: 200 }, generateApiKey)
    expect(new Set(keys).size).toBe(200)
    for (const key of keys) {
      // 32 random bytes = 43 base64url characters
      expect(key).toMatch(new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{43}$`))
    }
  })

  it("hashes with SHA-256, the same way the migration does in Postgres", () => {
    // echo -n legacyplainkey1234 | sha256sum
    expect(hashApiKey("legacyplainkey1234")).toMatch(
      /^481ce85a4f16[0-9a-f]{52}$/,
    )
    expect(hashApiKey("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })

  it("the hash does not contain the key", () => {
    const key = generateApiKey()
    expect(hashApiKey(key)).not.toContain(key.slice(API_KEY_PREFIX.length, 12))
    expect(hashApiKey(key)).toHaveLength(64)
  })

  it("keeps only the last four characters for display", () => {
    expect(lastFour("mtm_abcdefgh1234")).toBe("1234")
  })

  it("reads the key from an Authorization: Bearer header", () => {
    expect(apiKeyFromHeaders({ authorization: "Bearer mtm_abc" })).toBe(
      "mtm_abc",
    )
    expect(apiKeyFromHeaders({ authorization: "bearer   mtm_abc " })).toBe(
      "mtm_abc",
    )
  })

  it("reads the key from an X-Api-Key header", () => {
    expect(apiKeyFromHeaders({ "x-api-key": "mtm_abc" })).toBe("mtm_abc")
    expect(apiKeyFromHeaders({ "x-api-key": ["mtm_abc", "other"] })).toBe(
      "mtm_abc",
    )
  })

  it("ignores other kinds of Authorization header and missing headers", () => {
    expect(apiKeyFromHeaders({ authorization: "Basic dXNlcjpwYXNz" })).toBe(
      undefined,
    )
    expect(apiKeyFromHeaders({})).toBe(undefined)
    expect(apiKeyFromHeaders({ "x-api-key": "  " })).toBe(undefined)
  })

  it("the old style (key in URL or body) still works and wins over a header", () => {
    expect(
      resolveApiKey("from-url", { authorization: "Bearer from-header" }),
    ).toBe("from-url")
    expect(
      resolveApiKey(undefined, { authorization: "Bearer from-header" }),
    ).toBe("from-header")
    expect(resolveApiKey("", {})).toBe(undefined)
  })
})
