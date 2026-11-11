/**
 * Builds every icon file from one source: public/brand/app-icon.svg
 * (the outlined bubble with the check-arrow, on a pale square).
 *
 *   NODE_PATH=$(npm root -g) node scripts/brand-icons.mjs
 *
 * Needs Playwright (not a dependency of the app; any recent version works)
 * and Python with Pillow for the .ico file.
 *
 * Two versions of the artwork are used:
 *   filled       on the pale square (#F1F6F6), for icons that must be a full square
 *   transparent  just the bubble and arrow, for everywhere else
 *
 * Writes, in public/brand/:
 *   mark.svg                 transparent, cropped close: the header and the browser tab
 *   icon-1024.png            transparent master
 *   favicon-32.png, favicon-16.png   transparent
 *   apple-touch-icon.png     180, filled: a full square, no transparency or
 *                            rounded corners, because iOS rounds it itself
 *   icon-192.png, icon-512.png       filled
 *   icon-512-maskable.png    filled, artwork shrunk into the safe zone so
 *                            Android can crop it to any shape
 *   link-preview.png         1200x630, on white
 * and public/favicon.ico (16/32/48) and public/logo.png.
 *
 * The blue-to-teal of the arrow belongs to the logo only. Nothing else in
 * the app uses it.
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"

// require, not import, so a globally installed Playwright is found (NODE_PATH)
const require = createRequire(import.meta.url)
const { chromium } = require("playwright")

const root = new URL("../", import.meta.url).pathname
const dir = root + "public/brand/"
const filled = fs.readFileSync(dir + "app-icon.svg", "utf8")

const BACKGROUND = /<rect width="1024" height="1024" fill="#F1F6F6"\/>\s*/
if (!BACKGROUND.test(filled)) {
  throw new Error("app-icon.svg: could not find the pale background square")
}
// just the bubble and the arrow
const transparent = filled.replace(BACKGROUND, "")
// The artwork sits at about 139..885 across and 147..887 down in the 1024
// box. Cropped close, it reads larger at small sizes.
const mark = transparent.replace(
  'viewBox="0 0 1024 1024" width="1024" height="1024"',
  'viewBox="126 134 772 772" width="772" height="772"',
)
fs.writeFileSync(dir + "mark.svg", mark)

// Maskable: Android may crop to a circle 80% of the width, so the artwork
// is shrunk about the centre while the pale square still fills the icon.
const maskable = filled
  .replace(
    /(<rect width="1024" height="1024" fill="#F1F6F6"\/>)/,
    '$1\n  <g transform="translate(512 520) scale(0.72) translate(-512 -520)">',
  )
  .replace("</svg>", "</g>\n</svg>")

/** Optional heavier lines, for sizes where the outline would thin out. */
export const heavier = (svg, bubble = 64, arrow = 76) =>
  svg
    .replace('stroke-width="42"', `stroke-width="${bubble}"`)
    .replace('stroke-width="54"', `stroke-width="${arrow}"`)

const font = (file) =>
  fs
    .readFileSync(
      root + `node_modules/@fontsource/tinos/files/tinos-latin-${file}.woff2`,
    )
    .toString("base64")
const uri = (svg) =>
  "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64")

const browser = await chromium.launch()
async function shot(html, out, width, height, background) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(
    `<body style="margin:0;background:${background ?? "transparent"}">${html}</body>`,
  )
  await page.waitForTimeout(150)
  await page.screenshot({ path: dir + out, omitBackground: !background })
  await page.close()
}
const png = (svg, out, size, background) =>
  shot(
    `<img src="${uri(svg)}" width="${size}" height="${size}" style="display:block">`,
    out,
    size,
    size,
    background,
  )

await png(transparent, "icon-1024.png", 1024)
await png(mark, "favicon-32.png", 32)
await png(mark, "favicon-16.png", 16)
await png(mark, "favicon-48.png", 48)
await png(filled, "apple-touch-icon.png", 180, "#F1F6F6")
await png(filled, "icon-192.png", 192, "#F1F6F6")
await png(filled, "icon-512.png", 512, "#F1F6F6")
await png(maskable, "icon-512-maskable.png", 512, "#F1F6F6")
await shot(
  `<style>
     @font-face { font-family: Tinos; font-weight: 700; src: url(data:font/woff2;base64,${font("700-normal")}) format("woff2"); }
     @font-face { font-family: Tinos; font-style: italic; src: url(data:font/woff2;base64,${font("400-italic")}) format("woff2"); }
   </style>
   <div style="width:1200px;height:630px;display:flex;align-items:center;justify-content:center;gap:56px">
     <img src="${uri(mark)}" width="300" height="300">
     <div>
       <div style="font:700 78px Tinos, serif;color:#1B2230;white-space:nowrap">My Mark-to-Market</div>
       <div style="font:italic 400 36px Tinos, serif;color:#465064;margin-top:10px">My hunches and predictions:<br>logged, sharpened and scored.</div>
     </div>
   </div>`,
  "link-preview.png",
  1200,
  630,
  "#FFFFFF",
)
await browser.close()

execFileSync("python3", [
  "-c",
  `from PIL import Image
import os
d=${JSON.stringify(dir)}
Image.open(d+"favicon-48.png").save(d+"../favicon.ico",format="ICO",append_images=[Image.open(d+"favicon-32.png"),Image.open(d+"favicon-16.png")],sizes=[(48,48),(32,32),(16,16)])
Image.open(d+"icon-512.png").save(d+"../logo.png")
os.remove(d+"favicon-48.png")`,
])
console.log("icons built")
