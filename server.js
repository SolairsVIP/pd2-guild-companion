import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmoryReader, normalizeArmory, parseCharacterInput } from './armory.js';
import { contributionBadges } from './public/contributions.js';

const root = dirname(fileURLToPath(import.meta.url));
const modes = ['SC 天梯', 'HC 天梯', 'SC 非天梯', 'HC 非天梯'];
const classes = ['亚马逊', '刺客', '野蛮人', '德鲁伊', '圣骑士', '死灵法师', '法师'];
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const token = () => randomBytes(32).toString('hex');
const hash = v => createHash('sha256').update(v).digest('hex');
function passwordHash(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
function passwordMatches(password, stored) { const [salt, digest] = stored.split(':'); return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex')); }
function str(body, key, max = 120, optional = false) {
  const value = body[key];
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `${key} 不能为空且不能超过 ${max} 字。`);
  return value.trim();
}
function choice(body, key, values) { const value = str(body, key); if (!values.includes(value)) fail(400, `${key} 选项无效。`); return value; }
function profile(body) {
  const level = Number(body.level);
  if (!Number.isInteger(level) || level < 1 || level > 99) fail(400, '角色等级应为 1–99。');
  return [str(body, 'nickname', 30), str(body, 'character', 30), choice(body, 'className', classes), level, str(body, 'build', 80, true), choice(body, 'mode', modes), str(body, 'availability', 100, true)];
}
function credentials(body) {
  const username = str(body, 'username', 30).toLowerCase();
  if (!/^[a-z0-9_-]{3,30}$/.test(username)) fail(400, '登录名请用 3–30 位字母、数字、下划线或短横线。');
  if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) fail(400, '密码请使用 10–128 个字符。');
  return [username, body.password];
}
async function readBody(req, limit = 16384) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413, '提交内容过大。'); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString() || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '请求格式无效。'); return value; }
  catch (e) { if (e.status) throw e; fail(400, '请求格式无效。'); }
}

