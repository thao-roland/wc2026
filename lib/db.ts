import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'wc2026.db');
const SCHEMA_PATH = path.join(process.cwd(), 'db', 'schema.sql');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  if (fs.existsSync(SCHEMA_PATH)) {
    db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
  }
  _db = db;
  return db;
}

export type User = {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
};

export type Group = {
  id: number;
  name: string;
  invite_code: string;
  created_by: number;
  created_at: string;
};

export type GroupMember = {
  group_id: number;
  user_id: number;
  status: 'pending' | 'active';
  joined_at: string;
};

export type Match = {
  id: number;
  stage: string;
  group_name: string | null;
  team_home: string;
  team_away: string;
  match_date: string;
  score_home: number | null;
  score_away: number | null;
  status: 'upcoming' | 'live' | 'finished';
};

export type Prediction = {
  id: number;
  user_id: number;
  match_id: number;
  pred_home: number;
  pred_away: number;
  submitted_at: string;
  points_earned: number | null;
};
