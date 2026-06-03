import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default function Home() {
  const s = getSession();
  if (s) redirect('/dashboard');

  return (
    <section className="grid md:grid-cols-2 gap-10 items-center mt-10">
      <div>
        <h1 className="text-5xl md:text-6xl font-extrabold leading-tight">
          Predict the <span className="text-neon-green">World Cup</span>.
          <br />
          Crush your <span className="text-neon-gold">friends</span>.
        </h1>
        <p className="mt-5 text-slate-300 text-lg max-w-md">
          A private game for the 2026 FIFA World Cup. Call the scores, earn
          points, rule the leaderboard. No money. Just pride.
        </p>
        <div className="mt-7 flex gap-3">
          <Link href="/register" className="btn-primary">Create account</Link>
          <Link href="/login" className="btn-ghost">I&apos;ve got one</Link>
        </div>
      </div>
      <div className="card">
        <h3 className="font-bold text-lg mb-3">Scoring</h3>
        <ul className="space-y-2 text-sm text-slate-200">
          <li className="flex justify-between"><span>Exact score</span><span className="chip-green">7 pts</span></li>
          <li className="flex justify-between"><span>Right winner + one team&apos;s score</span><span className="chip-green">4 pts</span></li>
          <li className="flex justify-between"><span>Right winner</span><span className="chip-gold">2 pts</span></li>
          <li className="flex justify-between"><span>Called the draw</span><span className="chip-gold">2 pts</span></li>
          <li className="flex justify-between"><span>One team&apos;s score, wrong winner</span><span className="chip-slate">1 pt</span></li>
          <li className="flex justify-between"><span>Miss</span><span className="chip-slate">0 pts</span></li>
        </ul>
      </div>
    </section>
  );
}
