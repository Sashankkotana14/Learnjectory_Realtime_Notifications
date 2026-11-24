const express = require('express'), router = express.Router();
const { auth, rateLimit } = require('../middleware/auth'), A = require('../controllers/auth'), C = require('../controllers/crud'), S = require('../controllers/stats'), AC = require('../controllers/academics'), AS = require('../controllers/assignments'), PL = require('../controllers/planner'), G = require('../controllers/goals'), H = require('../controllers/habits'), CA = require('../controllers/career'), PS = require('../controllers/projects'), AM = require('../controllers/achievements'), R = require('../models/resources'), OP = require('../controllers/opportunities'), CM = require('../controllers/community'), VT = require('../controllers/vault'), AN = require('../controllers/analytics'), DD = require('../controllers/dashboardData'), PX = require('../controllers/plannerExtras'), ST2 = require('../controllers/settings');
// Binary uploads are sent as the raw request body (no multipart parser needed). `auth` always runs first, so anonymous requests never get their body read.
const raw = mb => express.raw({ type: () => true, limit: mb + 'mb' }), vaultMb = () => Math.ceil(Number(process.env.VAULT_MAX_MB) > 0 ? Number(process.env.VAULT_MAX_MB) : 10) + 1;
// Part 2A: after any successful write, re-evaluate achievements from real data (idempotent; unlocks are UNIQUE per user)
router.use((req, res, next) => { if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400 && req.user) { try { AM.evaluate(req.user.id); } catch (e) { console.error('achievement check failed', e.message); } } }); next(); });
// Real-time notifications: after any successful write, tell the affected users' open tabs to refresh their bell (runs after the achievement check above, so new unlocks are included)
router.use((req, res, next) => { if (req.method !== 'GET') res.on('finish', () => require('../lib/notifyLive').afterWrite(req, res.statusCode)); next(); });
router.post('/auth/register', rateLimit(10, 36e5), A.register);
router.post('/auth/login', rateLimit(20, 9e5), A.login);
router.post('/auth/logout', auth, A.logout);
router.put('/auth/password', auth, A.changePassword);
router.get('/auth/me', auth, A.me);
router.get('/settings', auth, A.getSettings);
router.put('/settings', auth, A.putSettings);
// Settings module (profile, photo, preferences, security, export, delete) - registered before the generic /:res CRUD
router.get('/settings/profile', auth, ST2.getProfile); router.put('/settings/profile', auth, ST2.updateProfile); router.put('/settings/preferences', auth, ST2.updatePreferences);
router.get('/settings/avatar', auth, ST2.getAvatar); router.post('/settings/avatar', auth, raw(3), ST2.uploadAvatar); router.delete('/settings/avatar', auth, ST2.removeAvatar);
router.post('/settings/sign-out-everywhere', auth, ST2.signOutEverywhere); router.get('/settings/export', auth, ST2.exportData); router.delete('/settings/account', auth, ST2.deleteAccount);
router.get('/dashboard', auth, S.dashboard);
router.get('/dashboard/opportunities', auth, DD.opportunities); router.get('/dashboard/community', auth, DD.community); router.get('/dashboard/statistics', auth, DD.statistics);
router.get('/dashboard/boards', auth, DD.boards); router.put('/dashboard/boards', auth, DD.saveBoards);
// Permanent notification storage (own /notifications prefix; registered before the generic /:res CRUD)
const NT = require('../controllers/notifications');
router.get('/notifications/stream', auth, NT.stream); router.get('/notifications', auth, NT.list); router.post('/notifications/sync', auth, NT.sync); router.put('/notifications/read', auth, NT.read); router.put('/notifications/clear', auth, NT.clear);
router.get('/activity', auth, S.activity);
router.get('/analytics', auth, AN.analytics);
router.get('/search', auth, C.search);
router.get('/academics', auth, AC.list);
router.get('/assignments', auth, AS.list);
router.get('/study-plans', auth, PL.list); router.post('/study-plans', auth, PL.create);
router.get('/study-plans/:id', auth, PL.get); router.put('/study-plans/:id', auth, PL.update); router.delete('/study-plans/:id', auth, PL.remove);
router.post('/study-plans/:id/items/:itemId/start', auth, PL.session('start')); router.post('/study-plans/:id/items/:itemId/complete', auth, PL.session('complete')); router.post('/study-plans/:id/items/:itemId/reset', auth, PL.session('reset'));
// Study Planner extras: calendar view, recurring plans, goal milestones, habit reminders (own /planner prefix; registered before the generic /:res CRUD)
router.get('/planner/calendar', auth, PX.calendar);
router.get('/planner/recurrences', auth, PX.listRecurrences); router.post('/planner/recurrences', auth, PX.createRecurrence); router.put('/planner/recurrences/:id', auth, PX.updateRecurrence); router.delete('/planner/recurrences/:id', auth, PX.removeRecurrence);
router.get('/planner/goals', auth, PX.goals); router.post('/planner/goals/:goalId/milestones', auth, PX.addMilestone); router.put('/planner/milestones/:id', auth, PX.updateMilestone); router.delete('/planner/milestones/:id', auth, PX.removeMilestone);
router.get('/planner/reminders', auth, PX.listReminders); router.post('/planner/reminders', auth, PX.createReminder); router.get('/planner/reminders/due', auth, PX.dueReminders);
router.put('/planner/reminders/:id', auth, PX.updateReminder); router.delete('/planner/reminders/:id', auth, PX.removeReminder); router.post('/planner/reminders/:id/ack', auth, PX.ackReminder);
router.get('/goals', auth, G.list); router.post('/goals', auth, G.create); router.put('/goals/:id', auth, G.update); router.delete('/goals/:id', auth, G.remove);
router.get('/habits', auth, H.list); router.post('/habits', auth, H.create); router.put('/habits/:id', auth, H.update); router.delete('/habits/:id', auth, H.remove);
router.post('/habits/:id/logs', auth, H.logDay); router.delete('/habits/:id/logs/:date', auth, H.clearDay); router.get('/habits/:id/history', auth, H.history);
router.get('/career/templates', auth, CA.templates); router.get('/career/youtube', auth, CA.youtube);
router.get('/career/paths', auth, CA.list); router.post('/career/paths', auth, CA.create);
router.get('/career/paths/:id', auth, CA.get); router.put('/career/paths/:id', auth, CA.update); router.delete('/career/paths/:id', auth, CA.remove);
router.post('/career/paths/:id/lessons', auth, CA.addLesson); router.post('/career/paths/:id/study', auth, CA.addStudy); router.delete('/career/study/:id', auth, CA.removeStudy);
router.get('/career/youtube/resolve', auth, CA.youtubeResolve); router.put('/career/paths/:id/lessons/reorder', auth, CA.reorderLessons); router.post('/career/lessons/:id/move', auth, CA.moveLesson); router.put('/career/lessons/:id/video', auth, CA.setVideo); router.delete('/career/lessons/:id/video', auth, CA.clearVideo); router.get('/career/paths/:id/study', auth, CA.listStudy); router.put('/career/study/:id', auth, CA.updateStudy);
router.put('/career/lessons/:id', auth, CA.updateLesson); router.delete('/career/lessons/:id', auth, CA.removeLesson); router.post('/career/lessons/:id/complete', auth, CA.complete);
router.get('/projects', auth, PS.listProjects); router.post('/projects', auth, PS.createProject); router.put('/projects/:id', auth, PS.updateProject); router.delete('/projects/:id', auth, PS.removeProject);
router.get('/skills', auth, PS.listSkills); router.post('/skills', auth, PS.createSkill); router.put('/skills/:id', auth, PS.updateSkill); router.delete('/skills/:id', auth, PS.removeSkill);
router.get('/achievements', auth, AM.list); router.post('/achievements', auth, AM.readOnly); router.put('/achievements/:id', auth, AM.readOnly); router.delete('/achievements/:id', auth, AM.readOnly);
// ---- Part 2B: Opportunities, Community, My Vault (specific routes first so they win over the generic /:res CRUD below) ----
router.post('/opportunities/resume', auth, raw(6), OP.uploadResume); router.post('/opportunities/resume/text', auth, OP.pasteResume);
router.get('/opportunities/resume', auth, OP.getResume); router.delete('/opportunities/resume/:id', auth, OP.removeResume); router.post('/opportunities/resume/import-skills', auth, OP.importSkills);
router.get('/opportunities/jobs', auth, OP.searchJobs); router.get('/opportunities/skill-gaps', auth, OP.skillGaps);
router.get('/opportunities/saved', auth, OP.listSaved); router.post('/opportunities/saved', auth, OP.saveJob); router.put('/opportunities/saved/:id', auth, OP.updateSaved); router.delete('/opportunities/saved/:id', auth, OP.removeSaved);
router.get('/community/notifications', auth, require('../controllers/communityNotify').list); router.get('/community/meta', auth, CM.meta); router.get('/community/posts', auth, CM.list); router.post('/community/posts', auth, rateLimit(40, 6e4), CM.create);
router.get('/community/posts/:id', auth, CM.get); router.put('/community/posts/:id', auth, CM.update); router.delete('/community/posts/:id', auth, CM.remove);
router.post('/community/posts/:id/like', auth, CM.likePost); router.post('/community/posts/:id/comments', auth, rateLimit(60, 6e4), CM.addComment);
router.post('/community/posts/:id/solve', auth, CM.solve); router.delete('/community/posts/:id/solve', auth, CM.reopen); router.post('/community/posts/:id/collab', auth, CM.requestJoin);
router.put('/community/comments/:id', auth, CM.updateComment); router.delete('/community/comments/:id', auth, CM.removeComment); router.post('/community/comments/:id/like', auth, CM.likeComment);
router.put('/community/collab/:id', auth, CM.decide); router.delete('/community/collab/:id', auth, CM.withdraw);
router.get('/vault', auth, VT.overview);
router.post('/vault/notes', auth, VT.createNote); router.put('/vault/notes/:id', auth, VT.updateNote); router.delete('/vault/notes/:id', auth, VT.removeNote);
router.post('/vault/folders', auth, VT.createFolder); router.put('/vault/folders/:id', auth, VT.updateFolder); router.delete('/vault/folders/:id', auth, VT.removeFolder);
router.post('/vault/links', auth, VT.createLink); router.put('/vault/links/:id', auth, VT.updateLink); router.delete('/vault/links/:id', auth, VT.removeLink);
router.post('/vault/files', auth, raw(vaultMb()), VT.uploadFile); router.get('/vault/files/:id/download', auth, VT.downloadFile); router.put('/vault/files/:id', auth, VT.updateFile); router.delete('/vault/files/:id', auth, VT.removeFile);
router.param('res', (req, res, next, v) => (Object.prototype.hasOwnProperty.call(R, v) ? next() : res.status(404).json({ error: 'Unknown resource' })));
router.get('/:res', auth, C.list);
router.post('/:res', auth, C.create);
router.put('/:res/:id', auth, C.update);
router.delete('/:res/:id', auth, C.remove);
module.exports = router;
