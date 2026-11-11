# Brand files

`app-icon.svg` is the one source: the glass tile with the scales glyph.
Everything else here is built from it by `scripts/brand-icons.mjs`:

- `tile.svg`: the tile cropped close, shown beside the app's name
- `tile-small.svg`, `favicon-32.png`, `favicon-16.png`, `/favicon.ico`:
  the browser-tab icon. At 16 and 32 px the full tile turns muddy, so this
  is the same tile simplified: four large colour blobs and the same glyph
  drawn larger with a firmer shadow
- `icon-1024.png`, `icon-512.png`, `/logo.png`: the full icon, transparent
  outside the rounded tile; used for link previews
- `apple-touch-icon.png`: 180 px, a full square with no transparency,
  shadow or rounded corners, because iOS rounds it itself

If the logo changes, replace `app-icon.svg` and run the script.
