/**
 * Minimal Node HTTP server.
 *  - serves /public as static
 *  - handles /api/* JSON routes against SQLite
 *  - JWT session via httpOnly cookie
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

const { getDb } = require('./lib/db');
const {
  signSession, readSession, sessionCookie, clearCookie,
  hashPassword, verifyPassword,
} = require('./lib/auth');
const { recalcMatchPoints } = require('./lib/recalc');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

// ---------- helpers ----------

function send(res, status, body, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json; charset=utf-8', ...extraHeaders };
  res.writeHead(status, headers);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function sendError(res, status, error) {
  send(res, status, { error });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function requireSession(req, res) {
  const s = readSession(req);
  if (!s) {
    sendError(res, 401, 'Unauthorized');
    return null;
  }
  return s;
}

function isGroupOwner(uid) {
  return !!getDb().prepare('SELECT 1 FROM groups WHERE created_by = ? LIMIT 1').get(uid);
}

// ---------- static ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function safeJoin(root, target) {
  const resolved = path.normalize(path.join(root, target));
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  // friendly routes without ".html"
  if (!path.extname(rel)) {
    const candidate = safeJoin(PUBLIC_DIR, rel + '.html');
    if (candidate && fs.existsSync(candidate)) rel = rel + '.html';
  }
  const file = safeJoin(PUBLIC_DIR, rel);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const fallback = path.join(PUBLIC_DIR, '404.html');
    if (fs.existsSync(fallback)) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(fallback));
    }
    res.writeHead(404);
    return res.end('Not found');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

// ---------- API handlers ----------

async function handleApi(req, res, pathname, query) {
  const method = req.method;

  // ---- auth ----
  if (pathname === '/api/auth/register' && method === 'POST') {
    const { username, password } = await readBody(req);
    if (typeof username !== 'string' || typeof password !== 'string') {
      return sendError(res, 400, 'Invalid input');
    }
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(u)) {
      return sendError(res, 400, 'Username: 3-32 chars, a-z 0-9 _ -');
    }
    if (password.length < 6) return sendError(res, 400, 'Password ≥ 6 chars');
    const db = getDb();
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(u)) {
      return sendError(res, 409, 'Username taken');
    }
    const hash = await hashPassword(password);
    const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(u, hash);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    const token = signSession({ uid: user.id, username: user.username });
    return send(res, 200, { ok: true, user: { id: user.id, username: user.username } }, {
      'set-cookie': sessionCookie(token),
    });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const { username, password } = await readBody(req);
    if (typeof username !== 'string' || typeof password !== 'string') {
      return sendError(res, 400, 'Invalid input');
    }
    const u = username.trim().toLowerCase();
    const user = getDb().prepare('SELECT * FROM users WHERE username = ?').get(u);
    if (!user) return sendError(res, 401, 'Invalid credentials');
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return sendError(res, 401, 'Invalid credentials');
    const token = signSession({ uid: user.id, username: user.username });
    return send(res, 200, { ok: true, user: { id: user.id, username: user.username } }, {
      'set-cookie': sessionCookie(token),
    });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    return send(res, 200, { ok: true }, { 'set-cookie': clearCookie() });
  }

  if (pathname === '/api/me' && method === 'GET') {
    const s = readSession(req);
    if (!s) return send(res, 200, { user: null });
    return send(res, 200, { user: { id: s.uid, username: s.username }, is_admin: isGroupOwner(s.uid) });
  }

  // ---- matches ----
  if (pathname === '/api/matches' && method === 'GET') {
    const s = requireSession(req, res); if (!s) return;
    const stage = query.stage; // 'group' | 'knockout' | undefined
    const db = getDb();
    let matches;
    if (stage === 'group') {
      matches = db.prepare("SELECT * FROM matches WHERE stage = 'Group Stage' ORDER BY match_date, id").all();
    } else if (stage === 'knockout') {
      matches = db.prepare("SELECT * FROM matches WHERE stage != 'Group Stage' ORDER BY match_date, id").all();
    } else {
      matches = db.prepare('SELECT * FROM matches ORDER BY match_date, id').all();
    }
    const preds = db.prepare('SELECT * FROM predictions WHERE user_id = ?').all(s.uid);
    const byMatch = new Map(preds.map((p) => [p.match_id, p]));
    return send(res, 200, {
      matches: matches.map((m) => ({ ...m, prediction: byMatch.get(m.id) || null })),
    });
  }

  // ---- predictions ----
  if (pathname === '/api/predictions' && method === 'POST') {
    const s = requireSession(req, res); if (!s) return;
    const body = await readBody(req);
    const match_id = Number(body.match_id);
    const pred_home = Number(body.pred_home);
    const pred_away = Number(body.pred_away);
    if (!Number.isInteger(match_id) || !Number.isInteger(pred_home) || !Number.isInteger(pred_away)) {
      return sendError(res, 400, 'Invalid input');
    }
    if (pred_home < 0 || pred_away < 0 || pred_home > 20 || pred_away > 20) {
      return sendError(res, 400, 'Score out of range');
    }
    const db = getDb();
    const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id);
    if (!m) return sendError(res, 404, 'Match not found');
    const locked = m.status !== 'upcoming' || Date.now() >= new Date(m.match_date).getTime();
    if (locked) return sendError(res, 409, 'Predictions locked');
    db.prepare(
      `INSERT INTO predictions (user_id, match_id, pred_home, pred_away)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, match_id) DO UPDATE SET
         pred_home = excluded.pred_home,
         pred_away = excluded.pred_away,
         submitted_at = datetime('now'),
         points_earned = NULL`,
    ).run(s.uid, match_id, pred_home, pred_away);
    return send(res, 200, { ok: true });
  }

  // ---- groups ----
  if (pathname === '/api/groups' && method === 'GET') {
    const s = requireSession(req, res); if (!s) return;
    const groups = getDb().prepare(
      `SELECT g.*, gm.status AS my_status
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
       ORDER BY g.created_at DESC`,
    ).all(s.uid);
    return send(res, 200, { groups });
  }

  if (pathname === '/api/groups' && method === 'POST') {
    const s = requireSession(req, res); if (!s) return;
    const { name } = await readBody(req);
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 60) {
      return sendError(res, 400, 'Group name 2-60 chars');
    }
    const db = getDb();
    let code = crypto.randomBytes(4).toString('hex').toUpperCase();
    for (let i = 0; i < 5; i++) {
      if (!db.prepare('SELECT 1 FROM groups WHERE invite_code = ?').get(code)) break;
      code = crypto.randomBytes(4).toString('hex').toUpperCase();
    }
    const info = db.prepare('INSERT INTO groups (name, invite_code, created_by) VALUES (?, ?, ?)')
      .run(name.trim(), code, s.uid);
    const gid = Number(info.lastInsertRowid);
    db.prepare(`INSERT INTO group_members (group_id, user_id, status) VALUES (?, ?, 'active')`)
      .run(gid, s.uid);
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(gid);
    return send(res, 200, { group });
  }

  if (pathname === '/api/groups/join' && method === 'POST') {
    const s = requireSession(req, res); if (!s) return;
    const { invite_code } = await readBody(req);
    if (typeof invite_code !== 'string') return sendError(res, 400, 'Invite code required');
    const code = invite_code.trim().toUpperCase();
    const db = getDb();
    const group = db.prepare('SELECT * FROM groups WHERE invite_code = ?').get(code);
    if (!group) return sendError(res, 404, 'Invalid invite code');
    const existing = db.prepare('SELECT status FROM group_members WHERE group_id = ? AND user_id = ?')
      .get(group.id, s.uid);
    if (existing) return send(res, 200, { group, status: existing.status });
    db.prepare(`INSERT INTO group_members (group_id, user_id, status) VALUES (?, ?, 'pending')`)
      .run(group.id, s.uid);
    return send(res, 200, { group, status: 'pending' });
  }

  let m;
  if ((m = pathname.match(/^\/api\/groups\/(\d+)\/members$/))) {
    const gid = Number(m[1]);
    const s = requireSession(req, res); if (!s) return;
    const db = getDb();
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(gid);
    if (!group) return sendError(res, 404, 'Group not found');
    const me = db.prepare('SELECT status FROM group_members WHERE group_id = ? AND user_id = ?').get(gid, s.uid);
    if (!me || me.status !== 'active') return sendError(res, 403, 'Not a member');

    if (method === 'GET') {
      const members = db.prepare(
        `SELECT u.id, u.username, gm.status, gm.joined_at
         FROM group_members gm JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ? ORDER BY gm.status, gm.joined_at`,
      ).all(gid);
      return send(res, 200, { group, members, is_owner: group.created_by === s.uid });
    }
    if (method === 'POST') {
      if (group.created_by !== s.uid) return sendError(res, 403, 'Only the owner can do that');
      const { user_id, action } = await readBody(req);
      if (!Number.isInteger(user_id) || (action !== 'approve' && action !== 'reject')) {
        return sendError(res, 400, 'Invalid input');
      }
      if (action === 'approve') {
        db.prepare(
          `UPDATE group_members SET status = 'active'
           WHERE group_id = ? AND user_id = ? AND status = 'pending'`,
        ).run(gid, user_id);
      } else {
        db.prepare(
          `DELETE FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'pending'`,
        ).run(gid, user_id);
      }
      return send(res, 200, { ok: true });
    }
  }

  if ((m = pathname.match(/^\/api\/groups\/(\d+)\/leaderboard$/)) && method === 'GET') {
    const gid = Number(m[1]);
    const s = requireSession(req, res); if (!s) return;
    const db = getDb();
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(gid);
    if (!group) return sendError(res, 404, 'Group not found');
    const me = db.prepare('SELECT status FROM group_members WHERE group_id = ? AND user_id = ?').get(gid, s.uid);
    if (!me || me.status !== 'active') return sendError(res, 403, 'Not a member');
    const rows = db.prepare(`
      SELECT
        u.id   AS user_id,
        u.username,
        COALESCE(SUM(p.points_earned), 0)                              AS total_points,
        SUM(CASE WHEN p.points_earned = 7 THEN 1 ELSE 0 END)           AS exact_scores,
        SUM(CASE WHEN p.points_earned IN (7,4,2) THEN 1 ELSE 0 END)    AS correct_winners,
        SUM(CASE WHEN p.points_earned IS NOT NULL THEN 1 ELSE 0 END)   AS scored_predictions
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      LEFT JOIN predictions p ON p.user_id = u.id
      LEFT JOIN matches mt ON mt.id = p.match_id AND mt.status = 'finished'
      WHERE gm.group_id = ? AND gm.status = 'active'
      GROUP BY u.id, u.username
      ORDER BY total_points DESC, exact_scores DESC, correct_winners DESC, u.username ASC
    `).all(gid);
    return send(res, 200, { group, leaderboard: rows, me: s.uid });
  }

  // ---- admin ----
  if (pathname === '/api/admin/matches' && method === 'GET') {
    const s = requireSession(req, res); if (!s) return;
    if (!isGroupOwner(s.uid)) return sendError(res, 403, 'Forbidden');
    const matches = getDb().prepare('SELECT * FROM matches ORDER BY match_date, id').all();
    return send(res, 200, { matches });
  }

  if ((m = pathname.match(/^\/api\/admin\/matches\/(\d+)$/))) {
    const s = requireSession(req, res); if (!s) return;
    if (!isGroupOwner(s.uid)) return sendError(res, 403, 'Forbidden');
    const mid = Number(m[1]);
    const db = getDb();
    if (!db.prepare('SELECT 1 FROM matches WHERE id = ?').get(mid)) {
      return sendError(res, 404, 'Match not found');
    }

    if (method === 'PATCH') {
      const body = await readBody(req);
      const sets = []; const vals = [];
      if (Number.isInteger(body.score_home))      { sets.push('score_home = ?'); vals.push(body.score_home); }
      else if (body.score_home === null)          { sets.push('score_home = NULL'); }
      if (Number.isInteger(body.score_away))      { sets.push('score_away = ?'); vals.push(body.score_away); }
      else if (body.score_away === null)          { sets.push('score_away = NULL'); }
      if (['upcoming', 'live', 'finished'].includes(body.status)) {
        sets.push('status = ?'); vals.push(body.status);
      }
      if (typeof body.team_home === 'string' && body.team_home.trim()) {
        sets.push('team_home = ?'); vals.push(body.team_home.trim());
      }
      if (typeof body.team_away === 'string' && body.team_away.trim()) {
        sets.push('team_away = ?'); vals.push(body.team_away.trim());
      }
      if (sets.length === 0) return sendError(res, 400, 'Nothing to update');
      vals.push(mid);
      db.prepare(`UPDATE matches SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      const upd = db.prepare('SELECT * FROM matches WHERE id = ?').get(mid);
      let recalced = 0;
      if (upd.status === 'finished' && upd.score_home !== null && upd.score_away !== null) {
        recalced = recalcMatchPoints(mid);
      } else {
        db.prepare('UPDATE predictions SET points_earned = NULL WHERE match_id = ?').run(mid);
      }
      return send(res, 200, { ok: true, recalculated: recalced });
    }

    if (method === 'POST' && query.action === 'recalc') {
      const n = recalcMatchPoints(mid);
      return send(res, 200, { ok: true, recalculated: n });
    }
  }

  sendError(res, 404, 'Not found');
}

// ---------- entry ----------

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, parsed.query);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (err) {
    console.error('server error', err);
    if (!res.headersSent) sendError(res, 500, 'Server error');
    else res.end();
  }
});

getDb(); // initialize schema
server.listen(PORT, () => {
  console.log(`▶ WC26.bets running at http://localhost:${PORT}`);
});
