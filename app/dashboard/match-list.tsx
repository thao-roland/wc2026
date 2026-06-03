'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

type Prediction = {
  id: number;
  pred_home: number;
  pred_away: number;
  points_earned: number | null;
};

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
  prediction: Prediction | null;
};

type Filter = 'all' | 'group' | 'knockout';

export default function MatchList() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  async function load(f: Filter) {
    setLoading(true);
    const qs = f === 'all' ? '' : `?stage=${f}`;
    const res = await fetch(`/api/matches${qs}`);
    const j = await res.json();
    setMatches(j.matches || []);
    setLoading(false);
  }

  useEffect(() => {
    load(filter);
  }, [filter]);

  return (
    <div>
      <div className="flex gap-2 mb-5">
        {(['all', 'group', 'knockout'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'px-3 py-1.5 rounded-md text-sm font-semibold border',
              filter === f
                ? 'bg-neon-green text-pitch-950 border-neon-green'
                : 'bg-pitch-800 border-pitch-700 text-slate-300 hover:bg-pitch-700',
            )}
          >
            {f === 'all' ? 'All' : f === 'group' ? 'Group stage' : 'Knockout'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="grid gap-3">
          <AnimatePresence initial={false}>
            {matches.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <MatchCard m={m} onSaved={() => load(filter)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function MatchCard({ m, onSaved }: { m: MatchRow; onSaved: () => void }) {
  const kickoff = new Date(m.match_date);
  const locked = m.status !== 'upcoming' || Date.now() >= kickoff.getTime();

  const [h, setH] = useState<string>(m.prediction ? String(m.prediction.pred_home) : '');
  const [a, setA] = useState<string>(m.prediction ? String(m.prediction.pred_away) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const res = await fetch('/api/predictions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        match_id: m.id,
        pred_home: Number(h),
        pred_away: Number(a),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || 'Failed to save');
      return;
    }
    onSaved();
  }

  return (
    <div className="card flex flex-col md:flex-row md:items-center gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{m.stage}{m.group_name ? ` · Group ${m.group_name}` : ''}</span>
          <span>·</span>
          <time dateTime={m.match_date}>
            {kickoff.toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
          {m.status === 'live' && <span className="chip-gold ml-2">LIVE</span>}
          {m.status === 'finished' && <span className="chip-green ml-2">FT</span>}
        </div>
        <div className="mt-2 flex items-center gap-3 text-lg font-bold">
          <span className="flex-1 text-right">{m.team_home}</span>
          <span className="text-slate-400 text-sm">vs</span>
          <span className="flex-1">{m.team_away}</span>
        </div>
        {m.status === 'finished' && (
          <div className="mt-1 text-center text-neon-green font-extrabold tracking-widest">
            {m.score_home} – {m.score_away}
          </div>
        )}
      </div>

      <div className="md:w-72">
        {locked ? (
          <LockedView m={m} />
        ) : (
          <div className="flex items-center gap-2">
            <input
              className="input w-14 text-center"
              type="number"
              min={0}
              max={20}
              value={h}
              onChange={(e) => setH(e.target.value)}
              placeholder="–"
            />
            <span className="text-slate-500">:</span>
            <input
              className="input w-14 text-center"
              type="number"
              min={0}
              max={20}
              value={a}
              onChange={(e) => setA(e.target.value)}
              placeholder="–"
            />
            <button onClick={save} disabled={busy || h === '' || a === ''} className="btn-primary">
              {busy ? '…' : m.prediction ? 'Update' : 'Predict'}
            </button>
          </div>
        )}
        {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
      </div>
    </div>
  );
}

function LockedView({ m }: { m: MatchRow }) {
  if (!m.prediction) {
    return <p className="text-xs text-slate-500 text-right">Locked — no prediction submitted</p>;
  }
  const pts = m.prediction.points_earned;
  return (
    <div className="text-right">
      <p className="text-xs text-slate-400">Your call</p>
      <p className="text-lg font-bold">
        {m.prediction.pred_home} – {m.prediction.pred_away}
      </p>
      {pts !== null && (
        <span
          className={clsx(
            'chip mt-1',
            pts >= 7 ? 'chip-green' : pts >= 2 ? 'chip-gold' : 'chip-slate',
          )}
        >
          +{pts} pts
        </span>
      )}
    </div>
  );
}
