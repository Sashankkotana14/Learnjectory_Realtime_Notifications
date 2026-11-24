import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2, Sun, Moon, Monitor, Bell, KeyRound, Download, LogOut, AlertTriangle, UserRound, Palette, ShieldCheck, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, upload, fetchBlob, clearSession, logout } from '../api';
import { THEME_MODES, ThemeMode, getThemeMode, rememberTheme } from '../settings/theme';
import '../settings/settings.css';

type Msg = { ok: boolean; text: string } | null;
const PROFILE_KEYS = ['name', 'username', 'email', 'bio', 'college', 'course', 'branch', 'year_of_study'] as const, YEAR_OPTIONS = ['1', '2', '3', '4', '5', '6', 'Other'];
const AVATAR_PX = 512, MAX_SOURCE_MB = 15, BIO_MAX = 500, NAME_MAX = 80;
const THEME_INFO: Record<ThemeMode, { label: string; hint: string; Icon: any; bg: string[] }> = {
  light: { label: 'Light', hint: 'Bright and clean', Icon: Sun, bg: ['#F6F2FF', '#FFFFFF', '#8B5CF6'] },
  dark: { label: 'Dark', hint: 'Easy on the eyes', Icon: Moon, bg: ['#100B1D', '#211632', '#8B5CF6'] },
  system: { label: 'System', hint: 'Match your device', Icon: Monitor, bg: ['#F6F2FF', '#211632', '#8B5CF6'] },
};
// Center-crop to a square and shrink to 512px (JPEG) in the browser: small uploads, and the server only ever receives a ready-to-use photo.
async function toAvatarBlob(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img: HTMLImageElement = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That file could not be read as an image')); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight); if (!side) throw new Error('That file could not be read as an image');
    const c = document.createElement('canvas'); c.width = c.height = AVATAR_PX; const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    const b: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    if (!b) throw new Error('Could not prepare the image'); return b;
  } finally { URL.revokeObjectURL(url); }
}
const Note = ({ m }: { m: Msg }) => (m ? <span role="status" className={`text-sm ${m.ok ? 'st-toast-ok text-emerald-200' : 'st-toast-err text-rose-300'}`}>{m.text}</span> : null);
const Head = ({ Icon, title, sub }: { Icon: any; title: string; sub?: string }) => (
  <div className="mb-3 flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" /><div><h2 className="text-base font-extrabold">{title}</h2>{sub && <p className="text-xs text-sky-100/60">{sub}</p>}</div></div>
);

