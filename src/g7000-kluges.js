/*
 * G7sim - per-cartridge timing/quirk tweaks, ported from O2EM's do_kluges().
 * Each entry is keyed by the cartridge CRC32 and overrides emulation defaults
 * that particular title needs to display or run correctly.
 */
(function () {
  'use strict';
  var G = window.G7000;

  // field meanings: pendirq, enahirq, useforen, regionoff, mxsnap, sproff,
  // tweakedaudio, video (0/1 -> setVideoMode), evblclk (explicit override)
  var T = {
    0xA7344D1F: { pendirq: 1, regionoff: 0, video: 1 },                 // Atlantis
    0xFB83171E: { pendirq: 1, enahirq: 0, regionoff: 1, mxsnap: 3, video: 0 }, // Blockout
    0xD38153F6: { pendirq: 1, enahirq: 0, regionoff: 1, mxsnap: 3, video: 0 }, // Blockout (fr)
    0x881CEAE4: { pendirq: 1, mxsnap: 3, video: 1, evblclk: 6100 },     // Wall Street
    0x9E42E766: { useforen: 1, mxsnap: 0 },                             // Turtles
    0x1C750349: { useforen: 1, mxsnap: 0 },                             // Turtles (EU)
    0x202F2749: { useforen: 1, regionoff: 0 },                          // Q*bert
    0x06861A9C: { useforen: 1, video: 1 },                              // Flashpoint 5
    0x5216771A: { regionoff: 1, tweakedaudio: 1 },                      // Popeye
    0x0C2E4811: { regionoff: 11 },                                      // Out of this World
    0x67069924: { regionoff: 11 },                                      // Smithereens
    0x44D1A8A5: { regionoff: 11 },                                      // Smithereens (EU)
    0x2391C2FB: { regionoff: 11 },                                      // Smithereens +
    0xBB4AD548: { regionoff: 11 },                                      // Smithereens mod 1
    0x25057C11: { regionoff: 11 },                                      // Smithereens mod 2
    0xB936BD78: { regionoff: 12 },                                      // Type & Tell
    0xAD8B9AE0: { regionoff: 2 },                                       // Type & Tell mod 1
    0x5C02BEE6: { regionoff: 2 },                                       // Type & Tell mod 2
    0xDC30AD3D: { regionoff: 10 },                                      // Dynasty!
    0x7810BAD5: { regionoff: 8 },                                       // Dynasty! (EU)
    0xD0BC4EE6: { regionoff: 12, mxsnap: 3, tweakedaudio: 1, video: 1, evblclk: 7642 }, // Frogger
    0xA57D84F3: { regionoff: 8, mxsnap: 3, tweakedaudio: 1 },           // Frogger BR
    0x825976A9: { regionoff: 0, video: 1, evblclk: 7642 },              // Mousing Cat 8k
    0xF390BFEC: { regionoff: 0, video: 1, evblclk: 7642 },              // Mousing Cat 4k
    0x61A350E6: { regionoff: 0, video: 1, evblclk: 7642 },              // Mousing Cat (fr)
    0x3BFEF56B: { regionoff: 1, mxsnap: 6, video: 1 },                  // Four in 1 Row!
    0x7C747245: { regionoff: 1, mxsnap: 6, video: 1 },                  // Four in 1 Row! mod
    0x9B5E9356: { regionoff: 1, mxsnap: 6, video: 1 },                  // Four in 1 Row! (fr)
    0x6CEBAB74: { regionoff: 12 },                                      // P.T. Barnum (EU)
    0xE7B26A56: { regionoff: 12 },                                      // P.T. Barnum (EU extra)
    0xA57E1724: { mxsnap: 12, video: 0, regionoff: 5, sproff: 1 },      // Catch the Ball
    0xBE4FF48E: { mxsnap: 12, video: 0 },                               // Catch the Ball mod
    0xFD179F6D: { mxsnap: 3 },                                          // Clay Pigeon!
    0x9C9DDDF9: { mxsnap: 3 },                                          // Verkehr
    0x95936B07: { mxsnap: 3 },                                          // Super Cobra
    0x26517E77: { video: 1, evblclk: 6100, regionoff: 12 },             // Commando Noturno
    0x2DCB77F0: { video: 1, evblclk: 8000 },                            // Depth Charge
    0xF6882734: { video: 1, evblclk: 8000 },                            // Marksman
    0xD62814A3: { evblclk: 12000 },                                     // Pick Axe Pete
    0xB2FFB353: { evblclk: 12000 },                                     // Pick Axe Pete +
    0x81C20196: { evblclk: 12000 },                                     // Pick Axe Pete + mod
    0xAFB23F89: { tweakedaudio: 1 },                                    // Musician
    0xC4134DF8: { tweakedaudio: 1, video: 1 },                          // Helicopter Rescue +
    0x0D2D721D: { tweakedaudio: 1, video: 1 },                          // Trans American Rally +
    0xD3B09FEC: { sproff: 1 },                                          // Volleyball!
    0x551E38A2: { sproff: 1 },                                          // Volleyball! (fr)
    // PAL-timed titles
    0x39E31BF0: { video: 1 }, 0x92D0177B: { video: 1 }, 0x3351FEDA: { video: 1 },
    0x40AE062D: { video: 1 }, 0xD158EEBA: { video: 1 }, 0x26B0FF5B: { video: 1 },
    0xDF36683F: { video: 1 }, 0xAF307559: { video: 1 }, 0x9585D511: { video: 1 },
    0x58FA6766: { video: 1 }, 0x39989464: { video: 1 }, 0x68560DC7: { video: 1 },
    0x020FCA15: { video: 1 }, 0x9D72D4E9: { video: 1 }, 0xB2F0F0B4: { video: 1 },
    0x0B2DEB61: { video: 1 }, 0x313547EB: { video: 1 },
    // NTSC-forced titles
    0x9BFC3E01: { video: 0 }, 0x50AF9D45: { video: 0 }, 0x9884EF36: { video: 0 },
    0x4A578DFE: { video: 0 }, 0x863D5E2D: { video: 0 }
  };

  Object.keys(T).forEach(function (key) {
    var crc = (key >>> 0);
    var cfg = T[key];
    G.KLUGES[crc] = function () {
      if ('pendirq' in cfg) this.pendirq = cfg.pendirq;
      if ('enahirq' in cfg) this.enahirq = cfg.enahirq;
      if ('useforen' in cfg) this.useforen = cfg.useforen;
      if ('regionoff' in cfg) this.regionoff = cfg.regionoff;
      if ('mxsnap' in cfg) this.mxsnap = cfg.mxsnap;
      if ('sproff' in cfg) this.sproff = cfg.sproff;
      if ('tweakedaudio' in cfg) this.tweakedaudio = cfg.tweakedaudio;
      if ('video' in cfg) this.setVideoMode(cfg.video);
      if ('evblclk' in cfg) this.evblclk = cfg.evblclk;
    };
  });
})();
