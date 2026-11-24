// Heuristic resume parser: splits the text into sections by heading and pulls out skills, education, projects and experience.
// It only reports what is literally in the document. Contact details (email/phone/address) are deliberately NOT extracted or stored.
const S = require('./skills');
const H = {
  skills: ['skills', 'technical skills', 'key skills', 'core skills', 'core competencies', 'technologies', 'tech stack', 'skills and tools', 'skills & tools', 'technical proficiencies'],
  education: ['education', 'academic background', 'academic qualifications', 'qualifications', 'educational qualifications', 'education and training', 'academics'],
  experience: ['experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history', 'internships', 'internship experience', 'internship', 'relevant experience'],
  projects: ['projects', 'personal projects', 'academic projects', 'key projects', 'selected projects', 'project experience', 'technical projects'],
  other: ['summary', 'professional summary', 'objective', 'career objective', 'profile', 'about me', 'certifications', 'certificates', 'achievements', 'awards', 'honors', 'languages', 'interests', 'hobbies', 'references', 'publications', 'activities', 'extracurricular activities', 'volunteering', 'positions of responsibility', 'courses', 'contact'],
};
const HEAD = new Map(); for (const [sec, list] of Object.entries(H)) for (const h of list) HEAD.set(h, sec);
const BULLET = /^\s*[•\-*▪●◦–·]\s+/;
const RANGE = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(?:((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d{2})|(present|current|now|ongoing))/i;
const DEGREE = /\b(b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?e\.?|b\.?\s?sc\.?|m\.?\s?sc\.?|b\.?\s?c\.?a\.?|m\.?\s?c\.?a\.?|b\.?\s?a\.?|m\.?\s?a\.?|b\.?\s?com|m\.?\s?com|mba|bba|ph\.?d|bachelor[a-z' ]*|master[a-z' ]*|diploma|associate degree|high school|secondary school|higher secondary|class (?:x|xii|10|12)|intermediate|12th|10th|hsc|ssc)\b/i;
const INSTITUTION = /\b(university|college|institute|school|academy|polytechnic|iit|nit|iiit)\b/i;
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const norm = l => l.replace(/[^A-Za-z& ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

function sections(lines) {
  const out = { header: [], skills: [], education: [], experience: [], projects: [], other: [] }; let cur = 'header';
  for (const raw of lines) {
    const l = raw.trim(), n = norm(l);
    if (l && l.length <= 45 && !BULLET.test(l) && HEAD.has(n)) { cur = HEAD.get(n); continue; }
    out[cur].push(raw.replace(/\s+$/, ''));
  }
  return out;
}
// group lines into blocks: a blank line ends a block; a new non-bullet line that carries a date range also starts a new block
function blocks(lines, split) {
  const out = []; let cur = [];
  const flush = () => { if (cur.length) out.push(cur); cur = []; };
  for (const l of lines) {
    if (!l.trim()) { flush(); continue; }
    if (cur.length && !BULLET.test(l) && ((RANGE.test(l) && cur.some(x => RANGE.test(x))) || (split && split(cur, l)))) flush();
    cur.push(l.trim());
  }
  flush(); return out;
}
const monthIdx = (m, y, end) => { const k = m ? MONTHS[m.trim().slice(0, 3).toLowerCase()] : (end ? 11 : 0); return +y * 12 + (k ?? 0); };
function experienceYears(lines, now = new Date()) {
  const spans = [];
  for (const l of lines) { const m = RANGE.exec(l); if (!m) continue; const a = monthIdx(m[1], m[2], false), b = m[5] ? now.getFullYear() * 12 + now.getMonth() : monthIdx(m[3], m[4], true); if (b >= a && b - a < 12 * 40) spans.push([a, b + 1]); }
  if (!spans.length) return null;
  spans.sort((x, y) => x[0] - y[0]); let total = 0, [s, e] = spans[0];
  for (const [a, b] of spans.slice(1)) { if (a <= e) e = Math.max(e, b); else { total += e - s; [s, e] = [a, b]; } }
  total += e - s; return Math.round(total / 12 * 10) / 10;
}
const rangeOf = t => { const m = RANGE.exec(t); return m ? m[0].trim() : ''; };
function parseEducation(lines) {
  const out = [];
  for (const b of blocks(lines, (cur, l) => DEGREE.test(l) && cur.some(x => DEGREE.test(x)))) {
    const text = b.join(' '); if (!DEGREE.test(text) && !INSTITUTION.test(text)) continue;
    const gpa = /(cgpa|gpa|percentage|grade)\s*[:\-]?\s*([\d.]+(?:\s*\/\s*\d+)?\s*%?)/i.exec(text), years = rangeOf(text) || ((/\b(19|20)\d{2}\b/.exec(text) || [''])[0]);
    let degree = b.find(l => DEGREE.test(l)) || '', institution = b.find(l => INSTITUTION.test(l)) || '';
    if (degree && degree === institution && degree.includes(',')) { institution = degree.slice(degree.indexOf(',') + 1).trim(); degree = degree.slice(0, degree.indexOf(',')).trim(); }
    out.push({ degree, institution, years, score: gpa ? `${gpa[1].toUpperCase()} ${gpa[2].replace(/\s+/g, '')}` : '', details: b.slice(0, 4).join(' | ').slice(0, 300) });
  }
  return out.slice(0, 10);
}
function parseEntries(lines, withSkills) {
  // PDFs carry no blank lines: a new entry also starts when a plain line follows bullet lines
  return blocks(lines, (cur, l) => cur.some(x => BULLET.test(x))).map(b => {
    const head = b.find(l => !BULLET.test(l)) || b[0], bullets = b.filter(l => BULLET.test(l)).map(l => l.replace(BULLET, '').trim()), rest = b.filter(l => l !== head && !BULLET.test(l));
    const text = b.join('\n'), e = { title: head.replace(RANGE, '').replace(/[|,\-–—\s]+$/, '').trim().slice(0, 150) || head.slice(0, 150), dates: rangeOf(text), details: [...rest.filter(l => !RANGE.test(l)), ...bullets].slice(0, 8).map(l => l.slice(0, 300)) };
    if (withSkills) e.technologies = S.extract(text, []).filter(s => s.category !== 'Soft Skills').map(s => s.name);
    return e;
  }).filter(e => e.title).slice(0, 15);
}
function skillTokens(lines) {
  const toks = [];
  for (const l of lines) { const body = l.includes(':') && l.indexOf(':') < 40 ? l.slice(l.indexOf(':') + 1) : l; for (const t of body.replace(BULLET, '').split(/[,;|•·●▪\/\t]|\s{3,}/)) { const c = S.clean(t); if (c && !/@|https?:|www\.|\.(com|org|net|io|in)\b|\d{5,}/i.test(c) && c.length <= 40 && c.split(' ').length <= 4) toks.push(c); } }
  return toks;
}
function parseResume(text, opts = {}) {
  const clean = String(text || '').replace(/\r/g, '').replace(/\u00a0/g, ' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''), lines = clean.split('\n'), sec = sections(lines), warnings = [];
  const toks = skillTokens(sec.skills), skills = new Map();
  for (const s of S.extract(clean, toks)) skills.set(s.key, { name: s.name, category: s.category, source: s.source === 'listed' ? 'skills section' : 'mentioned in resume' });
  for (const t of toks) { const k = S.skillKey(t); if (!skills.has(k) && !S.lookup(t) && /[a-z]/i.test(t) && t.length >= 2) skills.set(k, { name: t, category: 'Other', source: 'skills section' }); }
  const education = parseEducation(sec.education.length ? sec.education : []), experience = parseEntries(sec.experience, true), projects = parseEntries(sec.projects, true);
  if (!sec.skills.length) warnings.push('No "Skills" section found - skills were detected from the rest of the text only.');
  if (!sec.education.length) warnings.push('No "Education" section found.');
  if (!sec.experience.length) warnings.push('No "Experience" section found (fine for students; internships can go under "Internships").');
  if (!sec.projects.length) warnings.push('No "Projects" section found.');
  return { skills: [...skills.values()].slice(0, 80), education, experience, projects, experience_years: experienceYears(sec.experience, opts.now), sections_found: ['skills', 'education', 'experience', 'projects'].filter(k => sec[k].length), word_count: clean.split(/\s+/).filter(Boolean).length, warnings };
}
module.exports = { parseResume, experienceYears };
