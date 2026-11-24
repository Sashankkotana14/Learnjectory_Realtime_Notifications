import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { pages } from '../config';
export default function Search() {
  const [p] = useSearchParams(), q = p.get('q') || '', [r, setR] = useState<any[]>([]);
  useEffect(() => { api('/search?q=' + encodeURIComponent(q)).then(setR); }, [q]);
  const route = (t: string) => Object.entries(pages).find(([, c]) => c.res === t)?.[0] || '';
  return (
    <div><h1 className="mb-4 text-2xl font-extrabold">Results for "{q}"</h1>
      {!r.length && <div className="card text-sm">No matches found.</div>}
      <div className="space-y-2">{r.map((x, i) => <Link key={i} to={'/' + route(x.type)} className="card block !py-3 text-sm"><span className="text-sky-300">{x.label}</span> · {x.title}</Link>)}</div></div>
  );
}
