/*
 * G7sim - minimal ZIP reader. Parses the central directory synchronously and
 * inflates individual entries on demand using the browser's built-in
 * DecompressionStream('deflate-raw') - no third-party dependencies.
 */
(function (global) {
  'use strict';

  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }

  // Returns { entries: [{name, method, compSize, size, offset}], data }
  function parseZip(data) {
    // locate End Of Central Directory (scan backwards for signature 0x06054b50)
    var eocd = -1;
    for (var i = data.length - 22; i >= 0 && i >= data.length - 22 - 65536; i--) {
      if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a ZIP file (no end-of-central-directory record)');
    var count = u16(data, eocd + 10);
    var cdOffset = u32(data, eocd + 16);

    var entries = [];
    var p = cdOffset;
    for (var e = 0; e < count; e++) {
      if (u32(data, p) !== 0x02014b50) break;
      var method = u16(data, p + 10);
      var compSize = u32(data, p + 20);
      var size = u32(data, p + 24);
      var nameLen = u16(data, p + 28);
      var extraLen = u16(data, p + 30);
      var commentLen = u16(data, p + 32);
      var localOffset = u32(data, p + 42);
      var name = '';
      for (var c = 0; c < nameLen; c++) name += String.fromCharCode(data[p + 46 + c]);
      p += 46 + nameLen + extraLen + commentLen;
      if (name.charAt(name.length - 1) === '/') continue; // directory
      entries.push({ name: name, method: method, compSize: compSize, size: size, offset: localOffset });
    }
    return { entries: entries, data: data };
  }

  // Returns a Promise<Uint8Array> with the decompressed contents of an entry.
  function extractEntry(zip, entry) {
    var data = zip.data;
    var lo = entry.offset;
    if (u32(data, lo) !== 0x04034b50) return Promise.reject(new Error('Bad local header for ' + entry.name));
    var nameLen = u16(data, lo + 26);
    var extraLen = u16(data, lo + 28);
    var start = lo + 30 + nameLen + extraLen;
    var comp = data.subarray(start, start + entry.compSize);

    if (entry.method === 0) {
      return Promise.resolve(comp.slice());
    }
    if (entry.method === 8) {
      if (typeof DecompressionStream === 'undefined') {
        return Promise.reject(new Error('This browser lacks DecompressionStream; cannot inflate ' + entry.name));
      }
      var ds = new DecompressionStream('deflate-raw');
      var writer = ds.writable.getWriter();
      writer.write(comp);
      writer.close();
      return new Response(ds.readable).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }
    return Promise.reject(new Error('Unsupported compression method ' + entry.method + ' for ' + entry.name));
  }

  global.G7Zip = { parseZip: parseZip, extractEntry: extractEntry };
})(typeof window !== 'undefined' ? window : this);
