// Skill dictionary + extraction + matching. Matching is dictionary based (honest limit: skills that are not in the list are only
// picked up when they appear in a resume's "Skills" section). Categories reuse the ones from Projects & Skills.
const D = [
  ['Programming', 'JavaScript', 'js', 'ecmascript', 'es6'], ['Programming', 'TypeScript', 'ts'], ['Programming', 'Python', 'python3'], ['Programming', 'Java'], ['Programming', 'C++', 'cpp'], ['Programming', 'C#', 'csharp', 'c sharp'],
  ['Programming', 'PHP'], ['Programming', 'Ruby'], ['Programming', 'Go', 'golang'], ['Programming', 'Rust'], ['Programming', 'Kotlin'], ['Programming', 'Swift'], ['Programming', 'Dart'], ['Programming', 'Scala'],
  ['Programming', 'R'], ['Programming', 'C'], ['Programming', 'MATLAB'], ['Programming', 'Bash', 'shell scripting', 'shell'], ['Programming', 'Data Structures', 'data structures and algorithms', 'dsa', 'algorithms'], ['Programming', 'Object-Oriented Programming', 'oop', 'object oriented programming'],
  ['Frontend', 'HTML', 'html5'], ['Frontend', 'CSS', 'css3'], ['Frontend', 'React', 'react.js', 'reactjs'], ['Frontend', 'Next.js', 'nextjs'], ['Frontend', 'Vue', 'vue.js', 'vuejs'], ['Frontend', 'Angular', 'angularjs'], ['Frontend', 'Svelte'],
  ['Frontend', 'Tailwind CSS', 'tailwind', 'tailwindcss'], ['Frontend', 'Bootstrap'], ['Frontend', 'Sass', 'scss'], ['Frontend', 'Redux'], ['Frontend', 'Responsive Design', 'responsive web design'], ['Frontend', 'React Native'], ['Frontend', 'Flutter'], ['Frontend', 'Webpack'], ['Frontend', 'Vite'],
  ['Backend', 'Node.js', 'node', 'nodejs'], ['Backend', 'Express', 'express.js', 'expressjs'], ['Backend', 'Django'], ['Backend', 'Flask'], ['Backend', 'FastAPI'], ['Backend', 'Spring Boot', 'spring'], ['Backend', '.NET', 'dotnet', 'asp.net'], ['Backend', 'Laravel'], ['Backend', 'Ruby on Rails', 'rails'],
  ['Backend', 'REST APIs', 'rest api', 'restful', 'rest', 'restful apis'], ['Backend', 'GraphQL'], ['Backend', 'Microservices'], ['Backend', 'WebSockets', 'websocket'], ['Backend', 'Authentication', 'jwt', 'oauth'],
  ['Data', 'SQL'], ['Data', 'MySQL'], ['Data', 'PostgreSQL', 'postgres'], ['Data', 'SQLite'], ['Data', 'MongoDB', 'mongo'], ['Data', 'Redis'], ['Data', 'Firebase'], ['Data', 'Pandas'], ['Data', 'NumPy'], ['Data', 'Machine Learning', 'ml'], ['Data', 'Deep Learning'],
  ['Data', 'TensorFlow'], ['Data', 'PyTorch'], ['Data', 'Scikit-learn', 'sklearn', 'scikit learn'], ['Data', 'Data Analysis', 'data analytics'], ['Data', 'Data Visualization', 'data viz'], ['Data', 'Tableau'], ['Data', 'Power BI', 'powerbi'], ['Data', 'Excel', 'microsoft excel', 'ms excel'],
  ['Data', 'NLP', 'natural language processing'], ['Data', 'Computer Vision'], ['Data', 'Statistics'], ['Data', 'Apache Spark', 'spark', 'pyspark'], ['Data', 'ETL'],
  ['Tools', 'Git'], ['Tools', 'GitHub'], ['Tools', 'Docker'], ['Tools', 'Kubernetes', 'k8s'], ['Tools', 'AWS', 'amazon web services'], ['Tools', 'Azure', 'microsoft azure'], ['Tools', 'Google Cloud', 'gcp', 'google cloud platform'], ['Tools', 'Linux'],
  ['Tools', 'CI/CD', 'continuous integration', 'github actions', 'jenkins'], ['Tools', 'Terraform'], ['Tools', 'Postman'], ['Tools', 'Jira'], ['Tools', 'VS Code'], ['Tools', 'Agile', 'scrum'], ['Tools', 'Testing', 'unit testing', 'jest', 'pytest', 'junit', 'selenium', 'cypress'],
  ['Tools', 'Cybersecurity', 'information security', 'network security'], ['Tools', 'Networking', 'tcp/ip'], ['Tools', 'Computer Networks'],
  ['Design', 'Figma'], ['Design', 'UI/UX', 'ux design', 'ui design', 'user experience', 'user interface design'], ['Design', 'Adobe Photoshop', 'photoshop'], ['Design', 'Adobe Illustrator', 'illustrator'], ['Design', 'Canva'],
  ['Soft Skills', 'Communication', 'communication skills'], ['Soft Skills', 'Leadership'], ['Soft Skills', 'Teamwork', 'team work', 'collaboration'], ['Soft Skills', 'Problem Solving', 'problem-solving'], ['Soft Skills', 'Time Management'], ['Soft Skills', 'Project Management'], ['Soft Skills', 'Public Speaking'],
].map(([category, name, ...aliases]) => ({ category, name, key: name.toLowerCase(), aliases: [name.toLowerCase(), ...aliases.map(a => a.toLowerCase())] }));
// Names that are ordinary words/letters: only trusted from a Skills section or a job's tag list, never from running text.
const AMBIGUOUS = new Set(['c', 'r', 'go', 'rest', 'node', 'spring', 'shell', 'swift', 'ml', 'spark', 'rails', 'express', 'testing', 'collaboration', 'algorithms']);
const BY_ALIAS = new Map(); for (const s of D) for (const a of s.aliases) if (!BY_ALIAS.has(a)) BY_ALIAS.set(a, s);
const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const RE = D.map(s => ({ s, re: new RegExp('(?<![a-z0-9+#.])(?:' + s.aliases.filter(a => !AMBIGUOUS.has(a)).sort((a, b) => b.length - a.length).map(esc).join('|') + ')(?![a-z0-9+#]|\\.[a-z0-9])', 'i'), amb: !s.aliases.some(a => !AMBIGUOUS.has(a)) }));
const clean = t => String(t || '').replace(/^[\s\-•*▪●◦–]+|[\s.;:]+$/g, '').replace(/\s+/g, ' ').trim();
const lookup = name => BY_ALIAS.get(clean(name).toLowerCase()) || null;
// canonical key for any user-typed skill name ("ReactJS" -> "react", unknown -> lower-cased text)
const skillKey = name => (lookup(name) ? lookup(name).key : clean(name).toLowerCase());
// Skills found in free text (title/description/resume body). `listed` = tokens from a skills section / tag list, where ambiguous names are allowed.
function extract(text, listed = []) {
  const found = new Map(), body = String(text || '').slice(0, 60000);
  for (const { s, re, amb } of RE) if (!amb && re.test(body)) found.set(s.key, { name: s.name, category: s.category, key: s.key, source: 'text' });
  for (const tok of listed) { const hit = lookup(tok); if (hit && !found.has(hit.key)) found.set(hit.key, { name: hit.name, category: hit.category, key: hit.key, source: 'listed' }); else if (hit) found.get(hit.key).source = 'listed'; }
  return [...found.values()];
}
const TECH = s => s.category !== 'Soft Skills';
// How well does a job fit the user's skills? Returns null score when the listing names no recognisable skills (we never guess).
function matchJob(job, userKeys) {
  const have = userKeys instanceof Set ? userKeys : new Set(userKeys);
  const req = extract(`${job.title || ''}\n${job.description || ''}`, job.tags || []).filter(TECH);
  if (!req.length) return { score: null, required: [], matched: [], missing: [] };
  const matched = req.filter(s => have.has(s.key)), missing = req.filter(s => !have.has(s.key));
  return { score: Math.round(matched.length / req.length * 100), required: req.map(s => s.name), matched: matched.map(s => s.name), missing: missing.map(s => ({ name: s.name, category: s.category })) };
}
module.exports = { D, lookup, skillKey, extract, matchJob, clean };
