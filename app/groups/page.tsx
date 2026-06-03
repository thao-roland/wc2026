import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import GroupsClient from './groups-client';

export default function GroupsPage() {
  const s = getSession();
  if (!s) redirect('/login');
  return (
    <div>
      <h1 className="text-3xl font-extrabold mb-6">Your groups</h1>
      <GroupsClient />
    </div>
  );
}