export function createApp({ dbPath = resolve(root, 'data/guild.sqlite'), secureCookies = process.env.COOKIE_SECURE === 'true', demo = false, readArmory = createArmoryReader() } = {}) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,nickname TEXT NOT NULL,character TEXT NOT NULL,className TEXT NOT NULL,level INTEGER NOT NULL,build TEXT NOT NULL,mode TEXT NOT NULL,availability TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',last_seen INTEGER NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,member_id INTEGER NOT NULL REFERENCES members(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invites(code TEXT PRIMARY KEY,created_by INTEGER NOT NULL REFERENCES members(id),expires INTEGER NOT NULL,used_by INTEGER REFERENCES members(id));
    CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,author_id INTEGER NOT NULL REFERENCES members(id),title TEXT NOT NULL,body TEXT NOT NULL,audience TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS receipts(message_id INTEGER REFERENCES messages(id),member_id INTEGER REFERENCES members(id),PRIMARY KEY(message_id,member_id));
    CREATE TABLE IF NOT EXISTS parties(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES members(id),title TEXT NOT NULL,activity TEXT NOT NULL,mode TEXT NOT NULL,capacity INTEGER NOT NULL,start_at TEXT NOT NULL,room TEXT NOT NULL,notes TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS party_members(party_id INTEGER REFERENCES parties(id),member_id INTEGER REFERENCES members(id),PRIMARY KEY(party_id,member_id));
    CREATE TABLE IF NOT EXISTS gear(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES members(id),name TEXT NOT NULL,category TEXT NOT NULL,mode TEXT NOT NULL,description TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'available',claimant_id INTEGER REFERENCES members(id),created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS armory_snapshots(member_id INTEGER PRIMARY KEY REFERENCES members(id),snapshot TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS contribution_badges(member_id INTEGER NOT NULL REFERENCES members(id),badge_id TEXT NOT NULL,claimed_at INTEGER NOT NULL,PRIMARY KEY(member_id,badge_id));`);
  const get = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const cookieName = demo ? 'pd2_demo_session' : 'pd2_session';
  const cookiePattern = new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`);
  function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } }
  function session(req) {
    const raw = cookiePattern.exec(req.headers.cookie || '')?.[1];
    return raw ? get('SELECT m.* FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.token=? AND s.expires>?', hash(raw), Date.now()) : undefined;
  }
  function setSession(res, id) {
    const raw = token();
    run('DELETE FROM sessions WHERE expires<?', Date.now());
    run('INSERT INTO sessions VALUES(?,?,?)', hash(raw), id, Date.now() + 7 * 86400000);
    res.setHeader('Set-Cookie', `${cookieName}=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secureCookies ? '; Secure' : ''}`);
  }
  const publicMember = m => { const { password, username, ...rest } = m; return rest; };
  const attempts = new Map();
  const armoryAttempts = new Map();
  const importing = new Set();
  function rateLimit(req) {
    const key = req.socket.remoteAddress; const now = Date.now();
    for (const [k, v] of attempts) if (now - v.start > 900000) attempts.delete(k);
    const value = attempts.get(key) || { start: now, count: 0 }; value.count++; attempts.set(key, value);
    if (value.count > 40) fail(429, '尝试次数过多，请 15 分钟后重试。');
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://projectdiablo2.com/image/items/; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const send = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost'); const path = url.pathname;
      if (!path.startsWith('/api/')) {
        if (req.method !== 'GET') fail(405, '请求方法无效。');
        const files = { '/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/armory': 'armory.html', '/armory-ui.js': 'armory-ui.js', '/equipment-view.js': 'equipment-view.js', '/gear-image.js': 'gear-image.js', '/contributions.js': 'contributions.js' };
        if (!files[path]) fail(404, '页面不存在。');
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
        res.writeHead(200, { 'Content-Type': `${types[extname(files[path])]} ; charset=utf-8`, 'Cache-Control': 'no-cache' });
        res.end(readFileSync(resolve(root, 'public', files[path]))); return;
      }
      if (!['GET', 'POST'].includes(req.method)) fail(405, '请求方法无效。');
      // Same-origin JSON writes prevent cross-site form submissions and CSRF.
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) fail(415, '请使用 JSON 请求。');
        if (req.headers.origin) { const origin = new URL(req.headers.origin); if (origin.host !== req.headers.host) fail(403, '请求来源无效。'); }
        if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, '请求来源无效。');
      }
      let me = session(req);
      const guild = get("SELECT value FROM settings WHERE key='guild'")?.value;
      if (path === '/api/status' && req.method === 'GET') return send({ setup: !guild, guild: guild || '', me: me ? publicMember(me) : null });
      const body = req.method === 'POST' ? await readBody(req, path === '/api/armory/import' ? 2200000 : 16384) : {};
      // The body may arrive slowly; recheck session and mode after that await.
      me = session(req);
      if (path === '/api/setup' && req.method === 'POST') {
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) fail(403, '首次创建请在服务器本机打开网页完成。');
        rateLimit(req); const [username, password] = credentials(body); const p = profile(body); const guildName = str(body, 'guild', 40);
        const id = transaction(() => {
          if (get("SELECT value FROM settings WHERE key='guild'")) fail(409, '公会已经创建，请登录。');
          run("INSERT INTO settings VALUES('guild',?)", guildName);
          return Number(run('INSERT INTO members(username,password,nickname,character,className,level,build,mode,availability,role,last_seen,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', username, passwordHash(password), ...p, 'admin', Date.now(), Date.now()).lastInsertRowid);
        }); setSession(res, id); return send({ ok: true }, 201);
      }
      if (path === '/api/register' && req.method === 'POST') {
        rateLimit(req); const [username, password] = credentials(body); const p = profile(body); const code = hash(str(body, 'invite', 100));
        const id = transaction(() => {
          const invite = get('SELECT * FROM invites WHERE code=? AND used_by IS NULL AND expires>?', code, Date.now());
          if (!invite) fail(400, '邀请无效、已使用或已过期，请联系会长。');
          if (get('SELECT id FROM members WHERE username=?', username)) fail(409, '这个登录名已被使用。');
          const id = Number(run('INSERT INTO members(username,password,nickname,character,className,level,build,mode,availability,last_seen,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', username, passwordHash(password), ...p, Date.now(), Date.now()).lastInsertRowid);
          run('UPDATE invites SET used_by=? WHERE code=?', id, code); return id;
        }); setSession(res, id); return send({ ok: true }, 201);
      }
      if (path === '/api/login' && req.method === 'POST') {
        rateLimit(req); const [username, password] = credentials(body); const member = get('SELECT * FROM members WHERE username=?', username);
        const digest = member?.password || '00000000000000000000000000000000:' + '00'.repeat(64);
        if (!passwordMatches(password, digest) || !member) fail(401, '登录名或密码不正确。');
        setSession(res, member.id); return send({ ok: true });
      }
      if (!me) fail(401, '请先登录。');
      run('UPDATE members SET last_seen=? WHERE id=?', Date.now(), me.id);
      if (path === '/api/logout' && req.method === 'POST') {
        const raw = cookiePattern.exec(req.headers.cookie || '')?.[1]; if (raw) run('DELETE FROM sessions WHERE token=?', hash(raw));
        res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); return send({ ok: true });
      }
      if (path === '/api/state' && req.method === 'GET') {
        const members = all('SELECT m.*,EXISTS(SELECT 1 FROM armory_snapshots a WHERE a.member_id=m.id) AS has_armory FROM members m ORDER BY role ASC,nickname ASC').map(publicMember);
        const shareCounts = new Map(all("SELECT owner_id,COUNT(*) AS count FROM gear WHERE status='completed' GROUP BY owner_id").map(row => [row.owner_id, row.count]));
        const claimed = all('SELECT member_id,badge_id,claimed_at FROM contribution_badges');
        for (const member of members) { member.completedShares = shareCounts.get(member.id) || 0; member.badges = claimed.filter(b => b.member_id === member.id).map(b => ({ id: b.badge_id, claimedAt: b.claimed_at })); }
        const messages = all(`SELECT m.*,(SELECT COUNT(*) FROM receipts WHERE message_id=m.id) AS read_count,EXISTS(SELECT 1 FROM receipts WHERE message_id=m.id AND member_id=?) AS is_read FROM messages m WHERE audience='全体成员' OR audience=? ORDER BY created_at DESC`, me.id, me.mode);
        const parties = all('SELECT * FROM parties ORDER BY created_at DESC').map(p => ({ ...p, members: all('SELECT member_id FROM party_members WHERE party_id=?', p.id).map(m => m.member_id) }));
        // Room details are only visible to joined members and the guild admin.
        for (const party of parties) if (!party.members.includes(me.id) && me.role !== 'admin') party.room = '';
        return send({ guild, demo, me: members.find(m => m.id === me.id), members, messages, parties, gear: all('SELECT * FROM gear ORDER BY created_at DESC'), serverTime: Date.now() });
      }
      if (path === '/api/badges/claim' && req.method === 'POST') {
        const badge = contributionBadges.find(b => b.id === body.badgeId);
        if (!badge) fail(400, '徽章不存在。');
        const result = transaction(() => {
          const completedShares = get("SELECT COUNT(*) AS count FROM gear WHERE owner_id=? AND status='completed'", me.id).count;
          if (completedShares < badge.threshold) fail(409, `成功分享 ${badge.threshold} 次后可领取这枚徽章。`);
          if (get('SELECT 1 FROM contribution_badges WHERE member_id=? AND badge_id=?', me.id, badge.id)) fail(409, '这枚徽章已经领取。');
          const claimedAt = Date.now(); run('INSERT INTO contribution_badges VALUES(?,?,?)', me.id, badge.id, claimedAt);
          return { badge, completedShares, claimedAt };
        }); return send(result, 201);
      }
      if (path === '/api/armory/import' && req.method === 'POST') {
        const times = (armoryAttempts.get(me.id) || []).filter(t => Date.now() - t < 60000);
        if (times.length >= 10) fail(429, '每分钟最多导入 10 次，请稍后重试。');
        if (importing.has(me.id)) fail(409, '正在导入，请等待当前操作完成。');
        times.push(Date.now()); armoryAttempts.set(me.id, times); importing.add(me.id);
        try {
          let snapshot;
          if (typeof body.json === 'string' && body.json.trim()) {
            let data; try { data = JSON.parse(body.json); } catch { fail(400, 'JSON 格式无效，请复制官方数据页面的完整内容。'); }
            snapshot = normalizeArmory(data, { source: 'json' });
          } else {
            const name = parseCharacterInput(body.character);
            snapshot = normalizeArmory(await readArmory(name), { source: 'official', requestedName: name });
          }
          // A request can be logged out while an upstream import is in flight.
          if (!session(req)) fail(401, '登录已失效，请重新登录后导入。');
          run('INSERT INTO armory_snapshots VALUES(?,?) ON CONFLICT(member_id) DO UPDATE SET snapshot=excluded.snapshot', me.id, JSON.stringify(snapshot));
          return send({ snapshot }, 201);
        } finally { importing.delete(me.id); }
      }
      const armoryMatch = path.match(/^\/api\/armory\/(\d+)$/);
      if (armoryMatch && req.method === 'GET') {
        const memberId = Number(armoryMatch[1]);
        if (!get('SELECT id FROM members WHERE id=?', memberId)) fail(404, '成员不存在。');
        const row = get('SELECT snapshot FROM armory_snapshots WHERE member_id=?', memberId);
        return send({ snapshot: row ? JSON.parse(row.snapshot) : null });
      }
      if (path === '/api/profile' && req.method === 'POST') {
        const p = profile(body);
        if (p[5] !== me.mode && (get("SELECT p.id FROM parties p JOIN party_members pm ON pm.party_id=p.id WHERE pm.member_id=? AND p.status='open'", me.id) || get("SELECT id FROM gear WHERE (claimant_id=? AND status='reserved') OR (owner_id=? AND status IN ('available','reserved'))", me.id, me.id))) fail(409, '切换模式前，请退出或结束当前拼车，并完成或撤回装备分享/预留。');
        run('UPDATE members SET nickname=?,character=?,className=?,level=?,build=?,mode=?,availability=? WHERE id=?', ...p, me.id); return send({ ok: true });
      }
      if (path === '/api/invites' && req.method === 'POST') {
        if (me.role !== 'admin') fail(403, '只有会长可以创建邀请。'); const code = token(); const expires = Date.now() + 7 * 86400000;
        run('INSERT INTO invites(code,created_by,expires) VALUES(?,?,?)', hash(code), me.id, expires); return send({ code, expires }, 201);
      }
      if (path === '/api/messages' && req.method === 'POST') {
        if (me.role !== 'admin') fail(403, '只有会长可以发布集体公告。');
        run('INSERT INTO messages(author_id,title,body,audience,created_at) VALUES(?,?,?,?,?)', me.id, str(body, 'title', 80), str(body, 'body', 2000), choice(body, 'audience', ['全体成员', ...modes]), Date.now()); return send({ ok: true }, 201);
      }
      let match = path.match(/^\/api\/messages\/(\d+)\/read$/);
      if (match && req.method === 'POST') {
        const message = get('SELECT * FROM messages WHERE id=?', Number(match[1]));
        if (!message || !['全体成员', me.mode].includes(message.audience)) fail(404, '公告不存在。');
        run('INSERT OR IGNORE INTO receipts VALUES(?,?)', message.id, me.id); return send({ ok: true });
      }
      if (path === '/api/parties' && req.method === 'POST') {
        const capacity = Number(body.capacity); if (!Number.isInteger(capacity) || capacity < 2 || capacity > 8) fail(400, '队伍人数应为 2–8 人。');
        const startAt = str(body, 'start_at', 40); const date = Date.parse(startAt); if (!Number.isFinite(date) || date < Date.now() - 60000 || date > Date.now() + 30 * 86400000) fail(400, '请选择未来 30 天内的开车时间。');
        const title = str(body, 'title', 80), activity = choice(body, 'activity', ['地图', '刷怪升级', '开荒', 'Boss', '其他']), room = str(body, 'room', 120, true), notes = str(body, 'notes', 1000, true);
        transaction(() => { const id = Number(run('INSERT INTO parties(owner_id,title,activity,mode,capacity,start_at,room,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?)', me.id, title, activity, me.mode, capacity, new Date(date).toISOString(), room, notes, Date.now()).lastInsertRowid); run('INSERT INTO party_members VALUES(?,?)', id, me.id); }); return send({ ok: true }, 201);
      }
      match = path.match(/^\/api\/parties\/(\d+)\/(join|leave|close)$/);
      if (match && req.method === 'POST') {
        const id = Number(match[1]), action = match[2];
        transaction(() => {
          const party = get('SELECT * FROM parties WHERE id=?', id); if (!party) fail(404, '队伍不存在。');
          if (party.status !== 'open') fail(409, '队伍已结束。');
          if (action === 'close') { if (party.owner_id !== me.id && me.role !== 'admin') fail(403, '只有队长或会长可以结束队伍。'); run("UPDATE parties SET status='closed' WHERE id=?", id); }
          if (action === 'leave') { if (party.owner_id === me.id) fail(400, '队长请使用结束队伍。'); run('DELETE FROM party_members WHERE party_id=? AND member_id=?', id, me.id); }
          if (action === 'join') {
            if (party.mode !== me.mode) fail(409, '游戏模式不匹配，无法加入。');
            if (get('SELECT 1 FROM party_members WHERE party_id=? AND member_id=?', id, me.id)) fail(409, '你已在这支队伍中。');
            if (get('SELECT COUNT(*) AS count FROM party_members WHERE party_id=?', id).count >= party.capacity) fail(409, '队伍已满。');
            run('INSERT INTO party_members VALUES(?,?)', id, me.id);
          }
        }); return send({ ok: true });
      }
      if (path === '/api/gear' && req.method === 'POST') {
        run('INSERT INTO gear(owner_id,name,category,mode,description,created_at) VALUES(?,?,?,?,?,?)', me.id, str(body, 'name', 80), choice(body, 'category', ['武器', '防具', '饰品', '符文 / 材料', '地图', '其他']), me.mode, str(body, 'description', 1500), Date.now()); return send({ ok: true }, 201);
      }
      match = path.match(/^\/api\/gear\/(\d+)\/(claim|release|complete|withdraw)$/);
      if (match && req.method === 'POST') {
        const id = Number(match[1]), action = match[2];
        transaction(() => {
          const gear = get('SELECT * FROM gear WHERE id=?', id); if (!gear) fail(404, '装备不存在。');
          if (action === 'claim') {
            if (gear.owner_id === me.id) fail(400, '不能领取自己的装备。');
            if (gear.mode !== me.mode) fail(409, '游戏模式不匹配。');
            if (gear.status !== 'available') fail(409, '装备已被预留或不再可领取。');
            run("UPDATE gear SET status='reserved',claimant_id=? WHERE id=?", me.id, id);
          } else if (action === 'release') {
            if (gear.status !== 'reserved') fail(409, '当前装备没有预留。');
            if (gear.owner_id !== me.id && gear.claimant_id !== me.id) fail(403, '只有分享者或预留人可以取消预留。');
            run("UPDATE gear SET status='available',claimant_id=NULL WHERE id=?", id);
          } else {
            if (gear.owner_id !== me.id) fail(403, '只有分享者可以操作。');
            if (action === 'complete' && gear.status !== 'reserved') fail(409, '请先由成员预留，再确认交付。');
            if (action === 'withdraw' && !['available', 'reserved'].includes(gear.status)) fail(409, '该分享已经结束。');
            run('UPDATE gear SET status=? WHERE id=?', action === 'complete' ? 'completed' : 'withdrawn', id);
          }
        }); return send({ ok: true });
      }
      fail(404, '接口不存在。');
    } catch (e) { if (!e.status) console.error(e); if (!res.headersSent) send({ error: e.status ? e.message : '服务器处理失败，请稍后重试。' }, e.status || 500); else res.end(); }
  });
  return { server, close: () => new Promise((resolve, reject) => server.close(err => { db.close(); err ? reject(err) : resolve(); })) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp({ dbPath: process.env.DB_PATH || resolve(root, 'data/guild.sqlite') });
  const port = Number(process.env.PORT || 3214), host = process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () => console.log(`PD2 公会助手已启动：http://${host}:${port}`));
}
