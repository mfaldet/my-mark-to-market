/** The scales glyph beside the app's name. */
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
