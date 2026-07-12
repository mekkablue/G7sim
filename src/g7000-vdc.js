/*
 * G7sim - Intel 8244/8245 Video Display Controller rendering.
 * Faithful port of O2EM's vdc.c (grid, characters, quads, sprites, collision).
 */
(function () {
  'use strict';
  var C = window.G7000.CONST;
  var BMPW = C.BMPW, BMPH = C.BMPH, WNDW = C.WNDW, WNDH = C.WNDH;
  var LINECNT = C.LINECNT, MAXLINES = C.MAXLINES;
  var COL = C.COL;
  var P = window.G7000.prototype;

  P.setVideoMode = function (t) {
    if (t) { this.evblclk = C.EVBLCLK_PAL; this.fps = C.FPS_PAL; }
    else { this.evblclk = C.EVBLCLK_NTSC; this.fps = C.FPS_NTSC; }
  };

  P.clearCollision = function () {
    this.col.fill(0);
    var ct = this.coltab;
    ct[0x01] = ct[0x02] = ct[0x04] = ct[0x08] = 0;
    ct[0x10] = ct[0x20] = ct[0x40] = ct[0x80] = 0;
  };

  // pixel writer with collision accumulation
  P.mputvid = function (ad, len, d, c) {
    if (ad > this.clip_low && ad < this.clip_high) {
      var vs = this.vscreen, col = this.col, ct = this.coltab;
      for (var i = 0; i < len; i++) {
        vs[ad] = d;
        col[ad] |= c;
        ct[c] |= col[ad];
        ad++;
      }
    }
  };

  P.draw_region = function () {
    var i;
    var mc = this.master_clk, ro = this.regionoff, crc = this.app.crc;
    if (ro === 0xffff) {
      i = Math.floor(mc / (LINECNT - 1)) - 5;
    } else {
      i = Math.floor(mc / 22) + ro;
    }
    i = this.snapline(i, this.VDCwrite[0xA0], 0);
    if (crc === 0xA7344D1F) { i = (Math.floor(mc / 22) + ro) + 6; i = this.snapline(i, this.VDCwrite[0xA0], 0) + 6; } // Atlantis
    if (crc === 0xD0BC4EE6) { i = (Math.floor(mc / 24) + ro) - 6; i = this.snapline(i, this.VDCwrite[0xA0], 0) + 7; } // Frogger
    if (crc === 0x26517E77) { i = (Math.floor(mc / 22) + ro); i = this.snapline(i, this.VDCwrite[0xA0], 0) - 5; } // Comando Noturno
    if (crc === 0xA57E1724) { i = Math.floor(mc / (LINECNT - 1)) - 5; i = this.snapline(i, this.VDCwrite[0xA0], 0) - 3; } // Catch the ball

    if (i < 0) i = 0;
    this.clip_low = this.last_line * BMPW;
    this.clip_high = i * BMPW;
    if (this.clip_high > BMPW * BMPH) this.clip_high = BMPW * BMPH;
    if (this.clip_low < 0) this.clip_low = 0;
    if (this.clip_low < this.clip_high) this.draw_display();
    this.last_line = i;
  };

  P.draw_grid = function () {
    var VDC = this.VDCwrite, CV = this.ColorVector;
    var pnt, pn1, mask, d, j, i, x, w, color;

    if (VDC[0xA0] & 0x40) {
      for (j = 0; j < 9; j++) {
        pnt = ((j * 24) + 24) * BMPW;
        for (i = 0; i < 9; i++) {
          pn1 = pnt + (i * 32) + 20;
          color = CV[j * 24 + 24];
          this.mputvid(pn1, 4, (color & 0x07) | ((color & 0x40) >> 3) | (color & 0x80 ? 0 : 8), COL.HGRID);
          color = CV[j * 24 + 25];
          this.mputvid(pn1 + BMPW, 4, (color & 0x07) | ((color & 0x40) >> 3) | (color & 0x80 ? 0 : 8), COL.HGRID);
          color = CV[j * 24 + 26];
          this.mputvid(pn1 + BMPW * 2, 4, (color & 0x07) | ((color & 0x40) >> 3) | (color & 0x80 ? 0 : 8), COL.HGRID);
        }
      }
    }

    mask = 0x01;
    for (j = 0; j < 9; j++) {
      pnt = ((j * 24) + 24) * BMPW;
      for (i = 0; i < 9; i++) {
        pn1 = pnt + (i * 32) + 20;
        if ((pn1 + BMPW * 3 >= this.clip_low) && (pn1 <= this.clip_high)) {
          d = VDC[0xC0 + i];
          if (j === 8) { d = VDC[0xD0 + i]; mask = 1; }
          if (d & mask) {
            color = CV[j * 24 + 24];
            this.mputvid(pn1, 36, (color & 0x07) | ((color & 0x40) >> 3) | (color & 0x80 ? 0 : 8), COL.HGRID);
            color = CV[j * 24 + 25];
            this.mputvid(pn1 + BMPW, 36, (color & 0x07) | ((color & 0x40) >> 3) | (color & 0x80 ? 0 : 8), COL.HGRID);
            color = CV[j * 24 + 26];
            this.mputvid(pn1 + BMPW * 2, 36, (color & 0x07) | ((color & 0x40) >> 3) | (color & 0x80 ? 0 : 8), COL.HGRID);
          }
        }
      }
      mask = mask << 1;
    }

    w = 4;
    if (VDC[0xA0] & 0x80) w = 32;
    for (j = 0; j < 10; j++) {
      pnt = j * 32;
      mask = 0x01;
      d = VDC[0xE0 + j];
      for (x = 0; x < 8; x++) {
        pn1 = pnt + (((x * 24) + 24) * BMPW) + 20;
        if (d & mask) {
          for (i = 0; i < 24; i++) {
            if ((pn1 >= this.clip_low) && (pn1 <= this.clip_high)) {
              color = CV[x * 24 + 24 + i];
              this.mputvid(pn1, w, (color & 0x07) | ((color & 0x40) >> 3) | (color & 0x80 ? 0 : 8), COL.VGRID);
            }
            pn1 += BMPW;
          }
        }
        mask = mask << 1;
      }
    }
  };

  P.draw_char = function (ypos, xpos, chr, col) {
    var CSET = window.G7000.CSET;
    var j, c, cl, d1, y, b, n, pnt;
    y = (ypos & 0xFE);
    pnt = y * BMPW + ((xpos - 8) * 2) + 20;
    ypos = ypos >> 1;
    n = 8 - (ypos % 8) - (chr % 8);
    if (n < 3) n = n + 7;

    if ((pnt + BMPW * 2 * n >= this.clip_low) && (pnt <= this.clip_high)) {
      c = (chr | 0) + ypos;
      if (col & 0x01) c += 256;
      if (c > 511) c = c - 512;
      cl = ((col & 0x0E) >> 1);
      cl = ((cl & 2) | ((cl & 1) << 2) | ((cl & 4) >> 2)) + 8;
      if ((y > 0) && (y < 232) && (xpos < 157)) {
        for (j = 0; j < n; j++) {
          d1 = CSET[(c + j) & 0x1ff];
          for (b = 0; b < 8; b++) {
            if (d1 & 0x80) {
              if ((xpos - 8 + b < 160) && (y + j < 240)) {
                this.mputvid(pnt, 2, cl, COL.CHAR);
                this.mputvid(pnt + BMPW, 2, cl, COL.CHAR);
              }
            }
            pnt += 2;
            d1 = (d1 << 1) & 0xFF;
          }
          pnt += BMPW * 2 - 16;
        }
      }
    }
  };

  P.draw_quad = function (ypos, xpos, cp0l, cp0h, cp1l, cp1h, cp2l, cp2h, cp3l, cp3h) {
    var CSET = window.G7000.CSET;
    var chp = [0, 0, 0, 0], col = [0, 0, 0, 0];
    var pnt, off, i, j, lines;
    pnt = (ypos & 0xfe) * BMPW + ((xpos - 8) * 2) + 20;
    if (pnt > this.clip_high) return;
    chp[0] = cp0l | ((cp0h & 1) << 8);
    chp[1] = cp1l | ((cp1h & 1) << 8);
    chp[2] = cp2l | ((cp2h & 1) << 8);
    chp[3] = cp3l | ((cp3h & 1) << 8);
    for (i = 0; i < 4; i++) chp[i] = (chp[i] + (ypos >> 1)) & 0x1ff;
    lines = 8 - (chp[3] + 1) % 8;
    if (pnt + BMPW * 2 * lines < this.clip_low) return;
    col[0] = (cp0h & 0xe) >> 1; col[1] = (cp1h & 0xe) >> 1;
    col[2] = (cp2h & 0xe) >> 1; col[3] = (cp3h & 0xe) >> 1;
    for (i = 0; i < 4; i++) col[i] = ((col[i] & 2) | ((col[i] & 1) << 2) | ((col[i] & 4) >> 2)) + 8;
    while (lines-- > 0) {
      off = 0;
      for (i = 0; i < 4; i++) {
        for (j = 0; j < 8; j++) {
          if ((CSET[chp[i]] & (1 << (7 - j))) && (off < BMPW)) {
            this.mputvid(pnt + off, 2, col[i], COL.CHAR);
            this.mputvid(pnt + off + BMPW, 2, col[i], COL.CHAR);
          }
          off += 2;
        }
        off += 16;
      }
      for (i = 0; i < 4; i++) chp[i] = (chp[i] + 1) & 0x1ff;
      pnt += BMPW * 2;
    }
  };

  P.draw_display = function () {
    var VDC = this.VDCwrite, CV = this.ColorVector, vs = this.vscreen;
    var i, j, x, sm, t, y, b, d1, cl, c, pnt, pnt2;

    for (i = Math.floor(this.clip_low / BMPW); i < Math.floor(this.clip_high / BMPW); i++) {
      var bg = ((CV[i] & 0x38) >> 3) | (CV[i] & 0x80 ? 0 : 8);
      vs.fill(bg, i * BMPW, i * BMPW + BMPW);
    }

    if (VDC[0xA0] & 0x08) this.draw_grid();

    if (this.useforen && !(VDC[0xA0] & 0x20)) return;

    for (i = 0x10; i < 0x40; i += 4) this.draw_char(VDC[i], VDC[i + 1], VDC[i + 2], VDC[i + 3]);

    for (i = 0x40; i < 0x80; i += 0x10)
      this.draw_quad(VDC[i], VDC[i + 1], VDC[i + 2], VDC[i + 3], VDC[i + 6], VDC[i + 7],
        VDC[i + 10], VDC[i + 11], VDC[i + 14], VDC[i + 15]);

    c = 8;
    for (i = 12; i >= 0; i -= 4) {
      pnt2 = 0x80 + (i * 2);
      y = VDC[i];
      x = VDC[i + 1] - 8;
      t = VDC[i + 2];
      cl = ((t & 0x38) >> 3);
      cl = ((cl & 2) | ((cl & 1) << 2) | ((cl & 4) >> 2)) + 8;
      if ((x < 164) && (y > 0) && (y < 232)) {
        pnt = y * BMPW + (x * 2) + 20 + this.sproff;
        if (t & 4) {
          if ((pnt + BMPW * 32 >= this.clip_low) && (pnt <= this.clip_high)) {
            for (j = 0; j < 8; j++) {
              sm = (((j % 2 === 0) && (((t >> 1) & 1) !== (t & 1))) || ((j % 2 === 1) && (t & 1))) ? 1 : 0;
              d1 = VDC[pnt2++];
              for (b = 0; b < 8; b++) {
                if (d1 & 0x01) {
                  if ((x + b + sm < 159) && (y + j < 247)) {
                    this.mputvid(sm + pnt, 4, cl, c);
                    this.mputvid(sm + pnt + BMPW, 4, cl, c);
                    this.mputvid(sm + pnt + 2 * BMPW, 4, cl, c);
                    this.mputvid(sm + pnt + 3 * BMPW, 4, cl, c);
                  }
                }
                pnt += 4;
                d1 = d1 >> 1;
              }
              pnt += BMPW * 4 - 32;
            }
          }
        } else {
          if ((pnt + BMPW * 16 >= this.clip_low) && (pnt <= this.clip_high)) {
            for (j = 0; j < 8; j++) {
              sm = (((j % 2 === 0) && (((t >> 1) & 1) !== (t & 1))) || ((j % 2 === 1) && (t & 1))) ? 1 : 0;
              d1 = VDC[pnt2++];
              for (b = 0; b < 8; b++) {
                if (d1 & 0x01) {
                  if ((x + b + sm < 160) && (y + j < 249)) {
                    this.mputvid(sm + pnt, 2, cl, c);
                    this.mputvid(sm + pnt + BMPW, 2, cl, c);
                  }
                }
                pnt += 2;
                d1 = d1 >> 1;
              }
              pnt += BMPW * 2 - 16;
            }
          }
        }
      }
      c = c >> 1;
    }
  };

  // convert the visible crop of vscreen (indices 0-15) to RGBA
  P.renderFrame = function () {
    var pal = this.app.vpp ? C.PALETTE_VPP : C.PALETTE_O2;
    var vs = this.vscreen, fb = this.frameBuffer;
    var di = 0;
    for (var y = 0; y < WNDH; y++) {
      var srow = (y + 2) * BMPW + 7;
      for (var xx = 0; xx < WNDW; xx++) {
        var rgb = pal[vs[srow + xx] & 0x0F];
        fb[di++] = (rgb >> 16) & 0xFF;
        fb[di++] = (rgb >> 8) & 0xFF;
        fb[di++] = rgb & 0xFF;
        fb[di++] = 0xFF;
      }
    }
    if (this.onVideoFrame) this.onVideoFrame();
  };

  // Per-game timing tweaks (O2EM do_kluges). Keyed on cartridge CRC32.
  P.doKluges = function () {
    var crc = this.app.crc;
    var k = window.G7000.KLUGES;
    if (k[crc]) k[crc].call(this);
  };
})();
