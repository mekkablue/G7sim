# Auto-loaded ROMs

Files placed here are imported automatically when `index.html` is opened
**over http(s)** (browsers block `fetch()` on `file://`, so for local use either
serve the folder with a static web server or just drag & drop the files onto the
page instead):

| File | Purpose |
|------|---------|
| `rom/rom.bin` | Console BIOS — the 1 KB `o2rom.bin` (or a recognised G7400/C52/Jopac BIOS) |
| `rom/rom.zip` | Fallback for the BIOS: if `rom/rom.bin` is missing or unusable, this ZIP is fetched and the BIOS is extracted from it in memory (the entry named like `o2rom`/`bios`/`rom.bin`, or the smallest file ≥ 1 KB) |
| `rom/games.zip` | A ZIP of cartridge dumps, listed in the game library |

These are only a **default fallback**: anything you drag & drop is saved and takes
precedence on the next visit. To go back to the bundled defaults, clear the site
data (which empties the saved BIOS/library) and reload.

`rom/rom.bin` should be a console BIOS of at least 1 KB (only the first 1 KB is
used, so a padded or multi-region dump is fine). If it is missing or too small,
G7sim automatically falls back to **`rom/rom.zip`** and extracts the BIOS from
there — handy if your server won't serve raw `.bin` files but allows `.zip`. If a
default file still can't be auto-loaded, the browser console (developer tools)
explains why — e.g. an `HTTP 403`/`404` (the server isn't serving that path, or
blocks `.bin`), or a file that's too small to be a BIOS.

No BIOS or game data is included in this repository, and the actual `rom/*.bin`,
`rom/*.zip`, etc. are git-ignored so copyrighted dumps are never committed — you
supply your own.
