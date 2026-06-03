import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import AdminClient from './admin-client';

export default function AdminPage() {
  const s = getSession();
  if (!s) redirect('/login');
  const owns = getDb().prepare('SELECT 1 FROM groups WHERE created_by = ? LIMIT 1').get(s.uid);
  if (!owns) {
    return (
      <div className="card max-w-lg">
        <h1 className="text-2xl font-extrabold mb-2">Admin</h1>
        <p className="text-slate-400">
          You need to create a group first to access the admin panel.
        </p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-3xl font-extrabold mb-6">Admin — match results</h1>
      <AdminClient />
    </div>
  );
}
