import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { api } from '../api';
export default function Login() {
  const [reg, setReg] = useState(false), [f, setF] = useState({ name: '', email: '', password: '' }), [err, setErr] = useState(''), nv = useNavigate();
  const go = async (e: any) => { e.preventDefault(); setErr(''); try { const d = await api(reg ? '/auth/register' : '/auth/login', 'POST', f); localStorage.setItem('token', d.token); nv('/'); } catch (x: any) { setErr(x.message); } };
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={go} className="card w-full max-w-sm space-y-3">
        <div className="flex items-center gap-2 text-xl font-extrabold"><GraduationCap className="text-sky-300" />Learnjectory</div>
        <p className="text-sm text-sky-100/70">{reg ? 'Create your account' : 'Welcome back — sign in to continue'}</p>
        {reg && <input className="inp" placeholder="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />}
        <input className="inp" type="email" required autoComplete="email" placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        <input className="inp" type="password" required minLength={reg ? 8 : 1} autoComplete={reg ? 'new-password' : 'current-password'} placeholder="Password (8+ chars)" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
        {err && <div className="text-sm text-rose-300">{err}</div>}
        <button className="btn w-full justify-center">{reg ? 'Register' : 'Login'}</button>
        <button type="button" className="w-full text-xs text-sky-300" onClick={() => { setReg(!reg); setErr(''); if (!reg) setF({ name: '', email: '', password: '' }); }}>{reg ? 'Have an account? Login' : 'New here? Register'}</button>
      </form>
    </div>
  );
}
