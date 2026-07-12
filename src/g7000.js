/*
 * G7sim - Philips G7000 / Videopac / Magnavox Odyssey 2 emulator core
 *
 * This is a faithful JavaScript re-implementation of the hardware emulated by
 * O2EM (the Intel 8048 microcontroller and the Intel 8244/8245 Video Display
 * Controller). The original O2EM C sources were written by Daniel Boris, Andre
 * de la Rocha and Arlindo M. de Oliveira and released as free software; the
 * behaviour, memory maps, timing constants and the 8244 character ROM are
 * reproduced here so that real Videopac/Odyssey 2 cartridge dumps run in a
 * browser. No copyrighted console BIOS or game ROM is bundled - the user
 * supplies those at runtime by drag and drop.
 */
(function (global) {
  'use strict';

  // ---- timing / geometry constants (from vmachine.h / vdc.h) ----
  var LINECNT = 21;
  var MAXLINES = 500;
  var MAXSNAP = 50;
  var VBLCLK = 5493;
  var EVBLCLK_NTSC = 5964;
  var EVBLCLK_PAL = 7259;
  var FPS_NTSC = 60;
  var FPS_PAL = 50;
  var BMPW = 340;
  var BMPH = 250;
  var WNDW = 320;
  var WNDH = 240;

  // collision source bit masks
  var COL_SP0 = 0x01, COL_SP1 = 0x02, COL_SP2 = 0x04, COL_SP3 = 0x08;
  var COL_VGRID = 0x10, COL_HGRID = 0x20, COL_VPP = 0x40, COL_CHAR = 0x80;

  // ---- 8244/8245 palettes (RGB) ----
  var PALETTE_O2 = [
    0x000000, 0x0e3dd4, 0x00981b, 0x00bbd9, 0xc70008, 0xcc16b3, 0x9d8710,
    0xe1dee1, 0x5f6e6b, 0x6aa1ff, 0x3df07a, 0x31ffff, 0xff4255, 0xff98ff,
    0xd9ad5d, 0xffffff
  ];
  var PALETTE_VPP = [
    0x000000, 0x0000b6, 0x00b600, 0x00b6b6, 0xb60000, 0xb600b6, 0xb6b600,
    0xb6b6b6, 0x494949, 0x4949ff, 0x49ff49, 0x49ffff, 0xff4949, 0xff49ff,
    0xffff49, 0xffffff
  ];

  // ---- 8244 internal character generator ROM (from O2EM cset.c) ----
  var CSET = new Uint8Array([
    0x7C,0xC6,0xC6,0xC6,0xC6,0xC6,0x7C,0x00, 0x18,0x38,0x18,0x18,0x18,0x18,0x3C,0x00,
    0x3C,0x66,0x0C,0x18,0x30,0x60,0x7E,0x00, 0x7C,0xC6,0x06,0x3C,0x06,0xC6,0x7C,0x00,
    0xCC,0xCC,0xCC,0xFE,0x0C,0x0C,0x0C,0x00, 0xFE,0xC0,0xC0,0x7C,0x06,0xC6,0x7C,0x00,
    0x7C,0xC6,0xC0,0xFC,0xC6,0xC6,0x7C,0x00, 0xFE,0x06,0x0C,0x18,0x30,0x60,0xC0,0x00,
    0x7C,0xC6,0xC6,0x7C,0xC6,0xC6,0x7C,0x00, 0x7C,0xC6,0xC6,0x7E,0x06,0xC6,0x7C,0x00,
    0x00,0x18,0x18,0x00,0x18,0x18,0x00,0x00, 0x18,0x7E,0x58,0x7E,0x1A,0x7E,0x18,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00, 0x3C,0x66,0x0C,0x18,0x18,0x00,0x18,0x00,
    0xC0,0xC0,0xC0,0xC0,0xC0,0xC0,0xFE,0x00, 0xFC,0xC6,0xC6,0xFC,0xC0,0xC0,0xC0,0x00,
    0x00,0x18,0x18,0x7E,0x18,0x18,0x00,0x00, 0xC6,0xC6,0xC6,0xD6,0xFE,0xEE,0xC6,0x00,
    0xFE,0xC0,0xC0,0xF8,0xC0,0xC0,0xFE,0x00, 0xFC,0xC6,0xC6,0xFC,0xD8,0xCC,0xC6,0x00,
    0x7E,0x18,0x18,0x18,0x18,0x18,0x18,0x00, 0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,
    0x3C,0x18,0x18,0x18,0x18,0x18,0x3C,0x00, 0x7C,0xC6,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,
    0x7C,0xC6,0xC6,0xC6,0xDE,0xCC,0x76,0x00, 0x7C,0xC6,0xC0,0x7C,0x06,0xC6,0x7C,0x00,
    0xFC,0xC6,0xC6,0xC6,0xC6,0xC6,0xFC,0x00, 0xFE,0xC0,0xC0,0xF8,0xC0,0xC0,0xC0,0x00,
    0x7C,0xC6,0xC0,0xC0,0xCE,0xC6,0x7E,0x00, 0xC6,0xC6,0xC6,0xFE,0xC6,0xC6,0xC6,0x00,
    0x06,0x06,0x06,0x06,0x06,0xC6,0x7C,0x00, 0xC6,0xCC,0xD8,0xF0,0xD8,0xCC,0xC6,0x00,
    0x38,0x6C,0xC6,0xC6,0xFE,0xC6,0xC6,0x00, 0x7E,0x06,0x0C,0x18,0x30,0x60,0x7E,0x00,
    0xC6,0xC6,0x6C,0x38,0x6C,0xC6,0xC6,0x00, 0x7C,0xC6,0xC0,0xC0,0xC0,0xC6,0x7C,0x00,
    0xC6,0xC6,0xC6,0xC6,0xC6,0x6C,0x38,0x00, 0xFC,0xC6,0xC6,0xFC,0xC6,0xC6,0xFC,0x00,
    0xC6,0xEE,0xFE,0xD6,0xC6,0xC6,0xC6,0x00, 0x00,0x00,0x00,0x00,0x00,0x38,0x38,0x00,
    0x00,0x00,0x00,0x7E,0x00,0x00,0x00,0x00, 0x00,0x66,0x3C,0x18,0x3C,0x66,0x00,0x00,
    0x00,0x18,0x00,0x7E,0x00,0x18,0x00,0x00, 0x00,0x00,0x7C,0x00,0x7C,0x00,0x00,0x00,
    0x66,0x66,0x66,0x3C,0x18,0x18,0x18,0x00, 0xC6,0xE6,0xF6,0xFE,0xDE,0xCE,0xC6,0x00,
    0x03,0x06,0x0C,0x18,0x30,0x60,0xC0,0x00, 0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0x00,
    0xCE,0xDB,0xDB,0xDB,0xDB,0xDB,0xCE,0x00, 0x00,0x00,0x3C,0x7E,0x7E,0x7E,0x3C,0x00,
    0x1C,0x1C,0x18,0x1E,0x18,0x18,0x1C,0x00, 0x1C,0x1C,0x18,0x1E,0x18,0x34,0x26,0x00,
    0x38,0x38,0x18,0x78,0x18,0x2C,0x64,0x00, 0x38,0x38,0x18,0x78,0x18,0x18,0x38,0x00,
    0x00,0x18,0x0C,0xFE,0x0C,0x18,0x00,0x00, 0x18,0x3C,0x7E,0xFF,0xFF,0x18,0x18,0x00,
    0x03,0x07,0x0F,0x1F,0x3F,0x7F,0xFF,0x00, 0xC0,0xE0,0xF0,0xF8,0xFC,0xFE,0xFF,0x00,
    0x38,0x38,0x12,0xFE,0xB8,0x28,0x6C,0x00, 0xC0,0x60,0x30,0x18,0x0C,0x06,0x03,0x00,
    0x00,0x00,0x0C,0x08,0x08,0xFF,0x7E,0x00, 0x00,0x03,0x63,0xFF,0xFF,0x18,0x08,0x00,
    0x00,0x00,0x00,0x10,0x38,0xFF,0x7E,0x00, 0x00,0x00,0x00,0x06,0x6E,0xFF,0x7E,0x00
  ]);

  // ---- CRC32 (zlib polynomial) used for BIOS id and per-game timing tweaks ----
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf, off, len) {
    off = off || 0;
    if (len === undefined) len = buf.length - off;
    var c = 0xFFFFFFFF;
    for (var i = 0; i < len; i++) c = CRC_TABLE[(c ^ buf[off + i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // O2 keyboard matrix (6 rows x 8 cols), using browser KeyboardEvent.code strings.
  var KEY_MAP = [
    ['Digit0','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7'],
    ['Digit8','Digit9',null,null,'Space','Slash','KeyL','KeyP'],
    ['NumpadAdd','KeyW','KeyE','KeyR','KeyT','KeyU','KeyI','KeyO'],
    ['KeyQ','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK'],
    ['KeyA','KeyZ','KeyX','KeyC','KeyV','KeyB','KeyM','Period'],
    ['Minus','NumpadMultiply','NumpadDivide','Equal','KeyY','KeyN','Backspace','Enter']
  ];

  function G7000() {
    // memory
    this.rom_table = [];
    for (var b = 0; b < 8; b++) this.rom_table.push(new Uint8Array(4096));
    this.intRAM = new Uint8Array(64);
    this.extRAM = new Uint8Array(256);
    this.extROM = new Uint8Array(1024);
    this.VDCwrite = new Uint8Array(256);
    this.ColorVector = new Uint8Array(MAXLINES);
    this.AudioVector = new Uint8Array(MAXLINES);
    this.coltab = new Uint8Array(256);
    this.rom = this.rom_table[0];
    // snap lines: [pos][reg][t] flattened
    this.snap = new Uint8Array((MAXLINES + 2 * MAXSNAP) * 256 * 2);

    // video buffers
    this.vscreen = new Uint8Array(BMPW * BMPH);
    this.col = new Uint8Array(BMPW * BMPH);
    // 320x240 RGBA output
    this.frameBuffer = new Uint8ClampedArray(WNDW * WNDH * 4);

    // config
    this.app = {
      bank: 0, exrom: 0, three_k: 0, megaxrom: 0, vpp: 0,
      bios: 0, crc: 0, euro: 0, speed: 100, sound_en: 1, filter: 0,
      biosLoaded: false, cartLoaded: false
    };

    // input state (active-high here; converted to active-low when read)
    this.joy = [
      { up: 0, right: 0, down: 0, left: 0, fire: 0 },
      { up: 0, right: 0, down: 0, left: 0, fire: 0 }
    ];
    this.keys = {}; // code -> bool, for the alphanumeric keyboard matrix

    // audio: expose current register snapshot; synthesised in audio.js
    this.sound_IRQ = 0;

    this.reset();
  }

  var P = G7000.prototype;

  P.reset = function () {
    // cpu registers
    this.acc = 0; this.pc = 0; this.clk = 0;
    this.itimer = 0; this.reg_pnt = 0;
    this.timer_on = 0; this.count_on = 0; this.t_flag = 0;
    this.psw = 0; this.sp = 8;
    this.p1 = 0xFF; this.p2 = 0xFF;
    this.xirq_pend = 0; this.tirq_pend = 0;
    this.lastpc = 0; this.A11 = 0; this.A11ff = 0;
    this.bs = 0; this.f0 = 0; this.f1 = 0; this.ac = 0; this.cy = 0;
    this.xirq_en = 0; this.tirq_en = 0; this.irq_ex = 0;
    this.master_count = 0;

    // machine
    this.master_clk = 0; this.int_clk = 0; this.h_clk = 0; this.clk_counter = 0;
    this.last_line = 0; this.mstate = 0; this.frame = 0;
    this.romlatch = 0; this.x_latch = 0; this.y_latch = 0;
    this.evblclk = EVBLCLK_NTSC; this.fps = FPS_NTSC;

    // per-game timing tweaks (defaults)
    this.pendirq = 0; this.enahirq = 1; this.useforen = 0;
    this.regionoff = 0xffff; this.mxsnap = 2; this.sproff = 0; this.tweakedaudio = 0;

    this.intRAM.fill(0);
    this.extRAM.fill(0);
    this.VDCwrite.fill(0);
    this.ColorVector.fill(0);
    this.AudioVector.fill(0);
    this.vscreen.fill(0);
    this.col.fill(0);
    this.snap.fill(0);
    this.sound_IRQ = 0;
    this.rom = this.rom_table[0];

    this.setVideoMode(this.app.euro ? 1 : 0);
    if (this.app.cartLoaded) this.doKluges();
    this.clearCollision();
  };

  // ---------------- BIOS / cartridge loading ----------------
  P.loadBIOS = function (data) {
    // BIOS is the 8048 internal 1KB ROM, copied to low 1K of every bank.
    var rt0 = this.rom_table[0];
    for (var i = 0; i < 1024; i++) rt0[i] = data[i] || 0;
    for (var b = 1; b < 8; b++) this.rom_table[b].set(rt0.subarray(0, 1024), 0);
    var crc = crc32(rt0, 0, 1024);
    this.app.biosCrc = crc;
    if (crc === 0x8016A315) { this.app.vpp = 0; this.app.bios = 1; }
    else if (crc === 0xE20A9F41) { this.app.vpp = 1; this.app.bios = 2; }
    else if (crc === 0xA318E8D6) { this.app.vpp = 0; this.app.bios = 3; }
    else if (crc === 0x11647CA5) { this.app.vpp = 1; this.app.bios = 4; }
    else { this.app.vpp = 0; this.app.bios = 0; }
    this.app.biosLoaded = true;
    return crc;
  };

  // Load a cartridge dump (Uint8Array). Mirrors O2EM load_cart().
  P.loadCart = function (data) {
    var l = data.length;
    if (l === 0 || (l % 1024) !== 0) throw new Error('Invalid ROM dump size ' + l);
    // clear cart pages (keep BIOS low-1K of each bank)
    for (var b = 0; b < 8; b++) this.rom_table[b].fill(0, 1024);
    this.extROM.fill(0);
    this.app.crc = crc32(data);
    this.app.exrom = 0; this.app.three_k = 0; this.app.megaxrom = 0;

    if (this.app.crc === 0xAFB23F89) this.app.exrom = 1; // Musician
    if (this.app.crc === 0x3BFEF56B) this.app.exrom = 1; // Four in 1 Row!
    if (this.app.crc === 0x9B5E9356) this.app.exrom = 1; // Four in 1 Row! (fr)

    var nb, i;
    if (l === 32768 || l === 65536 || l === 131072 || l === 262144 || l === 524288 || l === 1048576) {
      // MegaCart - not fully supported; load first 3K page so it at least boots
      this.app.megaxrom = 1; this.app.bank = 1;
      this.megarom = new Uint8Array(1048576);
      this.megarom.set(data.subarray(0, l), 0);
      var fill = l;
      while (fill < 1048576) { this.megarom.copyWithin(fill, 0, fill); fill *= 2; }
      this.rom_table[0].set(this.megarom.subarray(4096 * 255 + 1024, 4096 * 255 + 4096), 1024);
      nb = 1;
    } else if ((l % 3072) === 0) {
      this.app.three_k = 1;
      nb = l / 3072;
      for (i = nb - 1; i >= 0; i--) {
        this.rom_table[i].set(data.subarray((nb - 1 - i) * 3072, (nb - 1 - i) * 3072 + 3072), 1024);
      }
    } else {
      nb = l / 2048;
      if (nb === 2 && this.app.exrom) {
        this.extROM.set(data.subarray(0, 1024), 0);
        this.rom_table[0].set(data.subarray(1024, 4096), 1024);
      } else {
        // banks are stored in reverse file order (bank nb-1 first in file)
        for (i = nb - 1; i >= 0; i--) {
          var src = (nb - 1 - i) * 2048;
          this.rom_table[i].set(data.subarray(src, src + 2048), 1024);
          // simulate missing A10: mirror 2K page's second half
          this.rom_table[i].copyWithin(3072, 2048, 3072);
        }
      }
    }
    this.rom = this.rom_table[0];
    if (nb === 1) this.app.bank = 1;
    else if (nb === 2) this.app.bank = this.app.exrom ? 1 : 2;
    else if (nb === 4) this.app.bank = 3;
    else this.app.bank = 4;

    this.app.cartLoaded = true;
  };

  // ---------------- port / external memory ----------------
  P.snapline = function (pos, reg, t) {
    var snap = this.snap;
    if (pos < MAXLINES + MAXSNAP + MAXSNAP) {
      for (var i = 0; i < this.mxsnap; i++) {
        if (snap[((pos + MAXSNAP - i) * 256 + reg) * 2 + t]) return pos - i;
        if (snap[((pos + MAXSNAP + i) * 256 + reg) * 2 + t]) return pos + i;
      }
      snap[((pos + MAXSNAP) * 256 + reg) * 2 + t] = 1;
    }
    return pos;
  };

  P.read_t1 = function () {
    if ((this.h_clk > 16) || (this.master_clk > VBLCLK)) return 1;
    return 0;
  };

  P.write_p1 = function (d) {
    d &= 0xFF;
    if ((d & 0x80) !== (this.p1 & 0x80)) {
      var l = this.snapline(Math.floor(this.master_clk / 22.0 + 0.1), this.VDCwrite[0xA3], 1);
      var v = (this.VDCwrite[0xA3] & 0x7f) | (d & 0x80);
      for (var i = l; i < MAXLINES; i++) this.ColorVector[i] = v;
    }
    this.p1 = d;
    if (this.app.bank === 2) {
      this.rom = this.rom_table[(~this.p1) & 0x01];
    } else if (this.app.bank === 3) {
      this.rom = this.rom_table[(~this.p1) & 0x03];
    } else if (this.app.bank === 4) {
      this.rom = this.rom_table[(this.p1 & 1) ? 0 : this.romlatch];
    }
  };

  P.read_P2 = function () {
    if (!(this.p1 & 0x04)) {
      var si = this.p2 & 7;
      var so = 0xff;
      if (si < 6) {
        for (var col = 0; col < 8; col++) {
          var code = KEY_MAP[si][col];
          if (code && this.keys[code]) so = col ^ 0x07;
        }
      }
      if (so !== 0xff) {
        this.p2 = (this.p2 & 0x0F) | (so << 5);
      } else {
        this.p2 = this.p2 | 0xF0;
      }
    } else {
      this.p2 = this.p2 | 0xF0;
    }
    return this.p2 & 0xFF;
  };

  P.ext_read = function (adr) {
    adr &= 0xFF;
    var d, si, m, i;
    if (!(this.p1 & 0x08) && !(this.p1 & 0x40)) {
      switch (adr) {
        case 0xA1:
          d = this.VDCwrite[0xA0] & 0x02;
          if (this.master_clk > VBLCLK) d |= 0x08;
          if (this.h_clk < (LINECNT - 7)) d |= 0x01;
          if (this.sound_IRQ) d |= 0x04;
          this.sound_IRQ = 0;
          return d;
        case 0xA2:
          si = this.VDCwrite[0xA2]; m = 0x01; d = 0;
          for (i = 0; i < 8; i++) {
            if (si & m) {
              var ct = this.coltab;
              if (ct[1] & m) d |= (ct[1] & (m ^ 0xFF));
              if (ct[2] & m) d |= (ct[2] & (m ^ 0xFF));
              if (ct[4] & m) d |= (ct[4] & (m ^ 0xFF));
              if (ct[8] & m) d |= (ct[8] & (m ^ 0xFF));
              if (ct[0x10] & m) d |= (ct[0x10] & (m ^ 0xFF));
              if (ct[0x20] & m) d |= (ct[0x20] & (m ^ 0xFF));
              if (ct[0x80] & m) d |= (ct[0x80] & (m ^ 0xFF));
            }
            m <<= 1;
          }
          this.clearCollision();
          return d & 0xFF;
        case 0xA5:
          if (!(this.VDCwrite[0xA0] & 0x02)) return this.x_latch;
          this.x_latch = (this.h_clk * 12) & 0xFF;
          return this.x_latch;
        case 0xA4:
          if (!(this.VDCwrite[0xA0] & 0x02)) return this.y_latch;
          this.y_latch = Math.floor(this.master_clk / 22);
          if (this.y_latch > 241) this.y_latch = 0xFF;
          return this.y_latch & 0xFF;
        default:
          return this.VDCwrite[adr];
      }
    } else if (!(this.p1 & 0x10)) {
      if (this.app.megaxrom && (adr >= 0x80)) {
        if ((adr & 0x83) === 0x83) return 0xff;
        return this.extRAM[adr & 0x83];
      }
      return this.extRAM[adr & 0xFF];
    } else if (this.app.exrom && (this.p1 & 0x02)) {
      return this.extROM[((this.p2 << 8) | (adr & 0xFF)) & 0x3FF];
    } else if (this.app.megaxrom && !(this.p1 & 0x02) && !(this.p1 & 0x40)) {
      return this.megarom[(this.extRAM[0x81] << 12) | ((this.p2 & 0x0f) << 8) | (adr & 0xff)];
    }
    return 0;
  };

  P.in_bus = function () {
    var si = 0, d = 0xFF, jn;
    if ((this.p1 & 0x08) && (this.p1 & 0x10)) {
      if (!(this.p1 & 0x04)) si = this.p2 & 7;
      jn = (si === 1) ? 0 : 1;
      var j = this.joy[jn];
      if (j.up) d &= 0xFE;
      if (j.right) d &= 0xFD;
      if (j.down) d &= 0xFB;
      if (j.left) d &= 0xF7;
      if (j.fire) d &= 0xEF;
    }
    return d;
  };

  P.ext_write = function (dat, adr) {
    dat &= 0xFF; adr &= 0xFF;
    var i;
    if (!(this.p1 & 0x08)) {
      if (adr === 0xA0) {
        if ((this.VDCwrite[0xA0] & 0x02) && !(dat & 0x02)) {
          this.y_latch = Math.floor(this.master_clk / 22);
          this.x_latch = (this.h_clk * 12) & 0xFF;
          if (this.y_latch > 241) this.y_latch = 0xFF;
        }
        if ((this.master_clk <= VBLCLK) && (this.VDCwrite[0xA0] !== dat)) this.draw_region();
      } else if (adr === 0xA3) {
        var l = this.snapline(Math.floor(this.master_clk / 22.0 + 0.5), dat, 1);
        var v = (dat & 0x7f) | (this.p1 & 0x80);
        for (i = l; i < MAXLINES; i++) this.ColorVector[i] = v;
      } else if (adr === 0xAA) {
        for (i = Math.floor(this.master_clk / 22); i < MAXLINES; i++) this.AudioVector[i] = dat;
      } else if ((adr >= 0x40) && (adr <= 0x7f) && ((adr & 2) === 0)) {
        adr = adr & 0x71;
        if ((adr & 1) === 0) dat = dat & 0xfe;
        this.VDCwrite[adr] = this.VDCwrite[adr + 4] = this.VDCwrite[adr + 8] = this.VDCwrite[adr + 12] = dat;
      }
      this.VDCwrite[adr] = dat;
    } else if (!(this.p1 & 0x10) && !(this.p1 & 0x40)) {
      adr = adr & 0xFF;
      if (adr < 0x80) {
        this.extRAM[adr] = dat;
      } else {
        if (this.app.bank === 4) {
          this.romlatch = (~dat) & 7;
          this.rom = this.rom_table[(this.p1 & 1) ? 0 : this.romlatch];
        }
        // The Voice writes are ignored (voice module not emulated)
      }
    }
  };

  // stubbed 8243 expander ports P4-P7 (only used by The Voice)
  P.read_PB = function () { return 0; };
  P.write_PB = function () {};
  P.get_voice_status = function () { return 0; };

  // ---------------- interrupts ----------------
  P.make_psw = function () {
    this.psw = ((this.cy << 7) | this.ac | this.f0 | this.bs | 0x08) & 0xFF;
    this.psw = (this.psw | ((this.sp - 8) >> 1)) & 0xFF;
  };

  P.push = function (d) {
    this.intRAM[this.sp++] = d & 0xFF;
    if (this.sp > 23) this.sp = 8;
  };
  P.pull = function () {
    this.sp--;
    if (this.sp < 8) this.sp = 23;
    return this.intRAM[this.sp];
  };

  P.ext_IRQ = function () {
    this.int_clk = 5;
    if (this.xirq_en && !this.irq_ex) {
      this.irq_ex = 1;
      this.xirq_pend = 0;
      this.clk += 2;
      this.make_psw();
      this.push(this.pc & 0xFF);
      this.push(((this.pc & 0xF00) >> 8) | (this.psw & 0xF0));
      this.pc = 0x03;
      this.A11ff = this.A11;
      this.A11 = 0;
    }
    if (this.pendirq && !this.xirq_en) this.xirq_pend = 1;
  };

  P.tim_IRQ = function () {
    if (this.tirq_en && !this.irq_ex) {
      this.irq_ex = 2;
      this.tirq_pend = 0;
      this.clk += 2;
      this.make_psw();
      this.push(this.pc & 0xFF);
      this.push(((this.pc & 0xF00) >> 8) | (this.psw & 0xF0));
      this.pc = 0x07;
      this.A11ff = this.A11;
      this.A11 = 0;
    }
    if (this.pendirq && !this.tirq_en) this.tirq_pend = 1;
  };

  // ---------------- frame hooks ----------------
  P.handle_vbl = function () {
    if (this.onAudioFrame) this.onAudioFrame();
    this.draw_region();
    this.ext_IRQ();
    this.mstate = 1;
  };

  P.handle_evbl = function () {
    this.last_line = 0;
    this.master_clk -= this.evblclk;
    this.frame++;
    this.renderFrame();
    var i, cv, av;
    cv = (this.VDCwrite[0xA3] & 0x7f) | (this.p1 & 0x80);
    av = this.VDCwrite[0xAA];
    for (i = 0; i < MAXLINES; i++) { this.ColorVector[i] = cv; this.AudioVector[i] = av; }
    this.mstate = 0;
  };

  G7000.CSET = CSET;
  G7000.KLUGES = {};
  return (global.G7000 = G7000), (G7000.CONST = {
    LINECNT: LINECNT, MAXLINES: MAXLINES, VBLCLK: VBLCLK,
    EVBLCLK_NTSC: EVBLCLK_NTSC, EVBLCLK_PAL: EVBLCLK_PAL,
    FPS_NTSC: FPS_NTSC, FPS_PAL: FPS_PAL, BMPW: BMPW, BMPH: BMPH, WNDW: WNDW, WNDH: WNDH,
    PALETTE_O2: PALETTE_O2, PALETTE_VPP: PALETTE_VPP, KEY_MAP: KEY_MAP,
    COL: { SP0: COL_SP0, SP1: COL_SP1, SP2: COL_SP2, SP3: COL_SP3, VGRID: COL_VGRID, HGRID: COL_HGRID, VPP: COL_VPP, CHAR: COL_CHAR }
  });
})(typeof window !== 'undefined' ? window : this);
