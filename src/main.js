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
    keysReset: document.getElementById('keysReset'),
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
  var rebind = null;        // { player, dir } while awaiting a key press

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

  function setKey(code, down) {
    var acts = codeToActions[code];
    if (acts) for (var i = 0; i < acts.length; i++) emu.joy[acts[i][0]][acts[i][1]] = down ? 1 : 0;
    emu.keys[code] = down; // also feed the alphanumeric membrane keyboard
  }

  window.addEventListener('keydown', function (e) {
    // key rebinding capture takes priority
    if (rebind) {
      e.preventDefault();
      if (e.code !== 'Escape') assignKey(rebind.player, rebind.dir, e.code);
      endRebind();
      return;
    }
    // Alt+0 / AltGr+0 -> toggle fullscreen
    if (e.code === 'Digit0' && e.altKey) { e.preventDefault(); toggleFullscreen(); return; }
    if (e.repeat) { if (captureCodes[e.code]) e.preventDefault(); return; }
    setKey(e.code, true);
    if (captureCodes[e.code] && running) e.preventDefault();
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  });
  window.addEventListener('keyup', function (e) {
    setKey(e.code, false);
    if (captureCodes[e.code] && running) e.preventDefault();
  });
  window.addEventListener('blur', function () {
    emu.joy[0] = { up: 0, right: 0, down: 0, left: 0, fire: 0 };
    emu.joy[1] = { up: 0, right: 0, down: 0, left: 0, fire: 0 };
    emu.keys = {};
  });

  // on-screen controls (D-pad, fire, keypad)
  function bindHold(id, onDown, onUp) {
    var node = document.getElementById(id);
    if (!node) return;
    var press = function (e) { e.preventDefault(); onDown(); if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume(); };
    var release = function (e) { e.preventDefault(); onUp(); };
    node.addEventListener('pointerdown', press);
    node.addEventListener('pointerup', release);
    node.addEventListener('pointerleave', release);
    node.addEventListener('pointercancel', release);
  }
  ['up', 'down', 'left', 'right', 'fire'].forEach(function (dir) {
    bindHold('pad-' + dir,
      function () { emu.joy[0][dir] = 1; },
      function () { emu.joy[0][dir] = 0; });
  });
  document.querySelectorAll('#keypad button[data-code]').forEach(function (btn) {
    var code = btn.dataset.code;
    bindHold(btn.id || (btn.id = 'kp_' + code),
      function () { emu.keys[code] = true; },
      function () { emu.keys[code] = false; });
  });

  // ---------- buttons ----------
  el.reset.addEventListener('click', function () {
    if (!emu.app.cartLoaded) return;
    emu.reset(); running = true; el.pause.textContent = 'Pause';
    setStatus('Reset: ' + currentGame);
  });
  el.pause.addEventListener('click', function () {
    if (!ready) return;
    running = !running;
    el.pause.textContent = running ? 'Pause' : 'Resume';
    if (running) audio.ensure();
  });
  el.mute.addEventListener('click', function () {
    settings.soundEnabled = !settings.soundEnabled;
    applyAudioSettings();
    if (el.soundToggle) el.soundToggle.checked = settings.soundEnabled;
    saveSettings();
  });
  el.fileInput.addEventListener('change', function () { handleFiles(el.fileInput.files); el.fileInput.value = ''; });
  document.getElementById('pickBtn').addEventListener('click', function () { el.fileInput.click(); });

  // ---------- fullscreen ----------
  function toggleFullscreen() {
    var doc = document;
    var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (fsEl) {
      (doc.exitFullscreen || doc.webkitExitFullscreen || function () {}).call(doc);
    } else {
      var node = el.screenFrame;
      (node.requestFullscreen || node.webkitRequestFullscreen || function () {}).call(node);
    }
  }
  if (el.fullscreen) el.fullscreen.addEventListener('click', toggleFullscreen);

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

  var KEY_LABELS = { up: '▲ Up', down: '▼ Down', left: '◀ Left', right: '▶ Right', fire: '● Fire' };
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
  function buildKeyGrid() {
    el.keyGrid.innerHTML = '';
    [0, 1].forEach(function (player) {
      var head = document.createElement('div');
      head.className = 'key-head';
      head.textContent = 'Joystick ' + (player + 1);
      el.keyGrid.appendChild(head);
      DIRS.forEach(function (dir) {
        var row = document.createElement('div');
        row.className = 'key-row';
        var label = document.createElement('span');
        label.textContent = KEY_LABELS[dir];
        var btn = document.createElement('button');
        btn.className = 'key-btn';
        btn.dataset.player = player; btn.dataset.dir = dir;
        btn.textContent = prettyCode(settings.joy[player][dir]);
        btn.addEventListener('click', function () { startRebind(player, dir, btn); });
        row.appendChild(label); row.appendChild(btn);
        el.keyGrid.appendChild(row);
      });
    });
  }
  var rebindBtn = null;
  function startRebind(player, dir, btn) {
    if (rebindBtn) endRebind();
    rebind = { player: player, dir: dir };
    rebindBtn = btn;
    btn.classList.add('listening');
    btn.textContent = 'press a key… (Esc)';
  }
  function endRebind() {
    if (rebindBtn) { rebindBtn.classList.remove('listening'); }
    rebind = null; rebindBtn = null;
    buildKeyGrid();
  }
  function assignKey(player, dir, code) {
    // remove this code from any other action so a key isn't double-bound
    settings.joy.forEach(function (map) {
      DIRS.forEach(function (d) { if (map[d] === code) map[d] = null; });
    });
    settings.joy[player][dir] = code;
    rebuildInputMaps();
    saveSettings();
  }
  el.keysReset.addEventListener('click', function () {
    settings.joy = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.joy));
    rebuildInputMaps(); buildKeyGrid(); saveSettings();
  });

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

  window.G7Store.get('bios').then(function (buf) {
    if (buf) { try { loadBiosBytes(new Uint8Array(buf), false); } catch (e) {} }
  });
  window.G7Store.get('library').then(function (buf) {
    if (buf) {
      window.G7Store.get('libraryName').then(function (nm) {
        try { loadLibraryZip(nm || 'saved library', new Uint8Array(buf), false); } catch (e) {}
      });
    }
  });

  updateReady();
  setStatus('Drop the console BIOS (1 KB) and a games .zip anywhere on this page to begin.');

  // handle for debugging / automation
  window.G7sim = { emu: emu, audio: audio, settings: settings };
})();
