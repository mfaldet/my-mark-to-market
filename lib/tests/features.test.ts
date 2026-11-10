/**
 * @jest-environment node
 */
import fs from "fs"
import path from "path"
import {
  ALL_FEATURE_ROUTES,
  Feature,
  FEATURES,
  featureForPath,
  isPathSwitchedOff,
} from "../features"

const allOff = Object.fromEntries(
  Object.keys(FEATURES).map((f) => [f, false]),
) as Record<Feature, boolean>

describe("feature switches", () => {
  it("every optional feature is off unless switched on", () => {
    expect(Object.values(FEATURES).every((v) => v === false)).toBe(true)
  })

  it.each([
    ["/for-slack", "slack"],
    ["/api/slash_forecast", "slack"],
    ["/incoming/events_endpoint", "slack"],
    ["/api/discord/interactions", "discord"],
    ["/extension", "extension"],
    ["/tournament/abc", "tournaments"],
    ["/predict-your-year", "tournaments"],
    ["/team/join/xyz", "teams"],
    ["/public", "publicFeed"],
    ["/blog/concrete-benefits-of-making-predictions", "sagePages"],
    ["/privacy", "sagePages"],
  ])("%s belongs to %s", (pathname, feature) => {
    expect(featureForPath(pathname)).toBe(feature)
    expect(isPathSwitchedOff(pathname, allOff)).toBe(true)
    expect(isPathSwitchedOff(pathname, { ...allOff, [feature]: true })).toBe(
      false,
    )
  })

  it.each([
    "/",
    "/q/some-claim--abc123",
    "/api/v0/createQuestion",
    "/api/auth/signin",
    "/api/trpc/question.create",
    "/api-setup",
    "/embed/q/abc",
    "/stats",
    "/import-from-spreadsheet",
    "/tag/macro",
    "/user/me",
    "/publicity", // starts with "/public" but is not under it
    "/teams",
  ])("core path is never switched off: %s", (pathname) => {
    expect(featureForPath(pathname)).toBeNull()
    expect(isPathSwitchedOff(pathname, allOff)).toBe(false)
  })

  it("middleware.ts lists every feature route, so none slips through", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../middleware.ts"),
      "utf8",
    )
    const matcher = source.slice(
      source.indexOf("matcher: ["),
      source.indexOf("]", source.indexOf("matcher: [")),
    )
    const patterns = [...matcher.matchAll(/"([^"]+)"/g)].map((m) =>
      m[1].replace("/:path*", ""),
    )
    for (const route of ALL_FEATURE_ROUTES) {
      expect(
        patterns.some((p) => route === p || route.startsWith(p + "/")),
      ).toBe(true)
    }
  })
})
