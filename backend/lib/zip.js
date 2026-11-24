// Minimal read-only ZIP reader (central directory + zlib). No dependencies. Used to validate DOCX/PPTX uploads and to read word/document.xml.
const zlib = require('zlib');
const MAX_ENTRIES = 5000, MAX_INFLATED = 25 * 1024 * 1024;
function entries(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('Not a ZIP file');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a ZIP file');
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) throw new Error('ZIP has too many entries');
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt ZIP directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    out.set(buf.toString('utf8', p + 46, p + 46 + nl), { method, csize, usize, off });
    p += 46 + nl + el + cl;
  }
  return out;
}
function read(buf, e) {
  if (buf.readUInt32LE(e.off) !== 0x04034b50) throw new Error('Corrupt ZIP entry');
  const start = e.off + 30 + buf.readUInt16LE(e.off + 26) + buf.readUInt16LE(e.off + 28), data = buf.subarray(start, start + e.csize);
  if (e.usize > MAX_INFLATED) throw new Error('ZIP entry too large');
  if (e.method === 0) return data;
  if (e.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_INFLATED });
  throw new Error('Unsupported ZIP compression');
}
const names = buf => [...entries(buf).keys()];
const readEntry = (buf, name) => { const e = entries(buf).get(name); return e ? read(buf, e) : null; };
module.exports = { names, readEntry };
