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
    pause: document.getElementById('pauseBtn')
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

  // ---------- input ----------
  var JOY1 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Space: 'fire', ShiftLeft: 'fire' };
  var JOY2 = { Numpad8: 'up', Numpad2: 'down', Numpad4: 'left', Numpad6: 'right', Numpad0: 'fire', Numpad5: 'fire' };
  var CAPTURE = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1 };

  function setKey(code, down) {
    var handled = false;
    if (JOY1[code] !== undefined) { emu.joy[0][JOY1[code]] = down ? 1 : 0; handled = true; }
    if (JOY2[code] !== undefined) { emu.joy[1][JOY2[code]] = down ? 1 : 0; handled = true; }
    // feed alphanumeric keyboard matrix as well
    emu.keys[code] = down;
    return handled;
  }

  window.addEventListener('keydown', function (e) {
    if (e.repeat) { if (CAPTURE[e.code]) e.preventDefault(); return; }
    setKey(e.code, true);
    if (CAPTURE[e.code] && running) e.preventDefault();
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  });
  window.addEventListener('keyup', function (e) {
    setKey(e.code, false);
    if (CAPTURE[e.code] && running) e.preventDefault();
  });
  window.addEventListener('blur', function () {
    // release everything so keys don't stick when focus is lost
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
    audio.muted = !audio.muted;
    audio.setMuted(audio.muted);
    el.mute.textContent = audio.muted ? '🔇 Sound off' : '🔈 Sound on';
  });
  el.fileInput.addEventListener('change', function () { handleFiles(el.fileInput.files); el.fileInput.value = ''; });
  document.getElementById('pickBtn').addEventListener('click', function () { el.fileInput.click(); });

  // ---------- drag & drop ----------
  var dragDepth = 0;
  window.addEventListener('dragenter', function (e) { e.preventDefault(); dragDepth++; el.drop.classList.add('show'); });
  window.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  window.addEventListener('dragleave', function (e) { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; el.drop.classList.remove('show'); } });
  window.addEventListener('drop', function (e) {
    e.preventDefault(); dragDepth = 0; el.drop.classList.remove('show');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });

  // ---------- restore persisted BIOS + library ----------
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
})();
