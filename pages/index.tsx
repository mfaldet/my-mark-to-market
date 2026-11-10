import { useSession } from "next-auth/react"
import { Questions } from "../components/Questions"
import { Tournaments } from "../components/Tournaments"
import { TrackRecord } from "../components/TrackRecord"
import { UserLists } from "../components/UserLists"
import { HowItWorks, SignedOutIntro } from "../components/claims/HowItWorks"
import { LogClaim } from "../components/claims/LogClaim"
import { PublicRecordLinks } from "../components/claims/PublicRecordLinks"
import { Predict } from "../components/predict-form/Predict"
import { QuickFeedback } from "../components/ui/QuickFeedback"
import { useUserId } from "../lib/web/utils"
import { PredictProvider } from "../components/predict-form/PredictProvider"
import { FEATURES } from "../lib/features"

export default function HomePage() {
  const { status: sessionStatus } = useSession()
  const userId = useUserId()

  return (
    <div className="max-md:flex-col gap-8 lg:gap-12 flex justify-center px-4 lg:pt-4 mx-auto max-w-6xl">
      <PredictProvider>
        <div className="prose mx-auto pt-12 w-full min-w-0 lg:w-[650px]">
          {!userId && sessionStatus !== "loading" && (
            <>
              <h3 className="text-neutral-600">
                Log a hunch. Sharpen it into a prediction. See how it turns out.
              </h3>
            </>
          )}

          <LogClaim />
          {FEATURES.classicForm && <Predict />}
          <Questions />

          {sessionStatus !== "loading" && !userId && <SignedOutIntro />}
        </div>
        <Sidebar />
      </PredictProvider>
    </div>
  )
}

function Sidebar() {
  const userId = useUserId()

  // NB: hidden on mobile, stats.tsx is shown instead
  return (
    <div className="max-md:hidden flex flex-col gap-12 max-w-[400px]">
      <div className="min-h-28 pt-16">{userId && <HowItWorks />}</div>
      <div className="max-w-[320px] flex flex-col gap-12 ml-auto lg:w-[320px]">
        {userId && <TrackRecord trackRecordUserId={userId} />}
        {userId && <PublicRecordLinks userId={userId} />}
        {userId && FEATURES.tournaments && <Tournaments />}
        {userId && FEATURES.teams && <UserLists />}
        {userId && FEATURES.feedback && (
          <QuickFeedback
            type="Fatebook feedback"
            placeholder="Give feedback on Fatebook..."
            style="textarea"
          />
        )}
      </div>
    </div>
  )
}
