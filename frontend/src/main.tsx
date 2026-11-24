import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import { getToken } from './api';
import { pages } from './config';
import Layout from './Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Resource from './pages/Resource';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Search from './pages/Search';
import Academics from './pages/Academics';
import Assignments from './pages/Assignments';
import StudyPlanner from './pages/StudyPlanner';
import Goals from './pages/Goals';
import Growth from './pages/Growth';
import Career from './pages/Career';
import ProjectsSkills from './pages/ProjectsSkills';
import Achievements from './pages/Achievements';
import Opportunities from './pages/Opportunities';
import Community from './pages/Community';
import Vault from './pages/Vault';
import NotificationHistory from './pages/NotificationHistory';
const Guard = () => (getToken() ? <Layout /> : <Navigate to="/login" replace />);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<Guard />}>
      <Route index element={<Dashboard />} />
      <Route path="academics" element={<Academics />} /><Route path="assignments" element={<Assignments />} />
      <Route path="planner" element={<StudyPlanner />} /><Route path="goals" element={<Goals />} /><Route path="growth" element={<Growth />} />
      <Route path="career" element={<Career />} /><Route path="projects" element={<ProjectsSkills />} /><Route path="achievements" element={<Achievements />} />
      <Route path="opportunities" element={<Opportunities />} /><Route path="community" element={<Community />} /><Route path="vault" element={<Vault />} />
      {Object.entries(pages).filter(([p]) => !['academics', 'assignments', 'planner', 'goals', 'growth', 'career', 'projects', 'achievements', 'opportunities', 'community', 'vault'].includes(p)).map(([p, cfg]) => <Route key={p} path={p} element={<Resource key={p} cfg={cfg} />} />)}
      <Route path="analytics" element={<Analytics />} /><Route path="settings" element={<Settings />} /><Route path="search" element={<Search />} /><Route path="notifications" element={<NotificationHistory />} />
    </Route>
    <Route path="*" element={<Navigate to="/" />} />
  </Routes></BrowserRouter>
);
