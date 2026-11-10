import type { NextFetchEvent, NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { signingSecret } from "./lib/_constants"
import { validateSlackRequest } from "./lib/_validate"
import { verifyDiscordRequest } from "./lib/discord/utils"
import { getBaseHost, getBaseUrl } from "./lib/base_url"
import { isPathSwitchedOff } from "./lib/features"

const redirectUrl: string = "/api/success_response"
const dateInvalidRedirectUrl: string = "/api/failed_validation"
const urlInvalidRedirectUrl: string = "/api/failed_url_verification"
const slackInvalidRedirectUrl: string = "/api/failed_slack_verification"

// eslint-disable-next-line @typescript-eslint/naming-convention
enum ValidationRedirect {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  InvalidDate = 1,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  InvalidURL,
}

// the paths upstream's middleware handled before the feature switches
const UPSTREAM_MATCHER = [
  "/incoming/slash_forecast",
  "/incoming/slash_forecast_multiple",
  "/incoming/interactive_endpoint",
  "/incoming/events_endpoint",
  "/api/discord/interactions",
  "/for-slack",
]

export const config = {
  matcher: [
    "/incoming/slash_forecast",
    "/incoming/slash_forecast_multiple",
    "/incoming/interactive_endpoint",
    "/incoming/events_endpoint",

    "/api/discord/interactions",

    "/for-slack",

    // Pages and API routes that belong to a switch-off feature
    // (lib/features.ts). Next.js needs this list written out literally;
    // a test checks it matches FEATURE_ROUTES.
    "/incoming/:path*",
    "/api/slash_forecast",
    "/api/slash_forecast_multiple",
    "/api/interactive_endpoint",
    "/api/events_endpoint",
    "/api/auth/install",
    "/api/auth/install_approved",
    "/for-discord",
    "/api/discord/:path*",
    "/extension",
    "/tournament/:path*",
    "/predict-your-year/:path*",
    "/team/:path*",
    "/list/:path*",
    "/collaborators",
    "/public",
    "/global-stats",
    "/about",
    "/blog/:path*",
    "/terms",
    "/privacy",
    "/support",
    "/impact-survey",
  ],
  api: {
    bodyParser: false,
  },
}

function reparsePayload(bufferBody: ArrayBuffer) {
  var enc = new TextDecoder("utf-8")
  const bodyParams = new URLSearchParams(enc.decode(bufferBody))
  return Object.fromEntries(bodyParams)
}

export default async function middleware(
  req: NextRequest,
  context: NextFetchEvent,
) {
  // A feature that is switched off answers "not found", page or API.
  const { pathname } = req.nextUrl
  if (isPathSwitchedOff(pathname)) {
    return pathname.startsWith("/api/") || pathname.startsWith("/incoming/")
      ? NextResponse.json({ error: "Not found" }, { status: 404 })
      : NextResponse.rewrite(new URL("/404", req.url), { status: 404 })
  }
  // Everything below is upstream's Slack and Discord request checking,
  // which only applies to the paths it originally matched.
  if (!UPSTREAM_MATCHER.some((p) => pathname === p)) {
    return NextResponse.next()
  }

  const bufferBody = await req.arrayBuffer()

  if (req.url.includes("for-slack")) {
    if (!req.url.includes(getBaseHost()) && req.url.includes("installedTo")) {
      const parsedUrl = new URL(req.url)
      return NextResponse.redirect(
        new URL(`${getBaseUrl()}${parsedUrl.pathname}${parsedUrl.search}`),
      )
    } else {
      return NextResponse.next()
    }
  }

  if (req.url.includes("api/discord/")) {
    console.log("Validating Discord request: ", bufferBody)
    const isValid = await verifyDiscordRequest(req, bufferBody)
    if (!isValid) {
      console.log("Validation failed")
      return NextResponse.redirect(new URL(slackInvalidRedirectUrl, req.url)) // todo make a discord invalid redirect
    }

    console.log("Validation passed")
    return NextResponse.next()
  }

  const validationPassed = await validateSlackRequest(
    req,
    signingSecret,
    Buffer.from(bufferBody).toString("utf8"),
  )
  if (!validationPassed) {
    return NextResponse.redirect(new URL(slackInvalidRedirectUrl, req.url))
  }

  const path = req.url
  const asyncFetchPath = path!.replace("/incoming", "/api")

  const body = reparsePayload(bufferBody)

  const specialCaseHandled = checkSpecialCases(body)
  if (!specialCaseHandled) {
    context.waitUntil(
      fetch(asyncFetchPath, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    )

    // wait for 800ms so the Slack loading spinner displays for the user
    // (because we expect our functions to take >= 800ms to run)
    await new Promise((resolve) => setTimeout(resolve, 800))

    // redirect to success response
    return NextResponse.redirect(new URL(redirectUrl, req.url))
  } else {
    switch (specialCaseHandled) {
      case ValidationRedirect.InvalidDate:
        return NextResponse.redirect(new URL(dateInvalidRedirectUrl, req.url))
      case ValidationRedirect.InvalidURL:
        return NextResponse.redirect(new URL(urlInvalidRedirectUrl, req.url))
    }
  }
}

// Returns true iff the request was handled by this function
function checkSpecialCases(body: any) {
  if (!body.payload) {
    return null
  }
  const payload = JSON.parse(body.payload)
  if (!payload.type) {
    return null
  }

  switch (payload.type) {
    case "view_submission":
      if (
        payload.view.callback_id.startsWith("question_modal") &&
        !dateValid(payload)
      ) {
        console.log("date is invalid, redirecting to failed validation")
        return ValidationRedirect.InvalidDate
      }
      break

    case "url_verification":
      console.log("Handling url_verification for events API. ", payload)
      return ValidationRedirect.InvalidURL
  }

  return null
}

function dateValid(payload: any) {
  const callbackActionId = payload.view.callback_id.substring(
    "question_modal".length,
  )
  const actionParts = JSON.parse(callbackActionId) as any

  const actionId = '{"action":"updateResolutionDate"}'
  const blockObj: any = Object.values(payload.view.state.values as any).find(
    (v: any) => v[actionId] !== undefined,
  )
  const resolutionDate = blockObj[actionId]?.selected_date

  if (
    actionParts.isCreating &&
    resolutionDate &&
    // if the resolution date is in the past, it's invalid
    // (we allow the user to set the resolution date to now -  24h, to allow for timezones)
    new Date(resolutionDate) <
      new Date(new Date().getTime() - 1000 * 60 * 60 * 24 * 2)
  ) {
    return false
  } else {
    return true
  }
}
