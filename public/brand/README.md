# Brand files

`app-icon.svg` is the one source: an outlined bubble with a blue-to-teal
check-arrow, on a pale square. Everything else here is built from it by
`scripts/brand-icons.mjs`.

Two versions of the artwork are used:

- **filled**, on the pale square (`#F1F6F6`), where an icon must be a full
  square: `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` and
  `icon-512-maskable.png` (artwork shrunk into the safe zone)
- **transparent**, just the bubble and arrow, everywhere else: `mark.svg`
  (the header), `icon-1024.png` (the master) and `link-preview.png`
  (1200x630, on white)
- **the browser tab** has its own version, because it is tiny and may sit
  on a dark tab: `tab-icon.svg`, `favicon-16.png`, `favicon-32.png` and
  `/favicon.ico` (16/32/48). Heavier lines (bubble 64, arrow 76, instead of
  42 and 54), and the inside of the bubble filled with the pale colour.
  Outside the bubble stays transparent

The blue-to-teal of the arrow belongs to the logo only. Nothing else in the
app uses it.

If the logo changes, replace `app-icon.svg` and run the script.
