import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import LogoutButton from '@/components/LogoutButton';

export const metadata: Metadata = {
  title: 'WC26 Bets — Friends Only',
  description: 'Private 2026 World Cup prediction game.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  return (
    <html lang="en">
      <body className="font-display">
        <header className="border-b border-pitch-700/70 bg-pitch-950/80 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
              <span className="text-neon-green text-xl">⚽</span>
              <span className="text-white">WC26<span className="text-neon-gold">.bets</span></span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {session && (
                <>
                  <Link href="/dashboard" className="text-slate-300 hover:text-white">Matches</Link>
                  <Link href="/groups" className="text-slate-300 hover:text-white">Groups</Link>
                  <Link href="/admin" className="text-slate-300 hover:text-white">Admin</Link>
                </>
              )}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              {session ? (
                <>
                  <span className="text-slate-400">@{session.username}</span>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Link href="/login" className="text-slate-300 hover:text-white">Login</Link>
                  <Link href="/register" className="btn-primary">Sign up</Link>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-xs text-slate-500">
          No real money. Just bragging rights.
        </footer>
      </body>
    </html>
  );
}
