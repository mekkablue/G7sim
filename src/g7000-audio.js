/*
 * G7sim - 8244 audio.
 *  - G7000.prototype.audio_process(): sample synthesis ported from O2EM audio.c
 *    (shift-register tone/noise generator, drives the sound interrupt).
 *  - G7000Audio: a small Web Audio sink that plays the per-frame sample chunks.
 */
(function () {
  'use strict';
  var G = window.G7000;
  var P = G.prototype;
  var MAXLINES = G.CONST.MAXLINES;

  var SAMPLE_RATE = 44100;
  var PERIOD1 = 11, PERIOD2 = 44;
  var AUD_CTRL = 0xAA, AUD_D0 = 0xA7, AUD_D1 = 0xA8, AUD_D2 = 0xA9;

  // Fill `buffer` (Float32Array) with `len` samples in roughly [0,1].
  P.audio_process = function (buffer, len) {
    var VDC = this.VDCwrite, AV = this.AudioVector;
    var aud_data = (VDC[AUD_D2] | (VDC[AUD_D1] << 8) | (VDC[AUD_D0] << 16)) >>> 0;
    var intena = VDC[0xA0] & 0x04;
    var pnt = 0, cnt = 0, pos, volume, enabled, period, re_circ, noise, rndbit;

    noise = VDC[AUD_CTRL] & 0x10;
    enabled = VDC[AUD_CTRL] & 0x80;
    rndbit = (enabled && noise) ? (Math.random() < 0.5 ? 0 : 1) : 0;

    while (pnt < len) {
      pos = this.tweakedaudio ? ((pnt / 3) | 0) : (MAXLINES - 1);
      volume = AV[pos] & 0x0F;
      enabled = AV[pos] & 0x80;
      period = (AV[pos] & 0x20) ? PERIOD1 : PERIOD2;
      re_circ = AV[pos] & 0x40;

      var byte = enabled ? (((aud_data & 0x01) ^ rndbit) * (0x10 * volume)) : 0;
      buffer[pnt++] = byte / 255;
      cnt++;

      if (cnt >= period) {
        cnt = 0;
        aud_data = re_circ ? ((aud_data >>> 1) | ((aud_data & 1) << 23)) : (aud_data >>> 1);
        rndbit = (enabled && noise) ? (Math.random() < 0.5 ? 0 : 1) : 0;
        if (enabled && intena && !this.sound_IRQ) {
          this.sound_IRQ = 1;
          this.ext_IRQ();
        }
      }
    }
  };

  // ---- Web Audio playback driver ----
  function G7000Audio() {
    this.ctx = null;
    this.nextTime = 0;
    this.gain = 0.6;
    this.dc = 0;      // DC-blocker state
    this.prev = 0;
    this.muted = false;
    this.scratch = new Float32Array(4096);
  }

  G7000Audio.prototype.ensure = function () {
    if (!this.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  };

  // Called once per emulated frame: generate & schedule this frame's audio.
  G7000Audio.prototype.frame = function (emu) {
    if (this.muted || !this.ensure()) return;
    var rate = SAMPLE_RATE;
    var n = Math.round(rate / (emu.fps || 60));
    if (n > this.scratch.length) this.scratch = new Float32Array(n);
    var raw = this.scratch;
    emu.audio_process(raw, n);

    // Resample-free: create a 44100Hz buffer; browser mixes to device rate.
    var buf = this.ctx.createBuffer(1, n, rate);
    var out = buf.getChannelData(0);
    // DC blocker + gain to convert unipolar PWM to a clean AC signal.
    var dc = this.dc, prev = this.prev, g = this.gain;
    for (var i = 0; i < n; i++) {
      var x = raw[i];
      var y = x - prev + 0.995 * dc;
      dc = y; prev = x;
      out[i] = y * g;
    }
    this.dc = dc; this.prev = prev;

    var src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    var now = this.ctx.currentTime;
    if (this.nextTime < now + 0.01) this.nextTime = now + 0.02; // recover from underrun
    if (this.nextTime > now + 0.4) return; // too far ahead: drop (tab was backgrounded)
    src.start(this.nextTime);
    this.nextTime += n / rate;
  };

  G7000Audio.prototype.setMuted = function (m) {
    this.muted = m;
    if (m && this.ctx) this.nextTime = 0;
  };

  window.G7000Audio = G7000Audio;
})();
