/**
 * Seeds the SQLite DB with the 2026 FIFA World Cup schedule.
 * 48 teams, 12 groups of 4 (A-L).
 *   - Group stage : 72 matches  (each group plays 6)
 *   - Round of 32 : 16
 *   - Round of 16 :  8
 *   - Quarterfinals: 4
 *   - Semifinals  : 2
 *   - Third place : 1
 *   - Final       : 1
 *   Total         : 104
 */

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'wc2026.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));

const groups = {
  A: ['Mexico', 'Poland', 'New Zealand', 'Saudi Arabia'],
  B: ['Canada', 'Belgium', 'Ecuador', 'Tunisia'],
  C: ['USA', 'Germany', 'Senegal', 'Uzbekistan'],
  D: ['Argentina', 'Croatia', 'Ivory Coast', 'Jordan'],
  E: ['France', 'Japan', 'Switzerland', 'Cape Verde'],
  F: ['Brazil', 'Netherlands', 'South Korea', 'Curaçao'],
  G: ['Portugal', 'Denmark', 'Australia', 'Panama'],
  H: ['Spain', 'Morocco', 'Paraguay', 'Haiti'],
  I: ['England', 'Norway', 'Egypt', 'New Caledonia'],
  J: ['Austria', 'Uruguay', 'Algeria', 'Jamaica'],
  K: ['Italy', 'Colombia', 'Iran', 'Ghana'],
  L: ['Türkiye', 'Scotland', 'Qatar', 'Honduras'],
};

const PAIRS = [
  [0, 1], [2, 3],
  [0, 2], [1, 3],
  [0, 3], [1, 2],
];

let cursor = new Date('2026-06-11T16:00:00Z');
function isoStep(minutes) {
  const d = new Date(cursor.getTime());
  cursor = new Date(cursor.getTime() + minutes * 60 * 1000);
  return d.toISOString();
}

const matches = [];

const groupKeys = Object.keys(groups);
for (let p = 0; p < PAIRS.length; p++) {
  const [a, b] = PAIRS[p];
  for (const g of groupKeys) {
    const teams = groups[g];
    matches.push({
      stage: 'Group Stage',
      group_name: g,
      team_home: teams[a],
      team_away: teams[b],
      match_date: isoStep(180),
    });
  }
}

// R32 bracket placeholders (top 2 of each group + 8 best 3rd-placed)
cursor = new Date('2026-06-28T16:00:00Z');
const r32 = [
  ['1A', '3C/D/E/F'], ['1C', '3A/B/F/H'],
  ['1D', '2F'],       ['1E', '3A/B/C/D'],
  ['1G', '2I'],       ['1H', '2J'],
  ['1I', '3B/E/H/L'], ['1L', '3E/H/I/J'],
  ['2A', '2C'],       ['2B', '2E'],
  ['2D', '2H'],       ['2G', '2K'],
  ['1B', '3G/I/J/K'], ['1F', '3C/D/G/I'],
  ['1J', '3F/G/H/K'], ['1K', '3A/B/D/E'],
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

cursor = new Date('2026-07-14T20:00:00Z');
matches.push({
  stage: 'Semifinals', group_name: null,
  team_home: 'W QF-1', team_away: 'W QF-2',
  match_date: isoStep(1440),
});
matches.push({
  stage: 'Semifinals', group_name: null,
  team_home: 'W QF-3', team_away: 'W QF-4',
  match_date: isoStep(0),
});

matches.push({
  stage: 'Third Place', group_name: null,
  team_home: 'L SF-1', team_away: 'L SF-2',
  match_date: new Date('2026-07-18T20:00:00Z').toISOString(),
});

matches.push({
  stage: 'Final', group_name: null,
  team_home: 'W SF-1', team_away: 'W SF-2',
  match_date: new Date('2026-07-19T20:00:00Z').toISOString(),
});

const ins = db.prepare(
  `INSERT INTO matches (stage, group_name, team_home, team_away, match_date)
   VALUES (@stage, @group_name, @team_home, @team_away, @match_date)`,
);

const existing = db.prepare('SELECT COUNT(*) AS c FROM matches').get();
if (existing.c > 0) {
  console.log(`matches table already has ${existing.c} rows — skipping seed.`);
} else {
  const tx = db.transaction((rows) => { for (const r of rows) ins.run(r); });
  tx(matches);
  console.log(`seeded ${matches.length} matches`);
}
