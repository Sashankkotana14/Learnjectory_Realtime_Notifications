import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { api } from '../api';
import type { Cfg } from '../config';
export default function Resource({ cfg }: { cfg: Cfg }) {
  const [rows, setRows] = useState<any[]>([]), [f, setF] = useState<any>(null), [err, setErr] = useState('');
  const load = () => api('/' + cfg.res).then(setRows).catch(e => setErr(e.message));
  useEffect(() => { setF(null); load(); }, [cfg.res]);
  const save = async (e: any) => {
    e.preventDefault(); setErr('');
    try { f.id ? await api(`/${cfg.res}/${f.id}`, 'PUT', f) : await api('/' + cfg.res, 'POST', f); setF(null); load(); } catch (x: any) { setErr(x.message); }
  };
  const del = async (id: number) => { if (confirm('Delete this item?')) { await api(`/${cfg.res}/${id}`, 'DELETE'); load(); } };
  const toggle = async (r: any, k: string) => { await api(`/${cfg.res}/${r.id}`, 'PUT', { [k]: r[k] ? 0 : 1 }); load(); };
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-extrabold">{cfg.title}</h1>
        <button className="btn" onClick={() => setF(Object.fromEntries(cfg.fields.map(x => [x.k, x.type === 'pct' || x.type === 'number' ? 0 : x.type === 'bool' ? 0 : x.options ? x.options[0] : ''])))}><Plus className="h-4 w-4" />Add</button></div>
      {err && <div className="mb-3 text-sm text-rose-300">{err}</div>}
      {f && (
        <form onSubmit={save} className="card mb-4 grid gap-3 sm:grid-cols-2">
          {cfg.fields.map(x => (
            <label key={x.k} className={`text-xs text-sky-200 ${x.type === 'area' ? 'sm:col-span-2' : ''}`}>{x.label}
              {x.type === 'area' ? <textarea className="inp mt-1" rows={3} value={f[x.k] ?? ''} onChange={e => setF({ ...f, [x.k]: e.target.value })} />
                : x.type === 'select' ? <select className="inp mt-1" value={f[x.k]} onChange={e => setF({ ...f, [x.k]: e.target.value })}>{x.options!.map(o => <option key={o}>{o}</option>)}</select>
                : x.type === 'bool' ? <input type="checkbox" className="mt-2 block h-5 w-5" checked={!!f[x.k]} onChange={e => setF({ ...f, [x.k]: e.target.checked ? 1 : 0 })} />
                : <input className="inp mt-1" type={x.type === 'pct' || x.type === 'number' ? 'number' : x.type === 'date' ? 'date' : 'text'} min={0} max={x.type === 'pct' ? 100 : undefined} value={f[x.k] ?? ''} onChange={e => setF({ ...f, [x.k]: x.type === 'pct' || x.type === 'number' ? Number(e.target.value) : e.target.value })} />}
            </label>))}
          <div className="flex gap-2 sm:col-span-2"><button className="btn">{f.id ? 'Update' : 'Save'}</button><button type="button" className="rounded-full border border-blue-500/40 px-4 text-sm" onClick={() => setF(null)}><X className="inline h-4 w-4" /> Cancel</button></div>
        </form>)}
      {!rows.length && <div className="card text-center text-sm text-sky-100/70">Nothing here yet — click Add to get started.</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(r => (
          <div key={r.id} className="card">
            <div className="mb-2 flex items-start justify-between gap-2"><div className="font-bold">{r[cfg.titleKey]}</div>
              <div className="flex gap-2 text-sky-300"><button onClick={() => setF(r)}><Pencil className="h-4 w-4" /></button><button onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></button></div></div>
            {cfg.fields.filter(x => x.k !== cfg.titleKey).map(x => (
              <div key={x.k} className="mb-1 text-xs text-sky-100/80">
                {x.type === 'pct' ? <><div className="flex justify-between"><span>{x.label}</span><span>{r[x.k]}%</span></div><div className="h-1.5 rounded bg-white/10"><div className="h-full rounded bg-sky-400" style={{ width: r[x.k] + '%' }} /></div></>
                  : x.type === 'bool' ? <label className="flex items-center gap-2"><input type="checkbox" checked={!!r[x.k]} onChange={() => toggle(r, x.k)} />{x.label}</label>
                  : r[x.k] ? <><span className="text-sky-300">{x.label}: </span>{r[x.k]}</> : null}
              </div>))}
          </div>))}
      </div>
    </div>
  );
}
