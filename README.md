# G7sim

A browser-based **Philips G7000** simulator — also known as the **Magnavox Odyssey²**
and **Videopac**. It emulates the console's Intel **8048** microcontroller and Intel
**8244/8245** Video Display Controller entirely in JavaScript, so real cartridge dumps
run in any modern browser with no plugins, no build step, and no server.

Just open `index.html`. There's no build step — it's plain HTML/CSS/JS, so it also
runs unmodified from GitHub Pages (see below) or any static file host.

## Running it live (GitHub Pages)

Opening `index.html` from the repo's file view on github.com only shows its source —
GitHub never executes HTML/JS there. To actually run the app, serve it with
**GitHub Pages** (Settings → Pages → Source: *Deploy from a branch* → branch `main`,
folder `/ (root)` → Save). This repo is already set up for it: a `.nojekyll` file
skips unnecessary Jekyll processing, and every path in `index.html` is relative, so it
works whether Pages serves it at the domain root or under a project subpath (e.g.
`https://<user>.github.io/G7sim/`). It also needs no server-side code — Pages' HTTPS
is exactly what the `rom/rom.bin`/`rom.zip`/`games.zip` auto-load and the in-browser
ZIP inflate rely on. First load takes a minute or two after enabling Pages, and again
after each push while it redeploys.

## Loading ROMs (drag & drop)

For copyright reasons **no console BIOS or game ROM is bundled**. You supply them at
runtime — everything stays on your machine and works fully offline.

1. **Drop the console BIOS** — the 1 KB `o2rom.bin` (CRC `0x8016A315`). The G7400
   Videopac+, French C52 and Jopac BIOSes are recognised too.
2. **Drop a games archive** — a `.zip` (e.g. the ~150 KB Videopac/Odyssey² set) or a
   single cartridge dump (`.bin` / `.rom`). ZIPs are browsed in the library panel and
   inflated on demand using the browser's native `DecompressionStream` (no libraries).
3. **Click a game** in the library to play.

The BIOS and the last dropped archive are remembered (IndexedDB), so you only drop once.

### Auto-loading defaults

If you serve the page over http(s), G7sim automatically imports **`rom/rom.bin`**
(BIOS) and **`rom/games.zip`** (game library) from next to `index.html` when present,
so a deployment can ship with them preinstalled. Dragged-in files are saved and take
precedence over these defaults. See [`rom/README.md`](rom/README.md). (Auto-load needs
http(s); on `file://` use drag & drop.)

## Controls

| Input | Mapping |
|-------|---------|
| Joystick P1 | Arrow keys · fire = `Space` or `Left Shift` |
| Joystick P2 | Numpad `8` `4` `6` `2` · fire = Numpad `0` |
| Keyboard | Letter/number keys map to the Videopac membrane keyboard; `Enter`, `Backspace` = DEL |

Click **❓ Help** at any time for a quick reference on installing ROMs, opening games,
the controls, and the shortcuts.

### Playing on a phone

On a touch device, **tap the screen** to enter fullscreen. In fullscreen and portrait
orientation, touch controls appear: the screen is pinned to the top, a draggable
**8-way joystick** sits under the right thumb, a **FIRE** button under the left thumb
(top-aligned with the stick), and the **☰ JOY 1/2** button in the bottom-left corner —
coloured to match whichever joystick is active — switches which one you control.

**Tap the screen** to pause (tap again on the dimmed screen to resume). **Press and
hold the screen** instead to bring up a temporary number pad — e.g. for the BIOS
"SELECT GAME" prompt — it closes the instant you tap a digit; its **⌨ KEYBOARD** button
opens your device's own keyboard so you can type a full hi-score name. **Press and hold
☰** for a menu with **Pause**, **Reset** (in most games, back to the SELECT GAME
screen), **Sound on/off**, and **Exit Fullscreen** — a quick tap still just swaps
joysticks, so none of those can be triggered by accident mid-game.

The on-screen joystick snaps between its 8 discrete positions rather than sliding
smoothly, matching the console's digital (not analog) stick, and gives a light haptic
tap together with the FIRE button on devices that support the Vibration API. On iPhone
(where the browser lacks a fullscreen API for page elements) a built-in fullscreen
fallback is used automatically — including a lock against accidental pinch/double-tap
zoom while it's active — so single-player games are playable on iOS Safari.

Open **⚙ Settings** to turn sound on/off and adjust the volume, and to configure the
two joysticks. Each joystick is shown as a **D-pad-shaped diagram**; use **Configure
all…** to set its five keys in sequence (it highlights UP, DOWN, LEFT, RIGHT, FIRE in
turn and you just press the key for each), or click a single direction to rebind only
that one. **⇄ Flip joysticks** swaps the two players' key assignments. All settings are
remembered between sessions.

### Shortcuts

The modifier is <kbd>Option</kbd> on macOS and <kbd>AltGr</kbd> on Windows:

| Shortcut | Action |
|----------|--------|
| <kbd>Alt</kbd>+<kbd>P</kbd> | Pause / resume |
| <kbd>Alt</kbd>+<kbd>S</kbd> | Sound on / off |
| <kbd>Alt</kbd>+<kbd>R</kbd> | Reset |
| <kbd>Alt</kbd>+<kbd>0</kbd> | Fullscreen |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd> | Flip joysticks (harder combo, to avoid accidents) |

Holding <kbd>Shift</kbd> while pressing a letter A–Z always types on the Videopac
keyboard (handy for entering hi-score names) — even if that letter is also assigned to
a joystick direction.

## What's emulated

- **CPU** — full Intel 8048 (MCS-48) instruction set, timer/counter, external &
  timer interrupts, register banks, and the horizontal/vertical display interrupt.
- **Video** — 8244/8245 VDC: background & per-line colour, the 9×8 grid, single
  characters, quad characters, and the four sprites, with the hardware collision
  detection register. The original 8244 character-generator ROM and 16-colour
  palette are reproduced.
- **Audio** — the VDC's 24-bit shift-register tone/noise generator, output through
  Web Audio.
- **Cartridge banking** — 2K/4K/8K/16K and 3K/EXROM mappers, plus the per-title
  timing tweaks needed by many games (keyed on cartridge CRC32).

## Project layout

```
index.html            markup + drop UI
src/style.css         styling
src/g7000.js          machine core: memory map, ports, banking, BIOS/cart loading
src/g7000-cpu.js      Intel 8048 instruction interpreter
src/g7000-vdc.js      8244/8245 VDC rendering + collisions
src/g7000-audio.js    audio synthesis + Web Audio sink
src/g7000-kluges.js   per-cartridge timing/quirk table
src/zip.js            dependency-free ZIP reader (native inflate)
src/storage.js        IndexedDB persistence
src/main.js           UI, input, drag & drop, run loop
```

## Credits

The emulation reimplements, in JavaScript, the behaviour of the free
[**O2EM**](http://o2em.sourceforge.net) emulator by Daniel Boris, André de la Rocha
and Arlindo M. de Oliveira. Hardware register maps, timing constants, the 8244
character ROM and the colour palette are derived from that project. G7sim ships no
copyrighted BIOS or game data.
