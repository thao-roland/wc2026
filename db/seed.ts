/**
 * Seeds the SQLite DB with the 2026 FIFA World Cup schedule.
 *
 * Format: 48 teams in 12 groups of 4 (A–L).
 *   - Group stage: 72 matches (each group plays 6)
 *   - Round of 32: 16 matches
 *   - Round of 16:  8 matches
 *   - Quarterfinals: 4
 *   - Semifinals:    2
 *   - Third place:   1
 *   - Final:         1
 *
 * Teams reflect the qualified field where known; remaining slots are
 * placeholders. Knockout matchups use bracket placeholders (1A, 2B, etc.)
 * until the group stage completes — admin can rename later.
 *
 * Match dates/times are scheduled placeholders along the official window
 * (June 11 – July 19, 2026). Adjust as the official calendar firms up.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'wc2026.db');
const SCHEMA_PATH = path.join(process.cwd(), 'db', 'schema.sql');

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));

// 12 groups × 4 teams.
const groups: Record<string, [string, string, string, string]> = {
  A: ['Mexico', 'Poland', 'New Zealand', 'Saudi Arabia'],
  B: ['Canada', 'Belgium', 'Ecuador', 'Tunisia'],
  C: ['USA', 'Germany', 'Senegal', 'Uzbekistan'],
  D: ['Argentina', 'Croatia', 'Ivory Coast', 'Jordan'],
  E: ['France', 'Japan', 'Switzerland', 'Cape Verde'],
  F: ['Brazil', 'Netherlands', 'South Korea', 'Curaçao'],
  G: ['Portugal', 'Denmark', 'Australia', 'Panama'],
  H: ['Spain', 'Morocco', 'Paraguay', 'Haiti'],
  I: ['England', 'Norway', 'Egypt', 'New Caledonia'],
  J: ['Netherlands B', 'Uruguay', 'Algeria', 'Jamaica'],
  K: ['Italy', 'Colombia', 'Iran', 'Ghana'],
  L: ['Germany B', 'Mexico B', 'Qatar', 'Honduras'],
};

// To keep the seed honest about an evolving field, allow override list
// for any names you want to swap in. Keep it as 4-tuples.
// e.g. groups.A = ['Mexico','Poland','New Zealand','Saudi Arabia'];

type Row = {
  stage: string;
  group_name: string | null;
  team_home: string;
  team_away: string;
  match_date: string;
};

const matches: Row[] = [];

// Group stage: each of 12 groups plays a 4-team round-robin → 6 matches.
// Pairing order: 1v2, 3v4, 1v3, 2v4, 1v4, 2v3.
const PAIRS: [number, number][] = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
  [0, 3],
  [1, 2],
];

const START = new Date('2026-06-11T16:00:00Z');
let cursor = new Date(START);

function isoStep(daysHoursMin: number): string {
  const d = new Date(cursor.getTime());
  cursor = new Date(cursor.getTime() + daysHoursMin * 60 * 1000);
  return d.toISOString();
}

const groupKeys = Object.keys(groups);

// Spread 72 group matches across ~13 days, ~5–6 per day.
for (let p = 0; p < PAIRS.length; p++) {
  const [a, b] = PAIRS[p];
  for (const g of groupKeys) {
    const teams = groups[g];
    matches.push({
      stage: 'Group Stage',
      group_name: g,
      team_home: teams[a],
      team_away: teams[b],
      match_date: isoStep(180), // +3h
    });
  }
}

// Knockouts: bracket placeholders. Real names get edited in once draws settle.
cursor = new Date('2026-06-28T16:00:00Z');

// Round of 32 — 16 matches. Top 2 from each group + 8 best 3rd-placed.
// We just emit reasonable bracket slots: 1X/2Y/3Z style.
const r32: [string, string][] = [
  ['1A', '3C/D/E/F'],
  ['1C', '3A/B/F/H'],
  ['1D', '2F'],
  ['1E', '3A/B/C/D'],
  ['1G', '2I'],
  ['1H', '2J'],
  ['1I', '3B/E/H/L'],
  ['1L', '3E/H/I/J'],
  ['2A', '2C'],
  ['2B', '2E'],
  ['2D', '2H'],
  ['2G', '2K'],
  ['1B', '3G/I/J/K'],
  ['1F', '3C/D/G/I'],
  ['1J', '3F/G/H/K'],
  ['1K', '3A/B/D/E'],
];
for (const [h, a] of r32) {
  matches.push({
    stage: 'Round of 32',
    group_name: null,
    team_home: h,
    team_away: a,
    match_date: isoStep(180),
  });
}

// Round of 16 — 8 matches.
cursor = new Date('2026-07-04T16:00:00Z');
for (let i = 1; i <= 8; i++) {
  matches.push({
    stage: 'Round of 16',
    group_name: null,
    team_home: `W R32-${i * 2 - 1}`,
    team_away: `W R32-${i * 2}`,
    match_date: isoStep(360),
  });
}

// Quarterfinals — 4 matches.
cursor = new Date('2026-07-09T16:00:00Z');
for (let i = 1; i <= 4; i++) {
  matches.push({
    stage: 'Quarterfinals',
    group_name: null,
    team_home: `W R16-${i * 2 - 1}`,
    team_away: `W R16-${i * 2}`,
    match_date: isoStep(720),
  });
}

// Semifinals — 2 matches.
cursor = new Date('2026-07-14T20:00:00Z');
matches.push({
  stage: 'Semifinals',
  group_name: null,
  team_home: 'W QF-1',
  team_away: 'W QF-2',
  match_date: isoStep(1440),
});
matches.push({
  stage: 'Semifinals',
  group_name: null,
  team_home: 'W QF-3',
  team_away: 'W QF-4',
  match_date: isoStep(0),
});

// Third place.
matches.push({
  stage: 'Third Place',
  group_name: null,
  team_home: 'L SF-1',
  team_away: 'L SF-2',
  match_date: new Date('2026-07-18T20:00:00Z').toISOString(),
});

// Final.
matches.push({
  stage: 'Final',
  group_name: null,
  team_home: 'W SF-1',
  team_away: 'W SF-2',
  match_date: new Date('2026-07-19T20:00:00Z').toISOString(),
});

const ins = db.prepare(
  `INSERT INTO matches (stage, group_name, team_home, team_away, match_date)
   VALUES (@stage, @group_name, @team_home, @team_away, @match_date)`,
);

const existing = db.prepare('SELECT COUNT(*) as c FROM matches').get() as { c: number };
if (existing.c > 0) {
  console.log(`matches table already has ${existing.c} rows — skipping seed.`);
} else {
  const tx = db.transaction((rows: Row[]) => {
    for (const r of rows) ins.run(r);
  });
  tx(matches);
  console.log(`seeded ${matches.length} matches`);
}
