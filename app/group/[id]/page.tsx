import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import GroupView from './group-view';

export default function GroupPage({ params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) redirect('/login');
  return <GroupView groupId={Number(params.id)} />;
}
