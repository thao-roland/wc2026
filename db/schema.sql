PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('pending','active')) DEFAULT 'pending',
  joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  stage       TEXT NOT NULL,
  group_name  TEXT,
  team_home   TEXT NOT NULL,
  team_away   TEXT NOT NULL,
  match_date  TEXT NOT NULL,
  score_home  INTEGER,
  score_away  INTEGER,
  status      TEXT NOT NULL CHECK (status IN ('upcoming','live','finished')) DEFAULT 'upcoming'
);

CREATE TABLE IF NOT EXISTS predictions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id      INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  pred_home     INTEGER NOT NULL,
  pred_away     INTEGER NOT NULL,
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  points_earned INTEGER,
  UNIQUE (user_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_date     ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_status   ON matches(status);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user  ON predictions(user_id);
