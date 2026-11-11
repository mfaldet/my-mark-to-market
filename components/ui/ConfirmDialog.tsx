import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react"
import { Fragment, ReactNode } from "react"

/**
 * A yes/no question shown inside the page.
 *
 * The browser's own confirm() box can be switched off or swallowed (some
 * in-app browsers and home-screen web apps never show it), and then it
 * silently answers "no". This one is part of the page, so it always shows.
 */
export function ConfirmDialog({
  isOpen,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
}: {
  isOpen: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[10000]" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </TransitionChild>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <DialogPanel className="w-full max-w-md rounded-lg bg-white p-6 text-left shadow-xl">
              <DialogTitle
                as="h3"
                className="text-lg font-medium leading-6 text-ink"
              >
                {title}
              </DialogTitle>
              {children && (
                <div className="mt-2 text-sm text-neutral-600">{children}</div>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" className="btn btn-sm" onClick={onClose}>
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    onClose()
                    onConfirm()
                  }}
                >
                  {confirmLabel}
                </button>
              </div>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
