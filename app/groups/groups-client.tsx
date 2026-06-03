'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

type Row = {
  id: number;
  name: string;
  invite_code: string;
  created_by: number;
  my_status: 'pending' | 'active';
};

export default function GroupsClient() {
  const [groups, setGroups] = useState<Row[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const r = await fetch('/api/groups');
    const j = await r.json();
    setGroups(j.groups || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    setErr(null);
    setMsg(null);
    const r = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const j = await r.json();
    if (!r.ok) return setErr(j.error || 'Failed');
    setName('');
    setMsg(`Created — invite code: ${j.group.invite_code}`);
    load();
  }

  async function join() {
    setErr(null);
    setMsg(null);
    const r = await fetch('/api/groups/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invite_code: code }),
    });
    const j = await r.json();
    if (!r.ok) return setErr(j.error || 'Failed');
    setCode('');
    setMsg(
      j.status === 'active'
        ? `You're already in "${j.group.name}".`
        : `Requested to join "${j.group.name}". Waiting for the owner.`,
    );
    load();
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2">
        {groups.length === 0 ? (
          <p className="text-slate-400">You&apos;re not in any groups yet — create or join one.</p>
        ) : (
          <div className="grid gap-3">
            {groups.map((g) => (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="card flex items-center justify-between"
              >
                <div>
                  <h3 className="text-lg font-bold">{g.name}</h3>
                  <p className="text-xs text-slate-400">Invite: <span className="font-mono text-neon-gold">{g.invite_code}</span></p>
                </div>
                <div className="flex items-center gap-3">
                  {g.my_status === 'pending' ? (
                    <span className="chip-slate">Pending approval</span>
                  ) : (
                    <Link href={`/group/${g.id}`} className="btn-primary">Open</Link>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="card">
          <h3 className="font-bold mb-2">Create a group</h3>
          <input
            className="input mb-2"
            placeholder="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button onClick={create} className="btn-primary w-full">Create</button>
        </div>
        <div className="card">
          <h3 className="font-bold mb-2">Join a group</h3>
          <input
            className="input mb-2 font-mono"
            placeholder="INVITE CODE"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button onClick={join} className="btn-gold w-full">Request to join</button>
        </div>
        {msg && <p className="text-sm text-neon-green">{msg}</p>}
        {err && <p className="text-sm text-red-400">{err}</p>}
      </div>
    </div>
  );
}
