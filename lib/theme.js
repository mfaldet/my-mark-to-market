/**
 * The app's colours, defined once. tailwind.config.js builds its palette
 * from this file, and charts import it directly.
 *
 * The rule: nearly everything is near-black or a shade of grey. A single
 * colour appears only when it carries meaning:
 *   blue   = information
 *   yellow = a change, or caution
 *   green  = positive / right
 *   red    = negative / wrong / urgent
 * The brand itself is the six pastels blended together (see .brand-surface
 * in styles/globals.css), never one of them alone.
 */
export const ink = "#1B2230"

/** near-black and greys; 400 is the brand's secondary grey, 200 and 50 its light surfaces */
export const grey = {
  50: "#FBFBFD",
  100: "#F2F4F8",
  200: "#E6E9F0",
  300: "#CBD1DB",
  400: "#6E7A8E",
  // #6E7A8E is 4.3:1 on white, just short of the 4.5:1 needed for small
  // text, so small secondary text uses this darker step
  500: "#5A6577",
  600: "#465064",
  700: "#343D4D",
  800: "#252D3B",
  900: ink,
  950: "#111620",
}

/**
 * Each functional colour: DEFAULT is the brand value (fills, dots, lines),
 * soft is a pale background, text is a darker shade that passes 4.5:1 on
 * white and on its own soft background.
 */
export const meaning = {
  info: { DEFAULT: "#2563EB", soft: "#EFF4FE", text: "#1D4ED8" },
  change: { DEFAULT: "#EAB308", soft: "#FEF9E0", text: "#854D0E" },
  positive: { DEFAULT: "#16A34A", soft: "#E9F8EE", text: "#166534" },
  negative: { DEFAULT: "#DC2626", soft: "#FDECEC", text: "#B91C1C" },
}

/** a Tailwind 50-950 scale built around one functional colour */
export const scale = (m, mid) => ({
  50: m.soft,
  100: m.soft,
  200: mid[0],
  300: mid[1],
  400: m.DEFAULT,
  500: m.DEFAULT,
  600: m.DEFAULT,
  700: m.text,
  800: m.text,
  900: m.text,
  950: m.text,
})

export const pastel = {
  peach: "#FFC9A8",
  pink: "#FFB3D1",
  sky: "#A9DFFF",
  butter: "#FFE98A",
  lavender: "#C9B6FF",
  mint: "#B3F0D8",
}
