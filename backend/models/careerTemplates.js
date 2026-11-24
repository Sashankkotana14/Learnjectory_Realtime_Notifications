// Career path templates. Lesson = [title, YouTube search query, documentation URL ('' if none), estimated minutes]
const STAGES = ['Beginner', 'Intermediate', 'Advanced'];
const templates = {
  web: { title: 'Full-Stack Web Development', description: 'From HTML and CSS to deploying secure, tested full-stack apps.', stages: {
    Beginner: [['HTML fundamentals', 'HTML full course for beginners', 'https://developer.mozilla.org/en-US/docs/Learn_web_development', 120], ['CSS layout: Flexbox and Grid', 'CSS flexbox and grid tutorial', 'https://developer.mozilla.org/en-US/docs/Learn_web_development', 120], ['JavaScript basics', 'JavaScript tutorial for beginners', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', 180], ['Git and GitHub basics', 'Git and GitHub for beginners', 'https://git-scm.com/book/en/v2', 90]],
    Intermediate: [['React fundamentals', 'React tutorial for beginners', 'https://react.dev/learn', 180], ['Responsive design', 'responsive web design tutorial', '', 90], ['REST APIs with Node.js and Express', 'Node.js Express REST API tutorial', 'https://nodejs.org/en/learn', 150], ['SQL and relational databases', 'SQL tutorial full course', '', 120]],
    Advanced: [['Authentication and web security', 'web application security authentication tutorial', 'https://owasp.org/www-project-top-ten/', 150], ['TypeScript in real projects', 'TypeScript full course', 'https://www.typescriptlang.org/docs/', 150], ['Automated testing', 'JavaScript testing tutorial', '', 120], ['Deployment and CI/CD', 'CI CD pipeline tutorial GitHub Actions', '', 120]] } },
  data: { title: 'Data Science with Python', description: 'Python, data analysis, visualisation and machine learning.', stages: {
    Beginner: [['Python basics', 'Python tutorial for beginners', 'https://docs.python.org/3/tutorial/', 180], ['NumPy essentials', 'NumPy tutorial', 'https://numpy.org/doc/stable/user/absolute_beginners.html', 90], ['Data analysis with pandas', 'pandas tutorial for beginners', 'https://pandas.pydata.org/docs/getting_started/index.html', 120], ['Statistics fundamentals', 'statistics for data science', '', 120]],
    Intermediate: [['Data visualisation', 'matplotlib seaborn tutorial', '', 90], ['SQL for analysts', 'SQL for data analysis', '', 120], ['Machine learning with scikit-learn', 'scikit-learn machine learning tutorial', 'https://scikit-learn.org/stable/user_guide.html', 180], ['Feature engineering', 'feature engineering for machine learning', '', 90]],
    Advanced: [['Deep learning basics', 'deep learning neural networks course', '', 180], ['Time series analysis', 'time series forecasting python', '', 120], ['Model deployment', 'deploy machine learning model tutorial', '', 120], ['End-to-end capstone project', 'data science project from scratch', '', 240]] } },
  dsa: { title: 'Software Engineering and Algorithms', description: 'Data structures, algorithms and system design for interviews and real work.', stages: {
    Beginner: [['Big-O notation', 'big O notation explained', '', 60], ['Arrays and strings', 'arrays and strings data structures', '', 90], ['Recursion', 'recursion for beginners', '', 90], ['Linked lists, stacks and queues', 'linked list stack queue tutorial', '', 120]],
    Intermediate: [['Trees and graphs', 'trees and graphs data structures', '', 150], ['Sorting and searching', 'sorting and searching algorithms', '', 120], ['Hash tables', 'hash tables explained', '', 60], ['Dynamic programming introduction', 'dynamic programming for beginners', '', 150]],
    Advanced: [['Advanced graph algorithms', 'Dijkstra and advanced graph algorithms', '', 150], ['System design basics', 'system design basics tutorial', '', 180], ['Concurrency', 'concurrency and multithreading explained', '', 120], ['Mock interview practice', 'coding interview mock', '', 120]] } },
  cyber: { title: 'Cybersecurity', description: 'Networking and security fundamentals through to practical defence.', stages: {
    Beginner: [['Networking basics', 'computer networking full course', '', 150], ['Linux command line', 'Linux command line tutorial', '', 120], ['Security fundamentals (CIA triad)', 'cybersecurity fundamentals for beginners', '', 90], ['Passwords and authentication', 'password security authentication explained', '', 60]],
    Intermediate: [['OWASP Top 10', 'OWASP top 10 explained', 'https://owasp.org/www-project-top-ten/', 150], ['Cryptography basics', 'cryptography basics explained', '', 120], ['Network security and firewalls', 'network security firewalls tutorial', '', 120], ['Security monitoring and logs', 'security logging and monitoring SIEM basics', '', 90]],
    Advanced: [['Penetration testing methodology', 'penetration testing methodology tutorial', '', 180], ['Incident response', 'incident response process explained', '', 120], ['Cloud security', 'cloud security fundamentals', '', 120], ['Secure code review', 'secure code review tutorial', '', 120]] } },
};
// copy a template's lessons into a user's path (db is passed in to avoid a circular require with database/db.js)
function instantiate(db, uid, pathId, key) {
  const t = templates[key]; if (!t) return 0;
  const ins = db.prepare('INSERT INTO career_lessons(user_id,path_id,stage,title,resource_url,resource_type,youtube_query,est_minutes,position) VALUES(?,?,?,?,?,?,?,?,?)');
  let pos = 0;
  for (const st of STAGES) for (const [title, q, url, mins] of t.stages[st]) ins.run(uid, pathId, st, title, url, url ? 'docs' : 'video', q, mins, pos++);
  return pos;
}
module.exports = { STAGES, templates, instantiate };
