/**
 * Builds every icon file from one source: public/brand/app-icon.svg.
 *
 *   NODE_PATH=$(npm root -g) node scripts/brand-icons.mjs
 *
 * Needs Playwright (not a dependency of the app; any recent version works)
 * and Python with Pillow for the .ico file.
 *
 * Writes, in public/brand/:
 *   tile.svg              the glass tile cropped close, for the header and the browser tab
 *   icon-1024.png         the full icon, transparent outside the rounded tile
 *   icon-512.png          the same at 512, used for link previews
 *   tile-small.svg        the tile simplified for 16 and 32 px (see below)
 *   favicon-32.png, favicon-16.png
 *   apple-touch-icon.png  180 px, a full square: no transparency, shadow or
 *                         rounded corners, because iOS rounds it itself
 * and public/favicon.ico and public/logo.png.
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"

// require, not import, so a globally installed Playwright is found (NODE_PATH)
const { chromium } = createRequire(import.meta.url)("playwright")

const dir = new URL("../public/brand/", import.meta.url).pathname
const source = fs.readFileSync(dir + "app-icon.svg", "utf8")

// The tile sits at 40..472 in a 512 box, with a soft shadow below it.
const tile = source.replace(
  /viewBox="0 0 512 512" width="512" height="512"/,
  'viewBox="30 34 452 452" width="452" height="452"',
)
fs.writeFileSync(dir + "tile.svg", tile)

// Full-bleed square for iOS: square the tile off, drop its shadow and its
// edge lines, and crop to the tile.
const square = source
  .replace(
    /viewBox="0 0 512 512" width="512" height="512"/,
    'viewBox="40 40 432 432" width="432" height="432"',
  )
  .replace(/<rect x="50" y="64" width="412" height="422" rx="104"[^>]*\/>/, "")
  .replace(/<rect x="41" y="41" width="430" height="430" rx="103"[^>]*\/>/, "")
  .replace(
    /<rect x="40" y="40" width="432" height="432" rx="104" fill="none" stroke="#1B2230"[^>]*\/>/,
    "",
  )
  .replace(/(<rect x="40" y="40" width="432" height="432") rx="104"/g, "$1")

// At 16 and 32 px the full tile turns muddy: too many small blobs, and the
// white glyph disappears. This is the same tile simplified for small sizes:
// it fills the whole box, has four large blobs, and the same glyph drawn
// larger with a firmer shadow.
const glyph = (source.match(/<g fill="#fff">([\s\S]*?)<\/g>/) ?? [])[1]
if (!glyph) throw new Error("could not find the glyph in app-icon.svg")
const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
<clipPath id="t"><rect x="16" y="16" width="480" height="480" rx="112"/></clipPath>
<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>
<filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<rect x="16" y="16" width="480" height="480" rx="112" fill="#EEF1F6"/>
<g clip-path="url(#t)"><g filter="url(#b)">
<circle cx="390" cy="130" r="190" fill="#A9DFFF"/>
<circle cx="100" cy="270" r="180" fill="#FFB3D1"/>
<circle cx="350" cy="350" r="170" fill="#FFE98A"/>
<circle cx="200" cy="470" r="150" fill="#C9B6FF"/>
</g>
<rect x="16" y="16" width="480" height="480" fill="#fff" fill-opacity="0.2"/>
<rect x="16" y="16" width="480" height="480" fill="url(#g)"/></g>
<rect x="17" y="17" width="478" height="478" rx="111" fill="none" stroke="#1B2230" stroke-opacity="0.28" stroke-width="6"/>
<g transform="translate(256 262) scale(1.62) translate(-256 -262)">
<g fill="#1B2230" opacity="0.55" filter="url(#s)" transform="translate(0 7)">${glyph}</g>
<g fill="#1B2230" opacity="0.35">${glyph.replace(/<(rect|path)/g, '<$1 stroke="#1B2230" stroke-width="7"')}</g>
<g fill="#fff">${glyph}</g>
</g>
</svg>
`
fs.writeFileSync(dir + "tile-small.svg", small)

const browser = await chromium.launch()
async function png(svg, out, size, background) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
  })
  const data = Buffer.from(svg).toString("base64")
  await page.setContent(
    `<body style="margin:0;background:${background ?? "transparent"}"><img src="data:image/svg+xml;base64,${data}" width="${size}" height="${size}" style="display:block"></body>`,
  )
  await page.screenshot({ path: dir + out, omitBackground: !background })
  await page.close()
}
await png(source, "icon-1024.png", 1024)
await png(source, "icon-512.png", 512)
await png(small, "favicon-32.png", 32)
await png(small, "favicon-16.png", 16)
await png(square, "apple-touch-icon.png", 180, "#FBFBFD")
await browser.close()

execFileSync("python3", [
  "-c",
  `from PIL import Image
d=${JSON.stringify(dir)}
big=Image.open(d+"icon-1024.png").resize((48,48),Image.LANCZOS)
big.save(d+"../favicon.ico",format="ICO",append_images=[Image.open(d+"favicon-32.png"),Image.open(d+"favicon-16.png")],sizes=[(48,48),(32,32),(16,16)])
Image.open(d+"icon-512.png").save(d+"../logo.png")`,
])
console.log("icons built")