export default function Settings() {
  const [p, setP] = useState<any>(null), [loadErr, setLoadErr] = useState('');
  const nv = useNavigate(), [f, setF] = useState({ name: '', username: '', email: '', bio: '', college: '', course: '', branch: '', year_of_study: '' }), [emailPw, setEmailPw] = useState(''), [pMsg, setPMsg] = useState<Msg>(null), [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null), [pending, setPending] = useState<{ blob: Blob; url: string } | null>(null), [aMsg, setAMsg] = useState<Msg>(null), [aBusy, setABusy] = useState(false), [drag, setDrag] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(getThemeMode()), [tMsg, setTMsg] = useState<Msg>(null), [nMsg, setNMsg] = useState<Msg>(null);
  const [pw, setPw] = useState({ cur: '', next: '', again: '' }), [pwMsg, setPwMsg] = useState<Msg>(null), [pwBusy, setPwBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false), [sMsg, setSMsg] = useState<Msg>(null);
  const [xMsg, setXMsg] = useState<Msg>(null), [xBusy, setXBusy] = useState(false);
  const [del, setDel] = useState({ open: false, pw: '', word: '' }), [dMsg, setDMsg] = useState<Msg>(null), [dBusy, setDBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null), avatarRef = useRef<string | null>(null);

  const loadAvatar = async (has: boolean) => {
    if (avatarRef.current) { URL.revokeObjectURL(avatarRef.current); avatarRef.current = null; }
    if (!has) { setAvatarUrl(null); return; }
    try { const u = URL.createObjectURL(await fetchBlob('/settings/avatar')); avatarRef.current = u; setAvatarUrl(u); } catch { setAvatarUrl(null); }
  };
  const applyProfile = (d: any, resetForm = true) => { setP(d); if (resetForm) setF({ name: d.name || '', username: d.username || '', email: d.email || '', bio: d.bio || '', college: d.college || '', course: d.course || '', branch: d.branch || '', year_of_study: d.year_of_study || '' }); setMode(d.theme); };
  useEffect(() => {
    let live = true;
    api('/settings/profile').then(d => { if (!live) return; applyProfile(d); loadAvatar(d.has_avatar); }).catch(e => live && setLoadErr(e.message));
    const onTheme = (e: any) => setMode(e.detail.mode);
    window.addEventListener('lj-theme', onTheme);
    return () => { live = false; window.removeEventListener('lj-theme', onTheme); if (avatarRef.current) URL.revokeObjectURL(avatarRef.current); };
  }, []);
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);

  // ---------- profile photo ----------
  const pick = async (file?: File | null) => {
    setAMsg(null); if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return setAMsg({ ok: false, text: 'Please choose a JPG, PNG, WebP or GIF image.' });
    if (file.size > MAX_SOURCE_MB * 1024 * 1024) return setAMsg({ ok: false, text: `That image is too large (max ${MAX_SOURCE_MB} MB).` });
    try { const blob = await toAvatarBlob(file); setPending({ blob, url: URL.createObjectURL(blob) }); } catch (e: any) { setAMsg({ ok: false, text: e.message }); }
  };
  const saveAvatar = async () => {
    if (!pending) return; setABusy(true); setAMsg(null);
    try { const d = await upload('/settings/avatar', new File([pending.blob], 'avatar.jpg', { type: 'image/jpeg' })); setP(d); await loadAvatar(true); setPending(null); setAMsg({ ok: true, text: 'Profile photo updated.' }); }
    catch (e: any) { setAMsg({ ok: false, text: e.message }); } finally { setABusy(false); }
  };
  const removeAvatar = async () => {
    setABusy(true); setAMsg(null);
    try { const d = await api('/settings/avatar', 'DELETE'); setP(d); await loadAvatar(false); setPending(null); setAMsg({ ok: true, text: 'Profile photo removed.' }); }
    catch (e: any) { setAMsg({ ok: false, text: e.message }); } finally { setABusy(false); }
  };

  // ---------- profile details ----------
  const emailChanged = !!p && f.email.trim().toLowerCase() !== p.email;
  const dirty = !!p && (PROFILE_KEYS.some(k => k !== 'email' && f[k].trim() !== (p[k] || '')) || emailChanged);
  const saveProfile = async (e: any) => {
    e.preventDefault(); setPMsg(null);
    if (!f.name.trim()) return setPMsg({ ok: false, text: 'Name is required.' });
    if (emailChanged && !emailPw) return setPMsg({ ok: false, text: 'Enter your current password to change your email.' });
    setSaving(true);
    try {
      const body: any = { name: f.name, username: f.username, bio: f.bio, college: f.college, course: f.course, branch: f.branch, year_of_study: f.year_of_study }; if (emailChanged) { body.email = f.email; body.currentPassword = emailPw; }
      const d = await api('/settings/profile', 'PUT', body); applyProfile(d); setEmailPw(''); setPMsg({ ok: true, text: 'Profile saved.' });
    } catch (x: any) { setPMsg({ ok: false, text: x.message }); } finally { setSaving(false); }
  };

  // ---------- preferences ----------
  const chooseTheme = async (m: ThemeMode) => {
    if (m === mode) return; const prev = mode; setTMsg(null); rememberTheme(m); setMode(m);
    try { await api('/settings/preferences', 'PUT', { theme: m }); setTMsg({ ok: true, text: m === 'system' ? 'Following your device setting.' : `${THEME_INFO[m].label} theme saved.` }); }
    catch (x: any) { rememberTheme(prev); setMode(prev); setTMsg({ ok: false, text: 'Could not save your theme: ' + x.message }); }
  };
  const toggleNotifications = async () => {
    if (!p) return; const was = p.notifications, next = was ? 0 : 1; setNMsg(null); setP({ ...p, notifications: next });
    try { setP(await api('/settings/preferences', 'PUT', { notifications: next })); setNMsg({ ok: true, text: next ? 'Notifications on.' : 'Notifications off.' }); }
    catch (x: any) { setP((q: any) => ({ ...q, notifications: was })); setNMsg({ ok: false, text: x.message }); }
  };

  // ---------- security ----------
  const changePassword = async (e: any) => {
    e.preventDefault(); setPwMsg(null);
    if (pw.next.length < 8) return setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' });
    if (pw.next !== pw.again) return setPwMsg({ ok: false, text: 'The new passwords do not match.' });
    if (pw.next === pw.cur) return setPwMsg({ ok: false, text: 'Choose a password different from your current one.' });
    setPwBusy(true);
    try { const d = await api('/auth/password', 'PUT', { currentPassword: pw.cur, newPassword: pw.next }); if (d.token) localStorage.setItem('token', d.token); setPw({ cur: '', next: '', again: '' }); setPwMsg({ ok: true, text: 'Password changed. Other devices were signed out.' }); }
    catch (x: any) { setPwMsg({ ok: false, text: x.message }); } finally { setPwBusy(false); }
  };
  const signOutEverywhere = async () => {
    setSMsg(null);
    try { await api('/settings/sign-out-everywhere', 'POST'); clearSession(); location.href = '/login'; } catch (x: any) { setSMsg({ ok: false, text: x.message }); }
  };

  // ---------- data ----------
  const exportData = async () => {
    setXBusy(true); setXMsg(null);
    try {
      const blob = await fetchBlob('/settings/export'), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'learnjectory-export.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setXMsg({ ok: true, text: 'Your data was downloaded.' });
    } catch (x: any) { setXMsg({ ok: false, text: x.message }); } finally { setXBusy(false); }
  };
  const deleteAccount = async (e: any) => {
    e.preventDefault(); setDMsg(null); setDBusy(true);
    try { await api('/settings/account', 'DELETE', { password: del.pw, confirm: del.word }); clearSession(); location.href = '/login'; }
    catch (x: any) { setDMsg({ ok: false, text: x.message }); setDBusy(false); }
  };

  if (loadErr) return <div><h1 className="mb-4 text-2xl font-extrabold">Settings</h1><div className="card max-w-lg text-sm text-rose-300">Could not load your settings: {loadErr}</div></div>;
  if (!p) return <div><h1 className="mb-4 text-2xl font-extrabold">Settings</h1><div className="card max-w-lg text-sm text-sky-100/70">Loading your settings…</div></div>;
  const initial = ((p.name || '·')[0] || '·').toUpperCase(), shown = pending ? pending.url : avatarUrl;
  const lbl = 'block text-xs text-sky-200';

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold">Settings</h1>
      <p className="mb-4 text-sm text-sky-100/60">Manage your profile, appearance and account.</p>
      <div className="max-w-3xl space-y-4">

        <section className="card st-section" aria-label="Profile photo">
          <Head Icon={Camera} title="Profile photo" sub="JPG, PNG, WebP or GIF. We crop it to a square for you." />
          <div className="flex flex-wrap items-center gap-5">
            <div className="st-avatar h-24 w-24 text-4xl" aria-label="Profile photo preview">{shown ? <img src={shown} alt="Your profile photo" /> : <span aria-hidden>{initial}</span>}</div>
            <div className={`min-w-[14rem] flex-1 rounded-2xl border border-dashed p-3 text-sm transition ${drag ? 'border-violet-400 bg-violet-500/10' : 'border-[rgba(167,139,250,.3)]'}`}
              onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              {pending ? (
                <div className="space-y-2"><div className="text-sky-100/80">Preview ready. Save it to make it your photo.</div>
                  <div className="flex flex-wrap gap-2"><button type="button" className="btn" disabled={aBusy} onClick={saveAvatar}>{aBusy ? 'Saving…' : 'Save photo'}</button><button type="button" className="btn-ghost" disabled={aBusy} onClick={() => setPending(null)}>Cancel</button><button type="button" className="btn-ghost" disabled={aBusy} onClick={() => fileRef.current?.click()}>Choose another</button></div></div>
              ) : (
                <div className="space-y-2"><div className="text-sky-100/70">Drag a photo here, or pick one from your device.</div>
                  <div className="flex flex-wrap gap-2"><button type="button" className="btn" disabled={aBusy} onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" />{p.has_avatar ? 'Change photo' : 'Upload photo'}</button>
                    {p.has_avatar && <button type="button" className="btn-ghost" disabled={aBusy} onClick={removeAvatar}><Trash2 className="h-4 w-4" />Remove</button>}</div></div>
              )}
            </div>
          </div>
          <div className="mt-2 min-h-[1.25rem]"><Note m={aMsg} /></div>
        </section>

        <form onSubmit={saveProfile} className="card st-section space-y-3" aria-label="Profile details">
          <Head Icon={UserRound} title="Profile details" sub="This is how you appear across Learnjectory." />
          <label className={lbl}>Name<input className="inp mt-1" value={f.name} maxLength={NAME_MAX} autoComplete="name" onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label className={lbl}>Username<input className="inp mt-1" value={f.username} maxLength={30} autoComplete="username" placeholder="e.g. alex_dev" onChange={e => setF({ ...f, username: e.target.value })} /></label>
          <label className={lbl}>Email<input className="inp mt-1" type="email" value={f.email} autoComplete="email" onChange={e => setF({ ...f, email: e.target.value })} /></label>
          {emailChanged && <label className={lbl}>Current password (needed to change your email)<input className="inp mt-1" type="password" value={emailPw} autoComplete="current-password" onChange={e => setEmailPw(e.target.value)} /></label>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={lbl}>College / University<input className="inp mt-1" value={f.college} maxLength={120} autoComplete="organization" onChange={e => setF({ ...f, college: e.target.value })} /></label>
            <label className={lbl}>Course<input className="inp mt-1" value={f.course} maxLength={120} placeholder="e.g. B.Tech" onChange={e => setF({ ...f, course: e.target.value })} /></label>
            <label className={lbl}>Branch<input className="inp mt-1" value={f.branch} maxLength={120} placeholder="e.g. Computer Science" onChange={e => setF({ ...f, branch: e.target.value })} /></label>
            <label className={lbl}>Year of study<select className="inp mt-1" value={f.year_of_study} onChange={e => setF({ ...f, year_of_study: e.target.value })}><option value="">Not set</option>{YEAR_OPTIONS.map(y => <option key={y} value={y}>{y === 'Other' ? 'Other' : `Year ${y}`}</option>)}</select></label>
          </div>
          <label className={lbl}>Bio<textarea className="inp mt-1" rows={3} maxLength={BIO_MAX} value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} /><span className="mt-1 block text-right text-[11px] text-sky-100/50">{f.bio.length}/{BIO_MAX}</span></label>
          <div className="flex flex-wrap items-center gap-3"><button className="btn" disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            {dirty && <button type="button" className="btn-ghost" onClick={() => { applyProfile(p); setEmailPw(''); setPMsg(null); }}>Discard</button>}<Note m={pMsg} /></div>
        </form>

        <section className="card st-section" aria-label="Appearance">
          <Head Icon={Palette} title="Appearance" sub="Your choice is saved to your account and remembered on this device." />
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
            {THEME_MODES.map(m => { const t = THEME_INFO[m]; return (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className="st-tile" onClick={() => chooseTheme(m)}>
                <span className="st-swatch" aria-hidden><span style={{ flex: 1, background: t.bg[0] }} /><span style={{ flex: 1, background: t.bg[1] }} /><span style={{ flex: .5, background: t.bg[2] }} /></span>
                <span className="flex items-center gap-1.5"><t.Icon className="h-4 w-4" />{t.label}</span><span className="text-[11px] font-normal text-sky-100/60">{t.hint}</span>
              </button>); })}
          </div>
          <div className="mt-2 min-h-[1.25rem]"><Note m={tMsg} /></div>
        </section>

        <section className="card st-section" aria-label="Notifications">
          <Head Icon={Bell} title="Notifications" />
          <div className="flex items-center justify-between gap-4"><div><div className="text-sm font-semibold">Enable notifications</div><div className="text-xs text-sky-100/60">Reminders and updates inside Learnjectory.</div></div>
            <button type="button" role="switch" aria-checked={!!p.notifications} aria-label="Enable notifications" className="st-switch" onClick={toggleNotifications} /></div>
          <div className="mt-2 min-h-[1.25rem]"><Note m={nMsg} /></div>
        </section>

        <section className="card st-section" aria-label="Security">
          <Head Icon={ShieldCheck} title="Security" sub="Use a strong password you don't use anywhere else." />
          <form onSubmit={changePassword} className="space-y-3">
            <label className={lbl}>Current password<input className="inp mt-1" type="password" autoComplete="current-password" value={pw.cur} onChange={e => setPw({ ...pw, cur: e.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={lbl}>New password (8+ characters)<input className="inp mt-1" type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} /></label>
              <label className={lbl}>Confirm new password<input className="inp mt-1" type="password" autoComplete="new-password" value={pw.again} onChange={e => setPw({ ...pw, again: e.target.value })} /></label>
            </div>
            <div className="flex flex-wrap items-center gap-3"><button className="btn" disabled={pwBusy || !pw.cur || !pw.next || !pw.again}><KeyRound className="h-4 w-4" />{pwBusy ? 'Changing…' : 'Change password'}</button><Note m={pwMsg} /></div>
          </form>
          <div className="mt-4 border-t border-[rgba(167,139,250,.18)] pt-4">
            <div className="text-sm font-semibold">Sign out of all devices</div><p className="mb-2 text-xs text-sky-100/60">Ends every active session, including this one.</p>
            {confirmSignOut ? <div className="flex flex-wrap items-center gap-2"><button type="button" className="btn" onClick={signOutEverywhere}><LogOut className="h-4 w-4" />Yes, sign out everywhere</button><button type="button" className="btn-ghost" onClick={() => setConfirmSignOut(false)}>Cancel</button></div>
              : <button type="button" className="btn-ghost" onClick={() => { setConfirmSignOut(true); setSMsg(null); }}><LogOut className="h-4 w-4" />Sign out everywhere</button>}
            <div className="mt-2"><Note m={sMsg} /></div>
          </div>
        </section>

        <section className="card st-section" aria-label="Log out">
          <Head Icon={LogOut} title="Log out" sub="End your session on this device." />
          <button type="button" className="btn-ghost" onClick={async () => { await logout(); nv('/login', { replace: true }); }}><LogOut className="h-4 w-4" />Log out</button>
        </section>

        <section className="card st-section" aria-label="Your data">
          <Head Icon={Database} title="Your data" sub="Download a copy of everything stored for your account (JSON). Your password and photo are not included." />
          <div className="flex flex-wrap items-center gap-3"><button type="button" className="btn-ghost" disabled={xBusy} onClick={exportData}><Download className="h-4 w-4" />{xBusy ? 'Preparing…' : 'Download my data'}</button><Note m={xMsg} /></div>
        </section>

        <section className="card st-section st-danger" aria-label="Delete account">
          <Head Icon={AlertTriangle} title="Delete account" sub="Permanently removes your account and everything in it: goals, notes, files, posts and settings. This cannot be undone." />
          {!del.open ? <button type="button" className="btn-danger" onClick={() => setDel({ open: true, pw: '', word: '' })}><Trash2 className="h-4 w-4" />Delete my account</button> : (
            <form onSubmit={deleteAccount} className="space-y-3">
              <label className={lbl}>Your password<input className="inp mt-1" type="password" autoComplete="current-password" value={del.pw} onChange={e => setDel({ ...del, pw: e.target.value })} /></label>
              <label className={lbl}>Type <b>DELETE</b> to confirm<input className="inp mt-1" value={del.word} autoComplete="off" onChange={e => setDel({ ...del, word: e.target.value })} /></label>
              <div className="flex flex-wrap items-center gap-3"><button className="btn-danger" disabled={dBusy || !del.pw || del.word !== 'DELETE'}>{dBusy ? 'Deleting…' : 'Permanently delete'}</button><button type="button" className="btn-ghost" disabled={dBusy} onClick={() => { setDel({ open: false, pw: '', word: '' }); setDMsg(null); }}>Cancel</button><Note m={dMsg} /></div>
            </form>)}
        </section>
      </div>
    </div>
  );
}
