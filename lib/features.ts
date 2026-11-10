/**
 * Switches for the parts of Fatebook this fork does not use.
 *
 * My Mark-to-Market is a personal claim log, so Fatebook's team and
 * community features are switched OFF by default. Nothing was deleted:
 * the code is all still here, and setting a variable to "true" in the
 * environment brings that feature back exactly as upstream built it.
 *
 * When a feature is off:
 *   - its pages and API routes answer "404 not found" (see middleware.ts)
 *   - its links, buttons and panels are hidden
 *
 * This file must not import anything from the app, so that anything
 * (including middleware.ts) can import it.
 *
 * Note: Next.js only passes NEXT_PUBLIC_ variables to the browser when
 * they are written out in full, which is why each one is spelled out
 * rather than built in a loop.
 */

const on = (value: string | undefined) => value === "true"

export const FEATURES = {
  /** Slack bot: /for-slack, slash commands, "Share in Slack" */
  slack: on(process.env.NEXT_PUBLIC_ENABLE_SLACK),
  /** Discord bot: /for-discord and its commands */
  discord: on(process.env.NEXT_PUBLIC_ENABLE_DISCORD),
  /** Browser extension page and the prompts to install it */
  extension: on(process.env.NEXT_PUBLIC_ENABLE_EXTENSION),
  /** Tournaments and "Predict your year" */
  tournaments: on(process.env.NEXT_PUBLIC_ENABLE_TOURNAMENTS),
  /** Teams (user lists) and sharing a question with a team */
  teams: on(process.env.NEXT_PUBLIC_ENABLE_TEAMS),
  /** The feed of everyone's public questions, and site-wide stats */
  publicFeed: on(process.env.NEXT_PUBLIC_ENABLE_PUBLIC_FEED),
  /** Sage's own pages: about, blog, terms, privacy, support, training links */
  sagePages: on(process.env.NEXT_PUBLIC_ENABLE_SAGE_PAGES),
  /** Signing new users up to Sage's mailing list, and the welcome email */
  sageEmails: on(process.env.NEXT_PUBLIC_ENABLE_SAGE_EMAILS),
  /** Google Analytics page tracking */
  analytics: on(process.env.NEXT_PUBLIC_ENABLE_ANALYTICS),
  /** Fatebook's original question form on the home page (the claim box replaces it) */
  classicForm: on(process.env.NEXT_PUBLIC_ENABLE_CLASSIC_FORM),
  /**
   * Fatebook's full daily job: Slack "ready to resolve" messages,
   * forecast-target nudges, stale-forecast reminders and un-hiding hidden
   * forecasts. Off: the daily job only adds "ready to resolve" notes to
   * the notification bell.
   */
  fullDailyJob: on(process.env.NEXT_PUBLIC_ENABLE_FULL_DAILY_JOB),
  /** The "give feedback" box, which posts to Sage's Slack */
  feedback: on(process.env.NEXT_PUBLIC_ENABLE_FEEDBACK),
} as const

export type Feature = keyof typeof FEATURES

/**
 * Which feature owns which addresses. A path belongs to a feature if it
 * equals one of these or sits underneath it ("/team" covers "/team/abc").
 */
export const FEATURE_ROUTES: Record<Feature, readonly string[]> = {
  slack: [
    "/for-slack",
    "/incoming",
    "/api/slash_forecast",
    "/api/slash_forecast_multiple",
    "/api/interactive_endpoint",
    "/api/events_endpoint",
    "/api/auth/install",
    "/api/auth/install_approved",
  ],
  discord: ["/for-discord", "/api/discord"],
  extension: ["/extension"],
  tournaments: ["/tournament", "/predict-your-year"],
  teams: ["/team", "/list", "/collaborators"],
  publicFeed: ["/public", "/global-stats"],
  sagePages: [
    "/about",
    "/blog",
    "/terms",
    "/privacy",
    "/support",
    "/impact-survey",
  ],
  sageEmails: [],
  analytics: [],
  feedback: [],
  classicForm: [],
  fullDailyJob: [],
}

/** Every path prefix that belongs to some feature (used by middleware.ts). */
export const ALL_FEATURE_ROUTES = Object.values(FEATURE_ROUTES).flat()

/** The feature a path belongs to, or null if it is a core page. */
export function featureForPath(pathname: string): Feature | null {
  for (const [feature, routes] of Object.entries(FEATURE_ROUTES)) {
    if (routes.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
      return feature as Feature
    }
  }
  return null
}

/**
 * True if this path belongs to a feature that is switched off.
 * `flags` is only passed in by tests.
 */
export function isPathSwitchedOff(
  pathname: string,
  flags: Record<Feature, boolean> = FEATURES,
): boolean {
  const feature = featureForPath(pathname)
  return feature !== null && !flags[feature]
}
