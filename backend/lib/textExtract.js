// Text extraction for resumes. DOCX: built-in (ZIP + XML). PDF: `pdf-parse` when installed (handles real-world fonts), otherwise a built-in
// extractor that only understands simple PDFs (Flate streams + literal/hex text operators). Anything we cannot read is reported, never invented.
const zlib = require('zlib'), zip = require('./zip');
const decodeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');
function docxText(buf) {
  const xml = zip.readEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('This DOCX has no readable document body');
  return decodeXml(xml.toString('utf8')
    .replace(/<w:p\b[^>]*\/>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<w:(br|cr)\b[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n')
    .replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, '$1').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function a85(str) { // ASCII85Decode
  const s = str.replace(/\s/g, '').replace(/^<~/, '').replace(/~>.*$/, ''), out = []; let grp = [];
  for (const ch of s) {
    if (ch === 'z' && !grp.length) { out.push(0, 0, 0, 0); continue; }
    grp.push(ch.charCodeAt(0) - 33);
    if (grp.length === 5) { let n = 0; for (const g of grp) n = n * 85 + g; out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255); grp = []; }
  }
  if (grp.length > 1) { const k = grp.length; while (grp.length < 5) grp.push(84); let n = 0; for (const g of grp) n = n * 85 + g; out.push(...[(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].slice(0, k - 1)); }
  return Buffer.from(out);
}
function pdfString(s) { // PDF literal string body -> text
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' })[c] ?? (/^[0-7]+$/.test(c) ? String.fromCharCode(parseInt(c, 8)) : ''));
}
function pdfTextBuiltin(buf) {
  const raw = buf.toString('latin1'), chunks = [], re = /stream\r?\n/g; let m;
  while ((m = re.exec(raw))) {
    const end = raw.indexOf('endstream', re.lastIndex); if (end < 0) break;
    const head = raw.slice(Math.max(0, m.index - 300), m.index);
    let body = buf.subarray(re.lastIndex, end);
    const dict = head.slice(head.lastIndexOf('obj')), filters = (/\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict) || ['', ''])[1].match(/\/\w+/g) || [];
    try {
      for (const f of filters) {
        if (f === '/ASCII85Decode') body = a85(body.toString('latin1'));
        else if (f === '/FlateDecode') body = zlib.inflateSync(body, { maxOutputLength: 20 * 1024 * 1024 });
        else throw new Error('unsupported filter');
      }
    } catch { continue; }
    const s = body.toString('latin1'); if (!/\bBT\b/.test(s)) continue;
    for (const bt of s.match(/BT[\s\S]*?ET/g) || []) {
      let line = '';
      const tok = /\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|(T\*|T[dD]|ET)/g; let t;
      while ((t = tok.exec(bt))) {
        if (t[1] !== undefined) line += (t[1].match(/\(((?:[^()\\]|\\.)*)\)|-?\d+\.?\d*/g) || []).map(p => p[0] === '(' ? pdfString(p.slice(1, -1)) : (parseFloat(p) < -200 ? ' ' : '')).join('');
        else if (t[2] !== undefined) line += pdfString(t[2]);
        else if (t[3] !== undefined) line += Buffer.from(t[3].replace(/\s/g, ''), 'hex').toString('latin1');
        else if (t[4] && t[4] !== 'ET') line += '\n';
      }
      if (line.trim()) chunks.push(line.trim());
    }
  }
  return chunks.join('\n').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function pdfText(buf) {
  let parser = null; try { parser = require('pdf-parse/lib/pdf-parse.js'); } catch { /* optional dependency not installed */ }
  if (parser) { try { const r = await parser(buf); const t = String(r.text || '').replace(/\u0000/g, '').trim(); if (t.length >= 30) return { text: t, method: 'pdf-parse' }; } catch { /* fall through to built-in */ } }
  const t = pdfTextBuiltin(buf), letters = (t.match(/[A-Za-z]/g) || []).length;
  // PDFs that use embedded/CID fonts come out as control-character noise with this simple extractor: report "unreadable" instead of returning junk
  return { text: letters >= 30 && (t.match(/[A-Za-z0-9\s.,;:()@&%\/+#'"\-–•]/g) || []).length / t.length >= 0.85 ? t : '', method: 'builtin-pdf' };
}
async function extractText(buf, ext) {
  if (ext === 'docx') return { text: docxText(buf), method: 'docx-xml' };
  if (ext === 'pdf') return pdfText(buf);
  throw new Error('Unsupported resume type');
}
module.exports = { extractText, docxText, pdfTextBuiltin };
