import {
  BellIcon,
  ChartBarIcon,
  ClockIcon,
  HomeIcon,
} from "@heroicons/react/24/solid"
import clsx from "clsx"
import { useRouter } from "next/router"
import { ReactNode } from "react"
import { useUserId } from "../lib/web/utils"
import Footer from "./Footer"
import { Navbar } from "./Navbar"

export function Layout({
  children,
  showForSlackButton = true,
  showCreateAccountButton = true,
  showNavbar = true,
}: {
  children: ReactNode
  showForSlackButton?: boolean
  showNavbar?: boolean
  showCreateAccountButton?: boolean
}) {
  const main = <main className="bg-white grow pb-8 lg:pb-12">{children}</main>
  return (
    <>
      <div className="flex flex-col min-h-screen ">
        {showNavbar && (
          <Navbar
            showForSlackButton={showForSlackButton}
            showCreateAccountButton={showCreateAccountButton}
          >
            {main}
          </Navbar>
        )}

        {!showNavbar && main}

        <BottomNav />
        {/* One footer, on every screen size. The padding on small screens
            keeps it clear of the bottom bar. */}
        <div className="max-lg:pb-16">
          <Footer />
        </div>
      </div>
    </>
  )
}

function BottomNav() {
  const router = useRouter()
  const userId = useUserId()

  // only show when logged in
  if (!userId) return <></>

  return (
    <nav
      aria-label="Main"
      className="btm-nav glass !border-x-0 !border-b-0 z-[500] lg:hidden"
    >
      {[
        { path: "/", title: "Home", icon: <HomeIcon width={24} /> },
        { path: "/due", title: "Due", icon: <ClockIcon width={24} /> },
        {
          path: "/stats",
          title: "Track record",
          icon: <ChartBarIcon width={24} />,
        },
        {
          path: "/notifications",
          title: "Notifications",
          icon: <BellIcon width={24} />,
        },
      ].map(({ path, icon, title }) => (
        <button
          key={title}
          aria-label={title}
          title={title}
          aria-current={router.pathname === path ? "page" : undefined}
          className={clsx(
            "bg-transparent",
            router.pathname === path
              ? "active text-ink !border-ink"
              : "text-neutral-400",
          )}
          onClick={() => void router.push(path)}
        >
          {icon}
        </button>
      ))}
    </nav>
  )
}
