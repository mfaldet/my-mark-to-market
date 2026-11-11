/** The glass app-icon tile, shown small beside the app's name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/tile.svg"
      alt=""
      aria-hidden="true"
      className={className}
    />
  )
}
