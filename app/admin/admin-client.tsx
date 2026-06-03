'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

type MatchRow = {
  id: number;
  stage: string;
  group_name: string | null;
  team_home: string;
  team_away: string;
  match_date: string;
  score_home: number | null;
  score_away: number | null;
  status: 'upcoming' | 'live' | 'finished';
};

export default function AdminClient() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [q, setQ] = useState('');

  async function load() {
    const r = await fetch('/api/admin/matches');
    const j = await r.json();
    setMatches(j.matches || []);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    if (!t) return matches;
    return matches.filter(
      (m) =>
        m.team_home.toLowerCase().includes(t) ||
        m.team_away.toLowerCase().includes(t) ||
        m.stage.toLowerCase().includes(t) ||
        (m.group_name || '').toLowerCase().includes(t),
    );
  }, [matches, q]);

  return (
    <div>
      <input
        className="input mb-4 max-w-sm"
        placeholder="Filter by team or stage…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="grid gap-3">
        {filtered.map((m) => (
          <AdminRow key={m.id} m={m} onChange={load} />
        ))}
      </div>
    </div>
  );
}

function AdminRow({ m, onChange }: { m: MatchRow; onChange: () => void }) {
  const [h, setH] = useState<string>(m.score_home === null ? '' : String(m.score_home));
  const [a, setA] = useState<string>(m.score_away === null ? '' : String(m.score_away));
  const [status, setStatus] = useState<MatchRow['status']>(m.status);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/matches/${m.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        score_home: h === '' ? null : Number(h),
        score_away: a === '' ? null : Number(a),
        status,
      }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(j.error || 'Failed');
    setMsg(`Saved · recalculated ${j.recalculated} predictions`);
    onChange();
  }

  async function recalc() {
    setBusy(true);
    const res = await fetch(`/api/admin/matches/${m.id}?action=recalc`, { method: 'POST' });
    const j = await res.json();
    setBusy(false);
    setMsg(`Recalculated ${j.recalculated} predictions`);
  }

  return (
    <div className="card grid md:grid-cols-[1fr,auto] gap-3 items-center">
      <div>
        <p className="text-xs text-slate-400">
          {m.stage}{m.group_name ? ` · Group ${m.group_name}` : ''} ·{' '}
          {new Date(m.match_date).toLocaleString()}
        </p>
        <p className="text-lg font-bold">
          {m.team_home} <span className="text-slate-500">vs</span> {m.team_away}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input w-16 text-center"
          type="number"
          min={0}
          max={20}
          value={h}
          onChange={(e) => setH(e.target.value)}
        />
        <span className="text-slate-500">:</span>
        <input
          className="input w-16 text-center"
          type="number"
          min={0}
          max={20}
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
        <select
          className="input w-32"
          value={status}
          onChange={(e) => setStatus(e.target.value as MatchRow['status'])}
        >
          <option value="upcoming">upcoming</option>
          <option value="live">live</option>
          <option value="finished">finished</option>
        </select>
        <button disabled={busy} onClick={save} className="btn-primary">Save</button>
        <button disabled={busy} onClick={recalc} className="btn-ghost">Recalc</button>
      </div>
      {msg && (
        <p className={clsx('md:col-span-2 text-xs', msg.startsWith('Saved') || msg.startsWith('Recalc') ? 'text-neon-green' : 'text-red-400')}>
          {msg}
        </p>
      )}
    </div>
  );
}
