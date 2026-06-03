'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || 'Something went wrong');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-sm mx-auto card mt-12"
    >
      <h1 className="text-2xl font-extrabold mb-1">
        {mode === 'login' ? 'Welcome back' : 'Join the group'}
      </h1>
      <p className="text-slate-400 text-sm mb-5">
        {mode === 'login' ? 'Sign in to your account.' : 'Pick a username and password.'}
      </p>
      <form onSubmit={submit} className="space-y-3">
        <input
          autoFocus
          required
          minLength={3}
          maxLength={32}
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="input"
        />
        <input
          required
          minLength={6}
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button disabled={busy} className="btn-primary w-full">
          {busy ? '...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-400 text-center">
        {mode === 'login' ? (
          <>No account? <Link className="text-neon-green" href="/register">Sign up</Link></>
        ) : (
          <>Already in? <Link className="text-neon-green" href="/login">Login</Link></>
        )}
      </p>
    </motion.div>
  );
}
