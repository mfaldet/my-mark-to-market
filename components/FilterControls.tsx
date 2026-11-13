import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/20/solid"
import { CheckCircleIcon } from "@heroicons/react/24/outline"
import { FunnelIcon } from "@heroicons/react/24/solid"
import clsx from "clsx"
import { AnimatePresence, motion } from "framer-motion"
import { ReactElement, ReactNode, useEffect, useState } from "react"
import { ExtraFilters } from "../lib/web/question_router"
import { api } from "../lib/web/trpc"

function FilterButton({
  onClick,
  filterActive,
  children,
  className,
}: {
  onClick: () => void
  filterActive?: boolean
  children: ReactNode
  className?: string
}): ReactElement {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "btn",
        className,
        filterActive ? "btn-primary" : "text-neutral-500",
      )}
    >
      {filterActive && (
        <CheckCircleIcon className="inline-flex -ml-2 mr-1" height={16} />
      )}
      {children}
    </button>
  )
}

export function FilterControls({
  extraFilters,
  setExtraFilters,
}: {
  extraFilters: ExtraFilters
  setExtraFilters: (extraFilters: ExtraFilters) => void
}) {
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchString, setSearchString] = useState("")
  const [filterVisible, setFilterVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  // my stories, to filter the list by one of them
  const stories = api.claims.stories.useQuery().data ?? []
  const activeStory = stories.find((s) => s.id === extraFilters.filterStoryId)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  useEffect(() => {
    const handleSetSearchString = (event: Event) => {
      const customEvent = event as CustomEvent
      setSearchString(customEvent.detail)
      setSearchVisible(true)
      setExtraFilters({
        ...extraFilters,
        searchString: customEvent.detail,
        resolved: true,
      })
    }
    window.addEventListener("setSearchString", handleSetSearchString)
    return () => {
      window.removeEventListener("setSearchString", handleSetSearchString)
    }
  }, [setSearchString, extraFilters, setExtraFilters, setSearchVisible])

  const filters = [
    {
      name: "Due soon",
      effect: () =>
        setExtraFilters({
          ...extraFilters,
          resolved: false,
          readyToResolve: false,
          resolvingSoon: !extraFilters.resolvingSoon,
          unresolved: !extraFilters.resolvingSoon,
        }),
      filterActive: extraFilters.resolvingSoon,
      className: "hidden",
      overflowClassName: "",
    },
    {
      name: "Past due",
      effect: () =>
        setExtraFilters({
          ...extraFilters,
          resolved: false,
          resolvingSoon: false,
          readyToResolve: !extraFilters.readyToResolve,
        }),
      filterActive: extraFilters.readyToResolve,
      className: "@xs:hidden @md:block",
      overflowClassName: "@sm:hidden",
    },
    {
      name: "Resolved",
      effect: () =>
        setExtraFilters({
          ...extraFilters,
          readyToResolve: false,
          resolvingSoon: false,
          resolved: !extraFilters.resolved,
          unresolved: false,
        }),
      filterActive: extraFilters.resolved,
      className: "@xs:block",
      overflowClassName: "@xs:hidden",
    },
    {
      name: "Withdrawn",
      effect: () =>
        setExtraFilters({
          ...extraFilters,
          readyToResolve: false,
          resolvingSoon: false,
          resolved: false,
          unresolved: false,
          withdrawn: !extraFilters.withdrawn,
        }),
      filterActive: extraFilters.withdrawn,
      className: "hidden",
      overflowClassName: "",
    },
    {
      name: "Open",
      effect: () =>
        setExtraFilters({
          ...extraFilters,
          readyToResolve: false,
          unresolved: !extraFilters.unresolved,
          resolved: false,
        }),
      filterActive: extraFilters.unresolved,
      className: "hidden",
      overflowClassName: "",
    },
  ]

  return (
    <div className="@container grow sm:ml-2">
      <div className="flex flex-row gap-1 justify-end" id="filters">
        {!searchVisible && !isMobile && (
          <button
            onClick={() => setSearchVisible(!searchVisible)}
            aria-label="Search"
            title="Search"
            className="btn text-neutral-500"
          >
            <MagnifyingGlassIcon height={16} />
          </button>
        )}

        <AnimatePresence mode="popLayout">
          {(searchVisible || isMobile) && (
            <motion.div
              initial={isMobile ? undefined : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="relative"
            >
              <input
                type="text"
                value={searchString}
                placeholder="Search..."
                autoFocus={!isMobile}
                onBlur={() => {
                  if (searchString === "") {
                    setSearchVisible(false)
                  }
                }}
                onChange={(e) => {
                  setSearchString(e.target.value)
                  setExtraFilters({
                    ...extraFilters,
                    searchString: e.target.value,
                  })
                }}
                className="text-sm py-2 px-4 focus:border-indigo-500 outline-none block w-full border-2 border-neutral-300 rounded-md p-4 resize-none disabled:opacity-25 disabled:bg-neutral-100 pr-11 placeholder:text-neutral-400 min-w-[150px]"
              />
              <button
                onClick={() => {
                  setSearchString("")
                  setSearchVisible(false)
                  setExtraFilters({
                    ...extraFilters,
                    searchString: "",
                  })
                }}
                className={clsx(
                  "btn btn-xs absolute right-0 top-0 btn-ghost rounded-full text-neutral-500",
                  isMobile && !searchString && "hidden",
                )}
              >
                <XMarkIcon height={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {
          // show buttons if they fit in the container, otherwise put them in the overflow
          filters.map(({ name, effect, className, filterActive }) => (
            <FilterButton
              key={name}
              onClick={effect}
              className={clsx("hidden", className)}
              filterActive={filterActive}
            >
              {name}
            </FilterButton>
          ))
        }

        <button
          onClick={() => setFilterVisible(!filterVisible)}
          aria-label="Filter"
          title="Filter"
          aria-expanded={filterVisible}
          className={clsx(
            "btn text-neutral-500",
            filterVisible && "btn-active",
          )}
        >
          <FunnelIcon height={16} />
        </button>
      </div>

      {activeStory && !filterVisible && (
        <div className="mt-2 flex justify-end">
          <button
            className="rounded-full border border-ink bg-neutral-100 px-3 py-1 text-xs font-semibold text-ink shadow-[inset_0_0_0_1px_#1B2230]"
            title="Stop filtering by this story"
            onClick={() =>
              setExtraFilters({ ...extraFilters, filterStoryId: undefined })
            }
          >
            Story: {activeStory.name}
            <XMarkIcon className="ml-1 inline" height={14} />
          </button>
        </div>
      )}

      {
        // overflow filter buttons
      }
      <AnimatePresence mode="popLayout">
        {filterVisible && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full flex flex-row flex-wrap gap-1 justify-end mt-2"
          >
            {filters.map(
              ({ name, effect, overflowClassName, filterActive }) => (
                <FilterButton
                  key={name}
                  onClick={effect}
                  className={overflowClassName}
                  filterActive={filterActive}
                >
                  {name}
                </FilterButton>
              ),
            )}
            {stories.length > 0 && (
              <div
                className="flex w-full flex-row flex-wrap items-center justify-end gap-2 pt-1"
                role="group"
                aria-label="Filter by story"
              >
                <span className="text-xs text-neutral-500">Story</span>
                {stories.map((story) => {
                  const on = extraFilters.filterStoryId === story.id
                  return (
                    <button
                      key={story.id}
                      aria-pressed={on}
                      className={
                        on
                          ? "rounded-full border border-ink bg-neutral-100 px-3 py-1 text-xs font-semibold text-ink shadow-[inset_0_0_0_1px_#1B2230]"
                          : "rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-neutral-50"
                      }
                      onClick={() =>
                        setExtraFilters({
                          ...extraFilters,
                          filterStoryId: on ? undefined : story.id,
                        })
                      }
                    >
                      {story.name}
                    </button>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
