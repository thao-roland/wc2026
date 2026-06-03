import { NextResponse } from 'next/server';
import { getDb, type Match } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * Admin = any user who created at least one group. (Simple gate, matches the
 * "group creator is admin" spec.)
 */
function isAdmin(uid: number): boolean {
  const r = getDb()
    .prepare('SELECT 1 FROM groups WHERE created_by = ? LIMIT 1')
    .get(uid);
  return !!r;
}

export async function GET() {
  const s = getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(s.uid)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const matches = getDb()
    .prepare('SELECT * FROM matches ORDER BY match_date, id')
    .all() as Match[];
  return NextResponse.json({ matches });
}
