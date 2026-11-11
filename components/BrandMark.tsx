/**
 * The logo beside the app's name: the outlined bubble with the check-arrow,
 * on a transparent background. Its blue-to-teal belongs to the logo only.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/mark.svg"
      alt=""
      aria-hidden="true"
      className={className}
    />
  )
}
