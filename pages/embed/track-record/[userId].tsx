/**
 * The embeddable public track record: /embed/track-record/<userId>
 *
 * A plain page with no menu, made to sit in an <iframe> on another site.
 * It shows only claims the owner has shared publicly.
 */
import clsx from "clsx"
import { GetServerSideProps } from "next"
import { NextSeo } from "next-seo"
import React from "react"
import { GradeBadge } from "../../../components/claims/GradeBadge"
import { formatDay } from "../../../components/claims/labels"
import { APP_NAME, UPSTREAM } from "../../../lib/app_name"
import { BRIER_LINE } from "../../../lib/claims/words"
import {
  loadPublicRecord,
  PublicRecord,
} from "../../../lib/claims/public_record"

export const getServerSideProps: GetServerSideProps<{
  record: PublicRecord
}> = async ({ params, res }) => {
  const record = await loadPublicRecord(String(params?.userId))
  if (!record) return { notFound: true }
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=600",
  )
  return { props: { record } }
}

const percent = (n: number | null) =>
  n === null ? "–" : `${Math.round(n * 100)}%`

const STATUS_STYLES: Record<string, string> = {
  open: "bg-neutral-100 text-neutral-600",
  right: "bg-green-100 text-green-800",
  wrong: "bg-red-100 text-red-800",
  "can't tell": "bg-neutral-200 text-neutral-700",
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-4 py-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  )
}

export default function TrackRecordEmbed({ record }: { record: PublicRecord }) {
  const { summary } = record
  const bands = record.calibration.filter((b) => b.predictions > 0)

  return (
    <div className="bg-neutral-50 min-h-screen p-4 sm:p-6 text-neutral-900">
      <NextSeo
        title={`${record.owner.name ?? "Track record"}: public predictions`}
        noindex={true}
      />
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">
            {record.owner.name ? `${record.owner.name}'s` : "Public"} track
            record
          </h1>
          <p className="text-sm text-neutral-500">
            Predictions logged in advance, each with a deadline and a stated
            outcome, then marked right or wrong. Only predictions made public
            are shown.
          </p>
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="public predictions" value={summary.publicPredictions} />
          <Stat label="resolved" value={summary.resolved} />
          <Stat
            label={`right out of ${summary.right + summary.wrong} settled`}
            value={percent(summary.accuracy)}
          />
          <Stat
            label={`Brier score: ${BRIER_LINE}`}
            value={summary.brierScore ?? "–"}
          />
        </section>

        {bands.length > 0 && (
          <section>
            <h2 className="font-semibold mb-2">Calibration</h2>
            <p className="text-xs text-neutral-500 mb-2">
              Of the predictions given each level of confidence, how many came
              true. Well calibrated means the mark lands inside the shaded
              range.
            </p>
            <div className="flex flex-col gap-1.5">
              {bands.map((band) => (
                <div
                  key={band.band}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-36 shrink-0 text-neutral-600">
                    {band.band}
                  </span>
                  <div className="relative h-4 grow rounded bg-neutral-200">
                    <div
                      className="absolute inset-y-0 bg-indigo-100"
                      style={{
                        left: `${band.low}%`,
                        width: `${band.high - band.low}%`,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 w-1 bg-indigo-600"
                      style={{ left: `calc(${(band.rate ?? 0) * 100}% - 2px)` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-neutral-600">
                    {band.cameTrue} of {band.predictions} ({percent(band.rate)})
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-semibold mb-2">Predictions</h2>
          {record.predictions.length === 0 && (
            <p className="text-sm text-neutral-500">
              No predictions have been made public yet.
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {record.predictions.map((claim) => (
              <li
                key={claim.id}
                className="rounded-md border border-neutral-200 bg-white p-4 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">“{claim.text}”</span>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
                      STATUS_STYLES[claim.status],
                    )}
                  >
                    {claim.status}
                    {claim.closeCall && " · close call"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                  {claim.grade && <GradeBadge grade={claim.grade} />}
                  {claim.imported && (
                    <span
                      className="rounded border border-neutral-300 px-1"
                      title="Brought in by an importer, not logged here in advance"
                    >
                      imported
                    </span>
                  )}
                  <span>
                    Said {formatDay(claim.claimDate)}
                    {claim.backDated && " (back-dated)"}
                  </span>
                  <span>Due {formatDay(claim.deadline)}</span>
                  <span>
                    Confidence{" "}
                    {claim.confidence
                      ? percent(claim.confidence.probability)
                      : "not given"}
                    {claim.confidenceHistory.length > 1 &&
                      ` (${claim.confidenceHistory.length} updates)`}
                  </span>
                  {claim.enteredVia && (
                    <span>
                      Logged via{" "}
                      {claim.enteredVia === "api" ? "API" : claim.enteredVia}
                    </span>
                  )}
                  {claim.actualResult && (
                    <span>Actual: {claim.actualResult}</span>
                  )}
                  {claim.checkLink && (
                    <a
                      className="underline"
                      href={claim.checkLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Check it
                    </a>
                  )}
                </div>
                {claim.history.latestHash && (
                  <div
                    className="text-[10px] text-neutral-400 font-mono"
                    title="Hash of the latest entry in this prediction's append-only history"
                  >
                    {claim.history.versions} version
                    {claim.history.versions === 1 ? "" : "s"} ·{" "}
                    {claim.history.latestHash.slice(0, 16)}…
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <footer className="text-xs text-neutral-400">
          <a href={record.app.url} target="_blank" rel="noreferrer">
            {APP_NAME}
          </a>
          {" · Built on "}
          <a href={UPSTREAM.url} target="_blank" rel="noreferrer">
            {UPSTREAM.name}
          </a>
          {` by ${UPSTREAM.author}`}
        </footer>
      </div>
    </div>
  )
}

// Strips away the header and footer, like Fatebook's other embed pages
TrackRecordEmbed.getLayout = function getLayout(page: React.ReactElement) {
  return page
}
