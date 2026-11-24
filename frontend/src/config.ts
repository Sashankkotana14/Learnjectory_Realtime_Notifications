import { LayoutDashboard, BookOpen, ClipboardList, CalendarDays, Target, Sparkles, Compass, FolderKanban, Award, Zap, Users, Lock, BarChart3, Settings } from 'lucide-react';
export type Field = { k: string; label: string; type: 'text' | 'number' | 'date' | 'pct' | 'select' | 'bool' | 'area'; options?: string[] };
export type Cfg = { res: string; title: string; titleKey: string; fields: Field[] };
const P = (k = 'progress'): Field => ({ k, label: 'Progress %', type: 'pct' });
export const pages: Record<string, Cfg> = {
  academics: { res: 'academics', title: 'Academics', titleKey: 'subject', fields: [{ k: 'subject', label: 'Subject', type: 'text' }, P(), { k: 'grade', label: 'Grade', type: 'text' }] },
  assignments: { res: 'assignments', title: 'Assignments', titleKey: 'title', fields: [{ k: 'title', label: 'Title', type: 'text' }, { k: 'subject', label: 'Subject', type: 'text' }, { k: 'due_date', label: 'Due date', type: 'date' }, { k: 'status', label: 'Status', type: 'select', options: ['pending', 'done'] }] },
  planner: { res: 'study_sessions', title: 'Study Planner', titleKey: 'title', fields: [{ k: 'title', label: 'Session', type: 'text' }, { k: 'session_date', label: 'Date', type: 'date' }, { k: 'duration', label: 'Minutes', type: 'number' }, { k: 'completed', label: 'Completed', type: 'bool' }] },
  goals: { res: 'goals', title: 'My Goals', titleKey: 'title', fields: [{ k: 'title', label: 'Goal', type: 'text' }, P(), { k: 'target_date', label: 'Target date', type: 'date' }] },
  growth: { res: 'habits', title: 'Growth Engine – Daily Habits', titleKey: 'name', fields: [{ k: 'name', label: 'Habit', type: 'text' }, { k: 'done_today', label: 'Done today', type: 'bool' }, { k: 'streak', label: 'Streak (days)', type: 'number' }] },
  career: { res: 'skills', title: 'Career Compass – Skills', titleKey: 'name', fields: [{ k: 'name', label: 'Skill', type: 'text' }, P('level')] },
  projects: { res: 'projects', title: 'Projects & Skills', titleKey: 'title', fields: [{ k: 'title', label: 'Project', type: 'text' }, { k: 'description', label: 'Description', type: 'area' }, { k: 'status', label: 'Status', type: 'select', options: ['planning', 'active', 'completed'] }] },
  achievements: { res: 'achievements', title: 'Achievements', titleKey: 'title', fields: [{ k: 'title', label: 'Title', type: 'text' }, { k: 'description', label: 'Description', type: 'area' }, { k: 'earned_at', label: 'Earned on', type: 'date' }] },
  opportunities: { res: 'opportunities', title: 'Opportunities', titleKey: 'title', fields: [{ k: 'title', label: 'Title', type: 'text' }, { k: 'org', label: 'Organisation', type: 'text' }, { k: 'type', label: 'Type', type: 'select', options: ['Internship', 'Hackathon', 'Program', 'Scholarship', 'Job'] }, { k: 'link', label: 'Link', type: 'text' }] },
  community: { res: 'community_posts', title: 'Community', titleKey: 'content', fields: [{ k: 'content', label: 'Share something', type: 'area' }] },
  vault: { res: 'vault', title: 'My Vault', titleKey: 'title', fields: [{ k: 'title', label: 'Title', type: 'text' }, { k: 'content', label: 'Notes', type: 'area' }] },
};
export const nav = [
  { group: 'MAIN NAVIGATION', items: [['/', 'Dashboard', LayoutDashboard], ['/academics', 'Academics', BookOpen], ['/assignments', 'Assignments', ClipboardList], ['/planner', 'Study Planner', CalendarDays], ['/goals', 'My Goals', Target]] },
  { group: 'GROWTH', items: [['/growth', 'Growth Engine', Sparkles], ['/career', 'Career Compass', Compass], ['/projects', 'Projects & Skills', FolderKanban], ['/achievements', 'Achievements', Award]] },
  { group: 'EXPLORE', items: [['/opportunities', 'Opportunities', Zap], ['/community', 'Community', Users], ['/vault', 'My Vault', Lock], ['/analytics', 'Analytics', BarChart3], ['/settings', 'Settings', Settings]] },
] as const;
