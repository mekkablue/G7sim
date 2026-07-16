/*
 * G7sim - UI glue: drag & drop loading, ZIP browsing, input, and the run loop.
 */
(function () {
  'use strict';

  var emu = new window.G7000();
  var audio = new window.G7000Audio();
  var C = window.G7000.CONST;

  var canvas = document.getElementById('screen');
  var ctx = canvas.getContext('2d', { alpha: false });
  var imgData = ctx.createImageData(C.WNDW, C.WNDH);

  var running = false;
  var ready = false;          // bios + cart loaded
  var currentGame = null;
  var library = [];           // {name, kind:'rom'|'zip', bytes?, zip?, entry?}
  var zipRef = null, zipBytes = null;

  var el = {
    status: document.getElementById('status'),
    biosState: document.getElementById('biosState'),
    list: document.getElementById('gameList'),
    listWrap: document.getElementById('libraryPane'),
    drop: document.getElementById('dropOverlay'),
    fileInput: document.getElementById('fileInput'),
    title: document.getElementById('gameTitle'),
    mute: document.getElementById('muteBtn'),
    reset: document.getElementById('resetBtn'),
    pause: document.getElementById('pauseBtn'),
    fullscreen: document.getElementById('fullscreenBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    settings: document.getElementById('settingsPanel'),
    settingsClose: document.getElementById('settingsClose'),
    soundToggle: document.getElementById('soundToggle'),
    volume: document.getElementById('volumeSlider'),
    volumeLabel: document.getElementById('volumeLabel'),
    keyGrid: document.getElementById('keyGrid'),
    keyPrompt: document.getElementById('keyPrompt'),
    keysReset: document.getElementById('keysReset'),
    flipJoy: document.getElementById('flipJoy'),
    screenFrame: document.querySelector('.screen-frame')
  };

  // ---------- rendering ----------
  emu.onVideoFrame = function () {
    imgData.data.set(emu.frameBuffer);
    ctx.putImageData(imgData, 0, 0);
  };
  emu.onAudioFrame = function () { audio.frame(emu); };

  function setStatus(msg) { el.status.textContent = msg; }

  // ---------- run loop ----------
  var last = 0, acc = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!running || !ready) { last = ts; return; }
    if (!last) last = ts;
    var dt = (ts - last) / 1000; last = ts;
    acc += dt;
    var spf = 1 / (emu.fps || 60);
    var steps = 0;
    while (acc >= spf && steps < 4) { emu.cpu_exec(); acc -= spf; steps++; }
    if (acc > 0.25) acc = 0;
  }
  requestAnimationFrame(loop);

  function updateReady() {
    ready = emu.app.biosLoaded && emu.app.cartLoaded;
    el.pause.disabled = !ready;
    el.reset.disabled = !ready;
    canvas.classList.toggle('on', ready);
  }

  // ---------- loading ----------
  function loadBiosBytes(bytes, persist) {
    var crc = emu.loadBIOS(bytes);
    var names = {
      0x8016A315: 'Odyssey 2 / G7000 BIOS',
      0xE20A9F41: 'Videopac+ G7400 BIOS',
      0xA318E8D6: 'Videopac C52 BIOS',
      0x11647CA5: 'Jopac (VP+) BIOS'
    };
    var known = names[crc >>> 0];
    el.biosState.textContent = known ? ('✔ ' + known) : '⚠ BIOS loaded (unrecognised, CRC ' + hex(crc) + ')';
    el.biosState.classList.toggle('ok', !!known);
    if (persist) window.G7Store.set('bios', bytes.slice().buffer);
    updateReady();
  }

  function startGame(name, bytes) {
    try {
      emu.loadCart(bytes);
      emu.reset();
    } catch (err) {
      setStatus('Error: ' + err.message);
      return;
    }
    currentGame = name;
    el.title.textContent = name;
    el.title.title = name; // full name on hover/long-press since it's truncated with an ellipsis
    updateReady();
    if (!emu.app.biosLoaded) {
      setStatus('Loaded "' + name + '" - now drop the console BIOS (1 KB) to play.');
      running = false;
    } else {
      setStatus('Running: ' + name + '   (' + (emu.fps === 50 ? 'PAL 50Hz' : 'NTSC 60Hz') + ', CRC ' + hex(emu.app.crc) + ')');
      running = true;
      audio.ensure();
    }
    el.pause.textContent = 'Pause';
    highlightSelected(name);
  }

  function hex(n) { return '0x' + ('00000000' + (n >>> 0).toString(16).toUpperCase()).slice(-8); }

  // ---------- file dispatch ----------
  function handleFiles(files) {
    Array.prototype.forEach.call(files, function (f) {
      var reader = new FileReader();
      reader.onload = function () { handleBuffer(f.name, new Uint8Array(reader.result)); };
      reader.readAsArrayBuffer(f);
    });
  }

  function isZip(bytes) {
    return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  }

  function handleBuffer(name, bytes) {
    if (isZip(bytes)) {
      loadLibraryZip(name, bytes, true);
      return;
    }
    if (bytes.length === 1024) {
      loadBiosBytes(bytes, true);
      setStatus('BIOS installed.' + (emu.app.cartLoaded ? ' Press Start.' : ' Now drop a game or a games .zip.'));
      if (emu.app.cartLoaded && emu.app.biosLoaded) { emu.reset(); running = true; audio.ensure(); }
      return;
    }
    if ((bytes.length % 1024) === 0 && bytes.length >= 2048) {
      // single cartridge dump
      addToLibrary({ name: name, kind: 'rom', bytes: bytes }, true);
      startGame(name, bytes);
      return;
    }
    setStatus('Unrecognised file "' + name + '" (' + bytes.length + ' bytes). Drop a 1 KB BIOS, a cartridge dump, or a games .zip.');
  }

  function validRomSize(sz) {
    return sz >= 2048 && (sz % 1024) === 0 && sz <= 1048576;
  }

  function loadLibraryZip(name, bytes, persist) {
    var zip;
    try { zip = window.G7Zip.parseZip(bytes); }
    catch (err) { setStatus('ZIP error: ' + err.message); return; }
    zipRef = zip; zipBytes = bytes;
    library = library.filter(function (g) { return g.kind !== 'zip'; });
    var added = 0;
    zip.entries.forEach(function (entry) {
      if (!validRomSize(entry.size)) return;
      library.push({ name: baseName(entry.name), kind: 'zip', zip: zip, entry: entry });
      added++;
    });
    library.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    renderList();
    setStatus('Loaded ' + added + ' games from "' + name + '". ' +
      (emu.app.biosLoaded ? 'Pick one from the list.' : 'Now drop the console BIOS (1 KB) too.'));
    if (persist) { window.G7Store.set('library', bytes.slice().buffer); window.G7Store.set('libraryName', name); }
  }

  function baseName(p) {
    p = p.replace(/^.*[\/\\]/, '');
    return p.replace(/\.(bin|rom|o2|dat)$/i, '');
  }

  function addToLibrary(item, front) {
    if (!library.some(function (g) { return g.name === item.name && g.kind === 'rom'; })) {
      if (front) library.unshift(item); else library.push(item);
    }
    renderList();
  }

  function renderList() {
    el.list.innerHTML = '';
    if (!library.length) {
      el.listWrap.classList.add('empty');
      return;
    }
    el.listWrap.classList.remove('empty');
    library.forEach(function (g) {
      var li = document.createElement('li');
      li.textContent = g.name;
      li.title = g.name;
      li.dataset.name = g.name;
      if (g.name === currentGame) li.classList.add('selected');
      li.addEventListener('click', function () { selectGame(g); });
      el.list.appendChild(li);
    });
  }

  function highlightSelected(name) {
    Array.prototype.forEach.call(el.list.children, function (li) {
      li.classList.toggle('selected', li.dataset.name === name);
    });
  }

  function selectGame(g) {
    if (g.kind === 'rom') { startGame(g.name, g.bytes); return; }
    setStatus('Loading ' + g.name + ' …');
    window.G7Zip.extractEntry(g.zip, g.entry).then(function (bytes) {
      startGame(g.name, bytes);
    }).catch(function (err) { setStatus('Extract error: ' + err.message); });
  }

  // ---------- input & settings ----------
  var DIRS = ['up', 'down', 'left', 'right', 'fire'];
  var DEFAULT_SETTINGS = {
    soundEnabled: true,
    volume: 60,
    joy: [
      { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Space' },
      { up: 'Numpad8', down: 'Numpad2', left: 'Numpad4', right: 'Numpad6', fire: 'Numpad0' }
    ]
  };
  var settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  var codeToActions = {};   // code -> [[player, dir], ...]
  var captureCodes = {};    // codes we swallow (to stop page scroll) while running
  var rebind = null;        // { player, dir } while awaiting a single key press
  var rebindSeq = null;     // { player, index } while walking through all 5 keys

  function rebuildInputMaps() {
    codeToActions = {};
    captureCodes = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1 };
    settings.joy.forEach(function (map, player) {
      DIRS.forEach(function (dir) {
        var code = map[dir];
        if (!code) return;
        (codeToActions[code] = codeToActions[code] || []).push([player, dir]);
        captureCodes[code] = 1;
      });
    });
  }

  function applyAudioSettings() {
    audio.setVolume(settings.volume);
    audio.muted = !settings.soundEnabled;
    audio.setMuted(audio.muted);
    if (el.mute) el.mute.textContent = settings.soundEnabled ? '🔈 Sound on' : '🔇 Sound off';
  }

  function saveSettings() { window.G7Store.set('settings', settings); }

  function isLetter(code) { return code.length === 4 && code.charCodeAt(0) === 75 /*K*/ && code.slice(0, 3) === 'Key'; }

  function setKey(code, down, keyboardOnly) {
    if (!keyboardOnly) {
      var acts = codeToActions[code];
      if (acts) for (var i = 0; i < acts.length; i++) emu.joy[acts[i][0]][acts[i][1]] = down ? 1 : 0;
    }
    emu.keys[code] = down; // also feed the alphanumeric membrane keyboard
  }

  window.addEventListener('keydown', function (e) {
    // sequential "configure all keys" capture takes priority
    if (rebindSeq) {
      e.preventDefault();
      if (e.code === 'Escape') { endSequence(); return; }
      var dir = SEQ_ORDER[rebindSeq.index];
      assignKey(rebindSeq.player, dir, e.code);
      rebindSeq.index++;
      if (rebindSeq.index >= SEQ_ORDER.length) endSequence();
      else refreshSeqUI();
      return;
    }
    // single-key rebinding capture
    if (rebind) {
      e.preventDefault();
      if (e.code !== 'Escape') assignKey(rebind.player, rebind.dir, e.code);
      endRebind();
      return;
    }
    // Keyboard shortcuts. The modifier is Option on macOS and AltGr on Windows;
    // both set e.altKey (AltGr additionally sets ctrlKey), so e.altKey covers all.
    if (e.altKey) {
      switch (e.code) {
        case 'Digit0': e.preventDefault(); toggleFullscreen(); return;
        case 'KeyP': e.preventDefault(); togglePause(); return;
        case 'KeyS': e.preventDefault(); toggleSound(); return;
        case 'KeyR': e.preventDefault(); doReset(); return;
        case 'KeyJ': if (e.shiftKey) { e.preventDefault(); flipJoysticks(); return; } break;
      }
    }
    if (e.repeat) { if (captureCodes[e.code]) e.preventDefault(); return; }
    // Shift + a letter A-Z is always keyboard entry (e.g. typing hi-score names),
    // never a joystick action, even if that key is bound to a joystick direction.
    var keyboardOnly = e.shiftKey && isLetter(e.code);
    setKey(e.code, true, keyboardOnly);
    if (!keyboardOnly && captureCodes[e.code] && running) e.preventDefault();
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  });
  window.addEventListener('keyup', function (e) {
    // Always clear both joystick and keyboard state so nothing sticks.
    setKey(e.code, false);
    if (captureCodes[e.code] && running) e.preventDefault();
  });
  window.addEventListener('blur', function () {
    emu.joy[0] = { up: 0, right: 0, down: 0, left: 0, fire: 0 };
    emu.joy[1] = { up: 0, right: 0, down: 0, left: 0, fire: 0 };
    emu.keys = {};
  });

  // ---------- help modal ----------
  var helpPanel = document.getElementById('helpPanel');
  function openHelp() { helpPanel.classList.add('show'); }
  function closeHelp() { helpPanel.classList.remove('show'); }
  document.getElementById('helpBtn').addEventListener('click', openHelp);
  document.getElementById('helpLink').addEventListener('click', openHelp);
  document.getElementById('helpClose').addEventListener('click', closeHelp);
  helpPanel.addEventListener('click', function (e) { if (e.target === helpPanel) closeHelp(); });
  window.addEventListener('keydown', function (e) { if (e.code === 'Escape') closeHelp(); });

  // ---------- buttons ----------
  function doReset() {
    if (!emu.app.cartLoaded) return;
    emu.reset(); running = true; el.pause.textContent = 'Pause';
    setStatus('Reset: ' + currentGame);
  }
  el.reset.addEventListener('click', doReset);
  function togglePause() {
    if (!ready) return;
    running = !running;
    el.pause.textContent = running ? 'Pause' : 'Resume';
    if (running) audio.ensure();
    setStatus((running ? 'Resumed' : 'Paused') + (currentGame ? ': ' + currentGame : ''));
  }
  function toggleSound() {
    settings.soundEnabled = !settings.soundEnabled;
    applyAudioSettings();
    if (el.soundToggle) el.soundToggle.checked = settings.soundEnabled;
    saveSettings();
  }
  el.pause.addEventListener('click', togglePause);
  el.mute.addEventListener('click', toggleSound);
  el.fileInput.addEventListener('change', function () { handleFiles(el.fileInput.files); el.fileInput.value = ''; });
  document.getElementById('pickBtn').addEventListener('click', function () { el.fileInput.click(); });

  // ---------- fullscreen ----------
  // iOS Safari has no Fullscreen API for plain elements, so fall back to a
  // fixed-position "simulated" fullscreen there (class fs-sim on the frame).
  function fsActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement) ||
      el.screenFrame.classList.contains('fs-sim');
  }
  // While (pseudo-)fullscreen is active, disable page-level pinch/double-tap
  // zoom: on iOS the fs-sim overlay is position:fixed, so a zoom triggered
  // outside the touch controls can't be panned/scrolled back out afterwards.
  function setZoomLock(on) {
    document.documentElement.classList.toggle('g7-lock-zoom', on);
  }
  // iOS Safari's collapsible address/tab bar means 100vw/100vh on a
  // position:fixed element doesn't reliably track the actually-visible area:
  // the overlay can end up sized to a stale viewport, leaving a strip of the
  // real page visible around it. Measuring window.visualViewport (which
  // WebKit updates exactly when its chrome shows/hides) and applying it as
  // explicit inline pixel dimensions sidesteps the viewport-unit bug
  // entirely. Only applies to the fs-sim fallback - real :fullscreen is
  // sized correctly by the browser itself.
  function syncFsSimSize() {
    var node = el.screenFrame;
    if (!node.classList.contains('fs-sim')) {
      node.style.width = '';
      node.style.height = '';
      return;
    }
    var vv = window.visualViewport;
    node.style.width = (vv ? vv.width : window.innerWidth) + 'px';
    node.style.height = (vv ? vv.height : window.innerHeight) + 'px';
  }
  function toggleFullscreen() {
    var doc = document, node = el.screenFrame;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      (doc.exitFullscreen || doc.webkitExitFullscreen || function () {}).call(doc);
    } else if (node.classList.contains('fs-sim')) {
      node.classList.remove('fs-sim');
    } else if (node.requestFullscreen) {
      node.requestFullscreen().catch(function () { node.classList.add('fs-sim'); window.scrollTo(0, 0); });
    } else if (node.webkitRequestFullscreen) {
      node.webkitRequestFullscreen();
    } else {
      node.classList.add('fs-sim');
      window.scrollTo(0, 0); // normalize scroll before measuring the visual viewport
    }
    setTimeout(updateTouchMode, 50);
  }
  if (el.fullscreen) el.fullscreen.addEventListener('click', toggleFullscreen);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateTouchMode);
    window.visualViewport.addEventListener('scroll', updateTouchMode);
  }

  // Extra safety net: some iOS Safari versions still fire double-tap-zoom on
  // a fixed-position overlay despite touch-action:none. Suppress any second
  // touchend that lands within the standard double-tap window.
  var lastTouchEnd = 0;
  document.addEventListener('touchend', function (e) {
    if (!fsActive()) return;
    var now = Date.now();
    if (now - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // Best-effort haptic feedback. iOS Safari has never implemented the
  // Vibration API (Apple's choice, not a bug), so this is a silent no-op
  // there; it works today on Android Chrome and will pick up any future
  // WebKit support automatically since it's feature-detected.
  function hapticTap(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
  }

  // ---------- mobile portrait touch controls ----------
  // Shown in fullscreen on a touch device in portrait: screen pinned to the
  // top, a draggable 8-way joystick under the right thumb, a fire button for
  // the left thumb (top-aligned with the stick), and a swap button in the
  // bottom-left corner that toggles which console joystick the touch controls
  // drive. Long-pressing the screen shows a temporary number pad (for the
  // BIOS "select game" prompt); long-pressing the swap button offers to exit
  // fullscreen instead of swapping.
  var touch = { player: 0, forced: null };
  var touchStick = document.getElementById('touchStick');
  var touchKnob = document.getElementById('touchKnob');
  var touchFire = document.getElementById('touchFire');
  var touchSwap = document.getElementById('touchSwap');
  var touchPlayerNo = document.getElementById('touchPlayerNo');
  var touchNumpad = document.getElementById('touchNumpad');
  var touchHoldMenu = document.getElementById('touchHoldMenu');
  var touchMenuReset = document.getElementById('touchMenuReset');
  var touchMenuSound = document.getElementById('touchMenuSound');
  var touchMenuExit = document.getElementById('touchMenuExit');

  function isTouchPortrait() {
    if (touch.forced !== null) return touch.forced;
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var portrait = window.innerHeight >= window.innerWidth;
    return coarse && portrait;
  }
  function updateTouchMode() {
    syncFsSimSize();
    setZoomLock(fsActive());
    var on = fsActive() && isTouchPortrait();
    el.screenFrame.classList.toggle('touch-mode', on);
    if (!on) {
      hideNumpad();
      hideHoldMenu();
      releaseStick();
      emu.joy[touch.player].fire = 0;
    }
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
    document.addEventListener(ev, updateTouchMode);
  });
  window.addEventListener('resize', updateTouchMode);
  window.addEventListener('orientationchange', updateTouchMode);

  // --- 8-way draggable joystick, snapped to 9 discrete positions (8
  // directions + centre) since the console joystick is digital, not analog ---
  var stickPointer = null;
  var lastStickDir = '';
  function knobUnitVector(j) {
    var ux = (j.right ? 1 : 0) - (j.left ? 1 : 0);
    var uy = (j.down ? 1 : 0) - (j.up ? 1 : 0);
    var len = Math.sqrt(ux * ux + uy * uy);
    return len ? { x: ux / len, y: uy / len } : { x: 0, y: 0 };
  }
  function snapKnob(j) {
    var r = touchStick.clientWidth / 2;
    var v = knobUnitVector(j);
    touchKnob.style.transform = 'translate(' + (v.x * r * 0.7) + 'px,' + (v.y * r * 0.7) + 'px)';
    var dir = (j.up ? 'u' : '') + (j.down ? 'd' : '') + (j.left ? 'l' : '') + (j.right ? 'r' : '');
    if (dir !== lastStickDir) {
      if (dir) hapticTap(10); // pulse only when engaging a (new) direction, not on release
      lastStickDir = dir;
    }
  }
  function releaseStick() {
    stickPointer = null;
    var j = emu.joy[touch.player];
    j.up = j.down = j.left = j.right = 0;
    snapKnob(j);
  }
  function applyStick(dx, dy) {
    var j = emu.joy[touch.player];
    j.up = j.down = j.left = j.right = 0;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var r = touchStick.clientWidth / 2;
    var dead = Math.max(12, r * 0.25);
    if (dist >= dead) {
      // 8 sectors of 45°, diagonals set two directions
      var a = Math.atan2(dy, dx) * 180 / Math.PI; // -180..180, 0 = right
      if (a > -112.5 && a < -67.5) { j.up = 1; }
      else if (a >= -67.5 && a <= -22.5) { j.up = 1; j.right = 1; }
      else if (a > -22.5 && a < 22.5) { j.right = 1; }
      else if (a >= 22.5 && a <= 67.5) { j.down = 1; j.right = 1; }
      else if (a > 67.5 && a < 112.5) { j.down = 1; }
      else if (a >= 112.5 && a <= 157.5) { j.down = 1; j.left = 1; }
      else if (a > 157.5 || a < -157.5) { j.left = 1; }
      else { j.up = 1; j.left = 1; }
    }
    snapKnob(j);
  }
  touchStick.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    stickPointer = e.pointerId;
    try { touchStick.setPointerCapture(e.pointerId); } catch (err) {}
    var rc = touchStick.getBoundingClientRect();
    applyStick(e.clientX - (rc.left + rc.width / 2), e.clientY - (rc.top + rc.height / 2));
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  });
  touchStick.addEventListener('pointermove', function (e) {
    if (e.pointerId !== stickPointer) return;
    e.preventDefault();
    var rc = touchStick.getBoundingClientRect();
    applyStick(e.clientX - (rc.left + rc.width / 2), e.clientY - (rc.top + rc.height / 2));
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    touchStick.addEventListener(ev, function (e) {
      if (e.pointerId !== stickPointer) return;
      e.preventDefault();
      releaseStick();
    });
  });

  // --- fire button ---
  touchFire.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    emu.joy[touch.player].fire = 1;
    hapticTap(15);
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    touchFire.addEventListener(ev, function (e) { e.preventDefault(); emu.joy[touch.player].fire = 0; });
  });

  // --- swap button: tap swaps which console joystick the touch controls
  // drive; holding it instead pops up a small menu (Reset / Sound / Exit
  // Fullscreen) so none of those can be triggered by an accidental tap ---
  function setTouchPlayer(p) {
    var j = emu.joy[touch.player];
    j.up = j.down = j.left = j.right = j.fire = 0;
    touch.player = p;
    touchPlayerNo.textContent = String(p + 1);
  }
  function updateTouchMenuLabels() {
    touchMenuSound.textContent = settings.soundEnabled ? '🔈 Sound on' : '🔇 Sound off';
  }
  function showHoldMenu() {
    updateTouchMenuLabels();
    touchHoldMenu.classList.add('show');
    armHoldMenuIdle();
  }
  function hideHoldMenu() {
    touchHoldMenu.classList.remove('show');
    if (holdMenuIdle) { clearTimeout(holdMenuIdle); holdMenuIdle = null; }
  }
  var holdMenuIdle = null;
  function armHoldMenuIdle() {
    if (holdMenuIdle) clearTimeout(holdMenuIdle);
    holdMenuIdle = setTimeout(hideHoldMenu, 5000);
  }
  var swapPressTimer = null, swapHeld = false;
  touchSwap.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    swapHeld = false;
    swapPressTimer = setTimeout(function () { swapHeld = true; showHoldMenu(); }, 600);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    touchSwap.addEventListener(ev, function (e) {
      e.preventDefault();
      if (swapPressTimer) { clearTimeout(swapPressTimer); swapPressTimer = null; }
      if (!swapHeld) setTouchPlayer(touch.player === 0 ? 1 : 0);
    });
  });
  touchMenuReset.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    hideHoldMenu();
    doReset();
  });
  touchMenuSound.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    toggleSound();
    hideHoldMenu();
  });
  touchMenuExit.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    hideHoldMenu();
    toggleFullscreen();
  });

  // --- long-press on the screen: temporary number pad ---
  var pressTimer = null, pressStart = null, numpadIdle = null;
  function showNumpad() {
    touchNumpad.classList.add('show');
    armNumpadIdle();
  }
  function hideNumpad() {
    touchNumpad.classList.remove('show');
    if (numpadIdle) { clearTimeout(numpadIdle); numpadIdle = null; }
  }
  function armNumpadIdle() {
    if (numpadIdle) clearTimeout(numpadIdle);
    numpadIdle = setTimeout(hideNumpad, 5000);
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!el.screenFrame.classList.contains('touch-mode')) return;
    e.preventDefault();
    pressStart = { x: e.clientX, y: e.clientY };
    pressTimer = setTimeout(function () { pressTimer = null; showNumpad(); }, 450);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!pressTimer || !pressStart) return;
    if (Math.abs(e.clientX - pressStart.x) + Math.abs(e.clientY - pressStart.y) > 14) {
      clearTimeout(pressTimer); pressTimer = null;
    }
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    canvas.addEventListener(ev, function () {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    });
  });
  touchNumpad.querySelectorAll('button').forEach(function (btn) {
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (btn.dataset.close) { hideNumpad(); return; }
      emu.keys[btn.dataset.code] = true;
      hapticTap(10);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      btn.addEventListener(ev, function (e) {
        e.preventDefault();
        if (btn.dataset.code) {
          emu.keys[btn.dataset.code] = false;
          hideNumpad(); // a number was chosen - dismiss right away
        }
      });
    });
  });

  // ---------- settings panel ----------
  function openSettings() { el.settings.classList.add('show'); }
  function closeSettings() { el.settings.classList.remove('show'); }
  if (el.settingsBtn) el.settingsBtn.addEventListener('click', openSettings);
  if (el.settingsClose) el.settingsClose.addEventListener('click', closeSettings);
  el.settings.addEventListener('click', function (e) { if (e.target === el.settings) closeSettings(); });

  el.soundToggle.addEventListener('change', function () {
    settings.soundEnabled = el.soundToggle.checked;
    applyAudioSettings(); saveSettings();
  });
  el.volume.addEventListener('input', function () {
    settings.volume = parseInt(el.volume.value, 10) || 0;
    el.volumeLabel.textContent = settings.volume + '%';
    audio.setVolume(settings.volume);
  });
  el.volume.addEventListener('change', saveSettings);

  var SEQ_ORDER = ['up', 'down', 'left', 'right', 'fire'];
  var DIR_GLYPH = { up: '↑', down: '↓', left: '←', right: '→', fire: '●' };
  var DIR_NAME = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', fire: 'FIRE' };
  var ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  function prettyCode(code) {
    if (!code) return '—';
    if (ARROWS[code]) return ARROWS[code];
    return code
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace(/^Numpad/, 'Num ')
      .replace(/^ShiftLeft$/, 'L-Shift').replace(/^ShiftRight$/, 'R-Shift')
      .replace(/^ControlLeft$/, 'L-Ctrl').replace(/^ControlRight$/, 'R-Ctrl');
  }

  // Build a geometric (D-pad shaped) key configurator per joystick.
  function buildKeyGrid() {
    el.keyGrid.innerHTML = '';
    [0, 1].forEach(function (player) {
      var block = document.createElement('div');
      block.className = 'joy-config';

      var title = document.createElement('div');
      title.className = 'joy-title';
      var name = document.createElement('span');
      name.textContent = 'Joystick ' + (player + 1);
      var cfg = document.createElement('button');
      cfg.className = 'link-btn seq-btn';
      cfg.textContent = 'Configure all…';
      cfg.dataset.player = player;
      cfg.addEventListener('click', function () { startSequence(player); });
      title.appendChild(name); title.appendChild(cfg);
      block.appendChild(title);

      var pad = document.createElement('div');
      pad.className = 'dpad-grid';
      SEQ_ORDER.forEach(function (dir) {
        var cell = document.createElement('button');
        cell.className = 'dcell d-' + dir;
        cell.dataset.player = player; cell.dataset.dir = dir;
        cell.innerHTML = '<span class="dglyph">' + DIR_GLYPH[dir] + '</span>' +
          '<span class="dkey">' + escapeHtml(prettyCode(settings.joy[player][dir])) + '</span>';
        cell.addEventListener('click', function () { startRebind(player, dir, cell); });
        pad.appendChild(cell);
      });
      block.appendChild(pad);
      el.keyGrid.appendChild(block);
    });
    if (!rebindSeq && !rebind) setPrompt('');
  }

  function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function cellFor(player, dir) {
    return el.keyGrid.querySelector('.dcell[data-player="' + player + '"][data-dir="' + dir + '"]');
  }
  function setPrompt(msg) { if (el.keyPrompt) el.keyPrompt.textContent = msg; }
  function clearListening() {
    Array.prototype.forEach.call(el.keyGrid.querySelectorAll('.dcell.listening'),
      function (c) { c.classList.remove('listening'); });
  }

  // --- single key rebind ---
  function startRebind(player, dir, cell) {
    endSequence(true); endRebind(true);
    rebind = { player: player, dir: dir };
    clearListening();
    if (cell) cell.classList.add('listening');
    setPrompt('Press a key for Joystick ' + (player + 1) + ' ' + DIR_NAME[dir] + '  (Esc to cancel)');
  }
  function endRebind(silent) {
    rebind = null;
    if (!silent) { clearListening(); buildKeyGrid(); }
  }

  // --- guided sequential rebind (all 5 keys in order) ---
  function startSequence(player) {
    endRebind(true);
    rebindSeq = { player: player, index: 0 };
    refreshSeqUI();
  }
  function refreshSeqUI() {
    clearListening();
    var dir = SEQ_ORDER[rebindSeq.index];
    var cell = cellFor(rebindSeq.player, dir);
    if (cell) cell.classList.add('listening');
    setPrompt('Joystick ' + (rebindSeq.player + 1) + ' — press key for ' + DIR_NAME[dir] +
      '  (' + (rebindSeq.index + 1) + '/' + SEQ_ORDER.length + ', Esc to stop)');
  }
  function endSequence(silent) {
    rebindSeq = null;
    clearListening();
    if (!silent) { setPrompt('Done.'); buildKeyGrid(); }
  }

  function assignKey(player, dir, code) {
    // remove this code from any other action so a key isn't double-bound
    settings.joy.forEach(function (map) {
      DIRS.forEach(function (d) { if (map[d] === code) map[d] = null; });
    });
    settings.joy[player][dir] = code;
    rebuildInputMaps();
    saveSettings();
    // live-update the affected cell's label without losing capture highlight
    var cell = cellFor(player, dir);
    if (cell) { var k = cell.querySelector('.dkey'); if (k) k.textContent = prettyCode(code); }
  }

  el.keysReset.addEventListener('click', function () {
    endSequence(true); endRebind(true);
    settings.joy = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.joy));
    rebuildInputMaps(); buildKeyGrid(); saveSettings();
    setPrompt('Reset to defaults.');
  });

  function flipJoysticks() {
    endSequence(true); endRebind(true);
    var tmp = settings.joy[0];
    settings.joy[0] = settings.joy[1];
    settings.joy[1] = tmp;
    rebuildInputMaps(); buildKeyGrid(); saveSettings();
    setPrompt('Swapped Joystick 1 ⇄ Joystick 2.');
    setStatus('Flipped joysticks (Joystick 1 ⇄ 2).');
  }
  el.flipJoy.addEventListener('click', flipJoysticks);

  function applyAllSettingsToUI() {
    el.soundToggle.checked = settings.soundEnabled;
    el.volume.value = settings.volume;
    el.volumeLabel.textContent = settings.volume + '%';
    buildKeyGrid();
    applyAudioSettings();
  }

  // ---------- drag & drop ----------
  var dragDepth = 0;
  window.addEventListener('dragenter', function (e) { e.preventDefault(); dragDepth++; el.drop.classList.add('show'); });
  window.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  window.addEventListener('dragleave', function (e) { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; el.drop.classList.remove('show'); } });
  window.addEventListener('drop', function (e) {
    e.preventDefault(); dragDepth = 0; el.drop.classList.remove('show');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });

  // ---------- restore persisted settings, BIOS + library ----------
  rebuildInputMaps();
  applyAllSettingsToUI();
  window.G7Store.get('settings').then(function (s) {
    if (s && typeof s === 'object') {
      if (typeof s.soundEnabled === 'boolean') settings.soundEnabled = s.soundEnabled;
      if (typeof s.volume === 'number') settings.volume = s.volume;
      if (s.joy && s.joy[0] && s.joy[1]) {
        [0, 1].forEach(function (p) {
          DIRS.forEach(function (d) { if (typeof s.joy[p][d] === 'string' || s.joy[p][d] === null) settings.joy[p][d] = s.joy[p][d]; });
        });
      }
      rebuildInputMaps();
      applyAllSettingsToUI();
    }
  });

  // Try to fetch a bundled default file placed next to index.html (rom/…).
  // fetch() doesn't work from file:// origins, so only attempt over http(s).
  // Resolves to a Uint8Array on success, or null (with a console note) otherwise.
  function fetchDefault(path) {
    if (location.protocol === 'file:') return Promise.resolve(null);
    var url;
    try { url = new URL(path, location.href).href; } catch (e) { url = path; }
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r || !r.ok) {
        console.info('[G7sim] ' + path + ' not auto-loaded (HTTP ' + (r ? r.status : '?') + ' at ' + url + ')');
        return null;
      }
      return r.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }).catch(function (e) {
      console.info('[G7sim] ' + path + ' not auto-loaded (' + (e && e.message ? e.message : e) + ')');
      return null;
    });
  }

  // A console BIOS is 1 KB; accept a larger dump too (only the first 1 KB is used),
  // so a slightly padded file or a multi-region dump still works on any server.
  function tryLoadBios(bytes) {
    if (!bytes || bytes.length < 1024) return false;
    try { loadBiosBytes(bytes, false); return true; }
    catch (e) { console.warn('[G7sim] failed to load BIOS bytes: ' + e); return false; }
  }

  // Fallback: fetch rom/rom.zip, unzip in memory, and load a BIOS entry from it.
  function loadBiosFromZip() {
    return fetchDefault('rom/rom.zip').then(function (zbytes) {
      if (!zbytes || !zbytes.length) return false;
      var zip;
      try { zip = window.G7Zip.parseZip(zbytes); }
      catch (e) { console.warn('[G7sim] rom/rom.zip is not a valid ZIP: ' + e.message); return false; }
      // pick the most BIOS-like entry: a named hint wins, then an exact 1 KB size,
      // then the smallest file that is still at least 1 KB.
      var cands = zip.entries.filter(function (en) { return en.size >= 1024; });
      if (!cands.length) { console.warn('[G7sim] rom/rom.zip contains no file >= 1 KB.'); return false; }
      cands.sort(function (a, b) {
        var ah = /o2rom|bios|rom\.bin/i.test(a.name) ? 0 : 1;
        var bh = /o2rom|bios|rom\.bin/i.test(b.name) ? 0 : 1;
        if (ah !== bh) return ah - bh;
        var a1 = a.size === 1024 ? 0 : 1, b1 = b.size === 1024 ? 0 : 1;
        if (a1 !== b1) return a1 - b1;
        return a.size - b.size;
      });
      var entry = cands[0];
      return window.G7Zip.extractEntry(zip, entry).then(function (bytes) {
        if (tryLoadBios(bytes)) {
          console.info('[G7sim] BIOS loaded from rom/rom.zip (' + entry.name + ').');
          return true;
        }
        console.warn('[G7sim] rom/rom.zip entry "' + entry.name + '" is not a usable BIOS.');
        return false;
      }).catch(function (e) { console.warn('[G7sim] could not extract BIOS from rom/rom.zip: ' + e.message); return false; });
    });
  }

  // BIOS: persisted copy wins; otherwise try rom/rom.bin, then fall back to rom/rom.zip.
  window.G7Store.get('bios').then(function (buf) {
    if (buf) { try { loadBiosBytes(new Uint8Array(buf), false); } catch (e) {} return; }
    fetchDefault('rom/rom.bin').then(function (bytes) {
      if (bytes && bytes.length >= 1024) {
        if (bytes.length !== 1024) console.info('[G7sim] rom/rom.bin is ' + bytes.length + ' bytes; using the first 1 KB as the BIOS.');
        tryLoadBios(bytes);
        return;
      }
      if (bytes && bytes.length < 1024) {
        console.warn('[G7sim] rom/rom.bin is ' + bytes.length + ' bytes (too small for a BIOS); trying rom/rom.zip.');
      }
      // rom.bin missing or unusable -> try the zipped BIOS
      loadBiosFromZip();
    });
  });

  // Library: persisted archive wins; otherwise fall back to rom/games.zip if present.
  window.G7Store.get('library').then(function (buf) {
    if (buf) {
      window.G7Store.get('libraryName').then(function (nm) {
        try { loadLibraryZip(nm || 'saved library', new Uint8Array(buf), false); } catch (e) {}
      });
      return;
    }
    fetchDefault('rom/games.zip').then(function (bytes) {
      if (bytes && bytes.length) {
        try { loadLibraryZip('games.zip', bytes, false); } catch (e) {}
      }
    });
  });

  updateReady();
  setStatus('Drop the console BIOS (1 KB) and a games .zip anywhere on this page to begin.');

  // handle for debugging / automation
  window.G7sim = { emu: emu, audio: audio, settings: settings, touch: touch, updateTouchMode: updateTouchMode };
})();
