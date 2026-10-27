import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

let app, base, admin, member, third, hc;
const temp = mkdtempSync(join(tmpdir(), 'pd2-guild-test-'));
const dbPath = join(temp, 'test.sqlite');
async function call(path, data, cookie = '') {
  const res = await fetch(base + '/api' + path, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] || cookie };
}
const account = (username, mode = 'SC 天梯') => ({ username, password: 'TestPass2026!', nickname: username, character: username + 'Char', className: '法师', level: 80, build: '冰法', mode, availability: '晚上' });
before(async () => {
  app = createApp({ dbPath }); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${app.server.address().port}`;
  admin = await call('/setup', { ...account('admin'), guild: '测试公会' }); assert.equal(admin.status, 201);
  for (const [name, mode] of [['member', 'SC 天梯'], ['third', 'SC 天梯'], ['hardcore', 'HC 天梯']]) {
    const invite = await call('/invites', {}, admin.cookie);
    const user = await call('/register', { ...account(name, mode), invite: invite.body.code }); assert.equal(user.status, 201);
    if (name === 'member') member = user; else if (name === 'third') third = user; else hc = user;
  }
});
after(async () => { await app.close(); rmSync(temp, { recursive: true, force: true }); });
test('认证、会长权限、一次性邀请和输入验证', async () => {
  assert.equal((await call('/state')).status, 401);
  assert.equal((await call('/setup', { ...account('other'), guild: '篡改' })).status, 409);
  assert.equal((await call('/login', { username: 'member', password: 'WrongPass2026' })).status, 401);
  assert.equal((await call('/login', { username: 'member', password: 'TestPass2026!' })).status, 200);
  assert.equal((await call('/invites', {}, member.cookie)).status, 403);
  const invitation = await call('/invites', {}, admin.cookie);
  assert.equal((await call('/register', { ...account('extra'), invite: invitation.body.code })).status, 201);
  assert.equal((await call('/register', { ...account('extra2'), invite: invitation.body.code })).status, 400);
  assert.equal((await call('/profile', { ...account('member'), level: 100 }, member.cookie)).status, 400);
  const state = (await call('/state', undefined, admin.cookie)).body;
  assert.equal(state.members.some(m => 'password' in m || 'username' in m), false);
});
test('公告按模式投递、成员不能群发、已读确认去重', async () => {
  const data = { title: '集合', body: '一起刷地图', audience: 'SC 天梯' };
  assert.equal((await call('/messages', data, member.cookie)).status, 403);
  assert.equal((await call('/messages', data, admin.cookie)).status, 201);
  const msg = (await call('/state', undefined, member.cookie)).body.messages[0];
  assert.equal((await call('/state', undefined, hc.cookie)).body.messages.length, 0);
  assert.equal((await call(`/messages/${msg.id}/read`, {}, hc.cookie)).status, 404);
  await call(`/messages/${msg.id}/read`, {}, member.cookie); await call(`/messages/${msg.id}/read`, {}, member.cookie);
  assert.equal((await call('/state', undefined, admin.cookie)).body.messages[0].read_count, 1);
});
test('并发报名不超员、模式隔离、房间隐藏、队长权限', async () => {
  assert.equal((await call('/parties', { title: '地图车', activity: '地图', capacity: 2, start_at: new Date(Date.now() + 3600000).toISOString(), room: 'private/123', notes: '测试' }, admin.cookie)).status, 201);
  const party = (await call('/state', undefined, member.cookie)).body.parties[0];
  assert.equal(party.room, '');
  assert.equal((await call(`/parties/${party.id}/join`, {}, hc.cookie)).status, 409);
  const results = await Promise.all([call(`/parties/${party.id}/join`, {}, member.cookie), call(`/parties/${party.id}/join`, {}, third.cookie)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const joined = results[0].status === 200 ? member : third;
  assert.equal((await call('/state', undefined, joined.cookie)).body.parties[0].room, 'private/123');
  assert.equal((await call(`/parties/${party.id}/close`, {}, joined.cookie)).status, 403);
  assert.equal((await call('/profile', { ...account(results[0].status === 200 ? 'member' : 'third', 'HC 天梯') }, joined.cookie)).status, 409);
  assert.equal((await call(`/parties/${party.id}/leave`, {}, joined.cookie)).status, 200);
  assert.equal((await call(`/parties/${party.id}/leave`, {}, admin.cookie)).status, 400);
  assert.equal((await call(`/parties/${party.id}/close`, {}, admin.cookie)).status, 200);
  assert.equal((await call(`/parties/${party.id}/join`, {}, member.cookie)).status, 409);
});
test('装备并发预留唯一、所有权验证与交付闭环', async () => {
  assert.equal((await call('/gear', { name: '<script>alert(1)</script>', category: '防具', description: '测试装备' }, admin.cookie)).status, 201);
  const gear = (await call('/state', undefined, member.cookie)).body.gear[0];
  assert.equal((await call(`/gear/${gear.id}/claim`, {}, hc.cookie)).status, 409);
  assert.equal((await call(`/gear/${gear.id}/claim`, {}, admin.cookie)).status, 400);
  const results = await Promise.all([call(`/gear/${gear.id}/claim`, {}, member.cookie), call(`/gear/${gear.id}/claim`, {}, third.cookie)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const claimant = results[0].status === 200 ? member : third, other = results[0].status === 200 ? third : member;
  assert.equal((await call(`/gear/${gear.id}/release`, {}, other.cookie)).status, 403);
  assert.equal((await call(`/gear/${gear.id}/complete`, {}, claimant.cookie)).status, 403);
  assert.equal((await call(`/gear/${gear.id}/release`, {}, claimant.cookie)).status, 200);
  assert.equal((await call(`/gear/${gear.id}/claim`, {}, claimant.cookie)).status, 200);
  assert.equal((await call(`/gear/${gear.id}/complete`, {}, admin.cookie)).status, 200);
  assert.equal((await call('/badges/claim', { badgeId: 'first-gift' }, admin.cookie)).status, 201);
  assert.equal((await call(`/gear/${gear.id}/claim`, {}, other.cookie)).status, 409);
});
test('跨站请求被拒绝、静态资源可用、注销失效', async () => {
  const res = await fetch(base + '/api/messages', { method: 'POST', headers: { Origin: 'https://example.org', 'Content-Type': 'application/json', Cookie: admin.cookie }, body: '{}' });
  assert.equal(res.status, 403);
  assert.equal((await fetch(base)).status, 200);
  const fresh = await call('/login', { username: 'member', password: 'TestPass2026!' });
  await call('/logout', {}, fresh.cookie);
  assert.equal((await call('/state', undefined, fresh.cookie)).status, 401);
});
test('重启服务后仍保留公会、成员、队伍、装备和会话', async () => {
  await app.close(); app = createApp({ dbPath }); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${app.server.address().port}`;
  const res = await call('/state', undefined, admin.cookie);
  assert.equal(res.status, 200); assert.equal(res.body.guild, '测试公会'); assert.equal(res.body.parties.length, 1); assert.equal(res.body.gear.length, 1); assert.equal(res.body.members.length, 5);
  assert.equal(res.body.me.completedShares, 1); assert.equal(res.body.me.badges[0].id, 'first-gift');
});
