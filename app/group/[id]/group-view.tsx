'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

type Group = { id: number; name: string; invite_code: string; created_by: number };
type Member = { id: number; username: string; status: 'active' | 'pending'; joined_at: string };
type LbRow = {
  user_id: number;
  username: string;
  total_points: number;
  exact_scores: number;
  correct_winners: number;
  scored_predictions: number;
};

export default function GroupView({ groupId }: { groupId: number }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [leaderboard, setLeaderboard] = useState<LbRow[]>([]);
  const [me, setMe] = useState<number | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [m, l] = await Promise.all([
      fetch(`/api/groups/${groupId}/members`).then((r) => r.json()),
      fetch(`/api/groups/${groupId}/leaderboard`).then((r) => r.json()),
    ]);
    if (m.error) {
      setErr(m.error);
      return;
    }
    setGroup(m.group);
    setMembers(m.members);
    setIsOwner(!!m.is_owner);
    setLeaderboard(l.leaderboard || []);
    setMe(l.me ?? null);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(user_id: number, action: 'approve' | 'reject') {
    await fetch(`/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id, action }),
    });
    load();
  }

  if (err) return <p className="text-red-400">{err}</p>;
  if (!group) return <p className="text-slate-400">Loading…</p>;

  const pending = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status === 'active');

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{group.name}</h1>
          <p className="text-sm text-slate-400">
            Invite code:{' '}
            <span className="font-mono text-neon-gold">{group.invite_code}</span>
          </p>
        </div>
        <p className="text-sm text-slate-400">{active.length} member{active.length === 1 ? '' : 's'}</p>
      </header>

      <section className="card">
        <h2 className="text-xl font-bold mb-3">Leaderboard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr className="table-row">
                <th className="py-2 w-10">#</th>
                <th>Player</th>
                <th className="text-right">Points</th>
                <th className="text-right">Exact</th>
                <th className="text-right">Winners</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r, i) => (
                <motion.tr
                  key={r.user_id}
                  layout
                  className={clsx(
                    'table-row',
                    r.user_id === me && 'bg-neon-green/10',
                  )}
                >
                  <td className="py-2 font-bold">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </td>
                  <td className="font-semibold">
                    {r.username}
                    {r.user_id === me && <span className="ml-2 chip-green">you</span>}
                  </td>
                  <td className="text-right font-extrabold text-neon-green">{r.total_points}</td>
                  <td className="text-right">{r.exact_scores}</td>
                  <td className="text-right">{r.correct_winners}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isOwner && pending.length > 0 && (
        <section className="card">
          <h2 className="text-xl font-bold mb-3">Pending requests</h2>
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <span>{p.username}</span>
                <div className="flex gap-2">
                  <button onClick={() => decide(p.id, 'approve')} className="btn-primary">Approve</button>
                  <button onClick={() => decide(p.id, 'reject')} className="btn-ghost">Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="text-xl font-bold mb-3">Members</h2>
        <ul className="grid sm:grid-cols-2 gap-2 text-sm">
          {active.map((m) => (
            <li key={m.id} className="flex items-center justify-between">
              <span>{m.username}</span>
              {m.id === group.created_by && <span className="chip-gold">Owner</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
