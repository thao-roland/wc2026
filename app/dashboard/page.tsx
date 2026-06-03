import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import MatchList from './match-list';

export default function DashboardPage() {
  const s = getSession();
  if (!s) redirect('/login');
  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-3xl font-extrabold">Matches</h1>
        <p className="text-sm text-slate-400">Predictions lock at kickoff.</p>
      </div>
      <MatchList />
    </div>
  );
}
