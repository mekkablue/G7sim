# G7sim

A browser-based **Philips G7000** simulator — also known as the **Magnavox Odyssey²**
and **Videopac**. It emulates the console's Intel **8048** microcontroller and Intel
**8244/8245** Video Display Controller entirely in JavaScript, so real cartridge dumps
run in any modern browser with no plugins, no build step, and no server.

Just open `index.html`.

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

## Controls

| Input | Mapping |
|-------|---------|
| Joystick P1 | Arrow keys · fire = `Space` or `Left Shift` |
| Joystick P2 | Numpad `8` `4` `6` `2` · fire = Numpad `0` |
| Keyboard | Letter/number keys map to the Videopac membrane keyboard; `Enter`, `Backspace` = DEL |

On-screen D-pad, fire button and numeric keypad are provided for touch devices.

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
