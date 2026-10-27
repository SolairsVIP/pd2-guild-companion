import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCharacterInput, normalizeArmory, createArmoryReader } from '../armory.js';
import { createApp } from '../server.js';
import { equippedItems, itemsInSlots, itemImage } from '../public/equipment-view.js';

test('装备窗口只显示穿戴与佣兵，切换武器不混入背包或另一配置', () => {
  const data = normalizeArmory(fixture());
  data.items.push({ key: 'alternate', name: 'Call to Arms', baseName: 'Crystal Sword', group: '穿戴装备', slot: '备用主手' });
  assert.equal(equippedItems(data.items).length, 3);
  assert.equal(itemsInSlots(data.items, '穿戴装备', 1).find(s => s.slot === '主手').item.name, 'Ice');
  assert.equal(itemsInSlots(data.items, '穿戴装备', 2).find(s => s.slot === '主手').item.key, 'alternate');
  assert.equal(itemsInSlots(data.items, '佣兵', 2).find(s => s.slot === '主手').item.name, 'Faith');
  assert.equal(itemsInSlots(data.items, '穿戴装备').find(s => s.slot === '头盔').item, undefined);
  assert.equal(itemImage({name:'Unknown',baseName:'Unknown'}), null);
  assert.equal(itemImage({name:'Unknown',baseName:'https://evil.test/image'}), null);
});

const fixture = () => ({
  file: { updated_at: 1792726079 }, account: { private: 'discard' }, guild: { name: 'discard' },
  character: { name: 'TestArrow', level: 92, class: { name: 'Amazon' }, status: { is_hardcore: false, is_ladder: false }, gold: { stash: 999 }, attributes: { strength: 120 } },
  items: [
    { id: 1, name: 'Ice', category: 'weapon', quality: { name: 'Normal' }, base: { name: 'Grand Matron Bow', type: 'Amazon Bow' }, location: { zone: 'Equipped', equipment: 'Right Hand' }, socket_count: 4, socketed: [{ name: 'Jah Rune', properties: [null], modifiers: [{ label: 'Ignore Target Defense' }] }], properties: ['20% Increased Attack Speed', 'Level 18 Holy Freeze Aura When Equipped'] },
    { id: 2, name: 'Fine Small Charm', category: 'misc', base: { name: 'Small Charm', type: 'Small Charm' }, location: { zone: 'Stored', storage: 'Inventory', equipment: 'Helm' }, corrupted: true, properties: ['+3 Maximum Damage'] },
  ],
  mercenary: { name: 'Test Merc', items: [{ id: 3, name: 'Faith', category: 'weapon', base: { name: 'Bow' }, location: { zone_id: 1, equipment: 'Right Hand' }, is_ethereal: true, properties: ['Level 14 Fanaticism Aura When Equipped'] }] },
});

test('只接受角色名或固定官方角色链接，拒绝任意主机与账号入口', () => {
  assert.equal(parseCharacterInput('TestArrow'), 'TestArrow');
  assert.equal(parseCharacterInput('https://projectdiablo2.com/character/TestArrow'), 'TestArrow');
  assert.equal(parseCharacterInput('https://api.projectdiablo2.com/game/character/TestArrow'), 'TestArrow');
  for (const input of ['http://127.0.0.1/private', 'https://evil.test/character/X', 'https://projectdiablo2.com/@test/armory', 'https://projectdiablo2.com/character/a?token=secret', 'https://projectdiablo2.com/character/..%2fadmin', 'https://name:pass@projectdiablo2.com/character/X', '../TestArrow']) assert.throws(() => parseCharacterInput(input), { status: 400 });
});
test('保留装备属性、背包位置与佣兵分类，丢弃无关账号信息', () => {
  const data = normalizeArmory(fixture());
  assert.equal(data.name, 'TestArrow'); assert.equal(data.mode, 'SC 非天梯'); assert.equal(data.className, '亚马逊'); assert.equal(data.items.length, 3);
  assert.equal(data.items[0].slot, '主手'); assert.equal(data.items[0].sockets, 4); assert.equal(data.items[0].socketed[0].properties[0], 'Ignore Target Defense');
  assert.equal(data.items[1].group, '背包'); assert.equal(data.items[1].slot, '背包'); assert.equal(data.items[1].category, '饰品'); assert.equal(data.items[2].group, '佣兵');
  assert.equal(data.items[2].ethereal, true); assert.equal('account' in data, false); assert.equal('gold' in data, false); assert.equal('guild' in data, false);
  assert.throws(() => normalizeArmory({ character: {} }), { status: 400 });
  assert.throws(() => normalizeArmory(fixture(), { requestedName: 'AnotherCharacter' }), { status: 502 });
});
test('固定官方请求无 Cookie，短期缓存、不跟随重定向，网络失败可解释', async () => {
  let calls = 0;
  const reader = createArmoryReader({ fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'https://api.projectdiablo2.com/game/character/TestArrow'); assert.equal(options.redirect, 'error'); assert.equal('Cookie' in options.headers, false);
    return new Response(JSON.stringify(fixture()), { status: 200 });
  } });
  await reader('TestArrow'); await reader('TestArrow'); assert.equal(calls, 1);
  const offline = createArmoryReader({ fetchImpl: async () => { throw new Error('network'); } });
  await assert.rejects(offline('TestArrow'), { status: 502 });
  const missing = createArmoryReader({ fetchImpl: async () => new Response('{}', { status: 404 }) });
  await assert.rejects(missing('TestArrow'), { status: 404 });
  const wrong = createArmoryReader({ fetchImpl: async () => new Response('<html>Login</html>', { status: 200 }) });
  await assert.rejects(wrong('TestArrow'), { status: 502 });
});
test('HTTP 导入保存本人快照，公会成员可读，失败不会覆盖旧快照', async () => {
  const app = createApp({ dbPath: ':memory:', readArmory: async () => fixture() });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function call(path, body, cookie = '') {
    const res = await fetch(base + '/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] || cookie };
  }
  const account = username => ({ username, password: 'TestPass2026!', nickname: username, character: username, className: '法师', level: 80, mode: 'SC 天梯' });
  try {
    const admin = await call('/setup', { ...account('admin'), guild: '测试' });
    const invite = await call('/invites', {}, admin.cookie);
    const member = await call('/register', { ...account('member'), invite: invite.body.code });
    assert.equal((await call('/armory/1')).status, 401);
    assert.equal((await call('/armory/import', { character: 'TestArrow' })).status, 401);
    const imported = await call('/armory/import', { character: 'https://projectdiablo2.com/character/TestArrow' }, admin.cookie);
    assert.equal(imported.status, 201); assert.equal(imported.body.snapshot.source, 'official');
    assert.equal((await call('/armory/1', undefined, member.cookie)).body.snapshot.items.length, 3);
    assert.equal((await call('/armory/import', { json: '{bad json}' }, admin.cookie)).status, 400);
    assert.equal((await call('/armory/1', undefined, admin.cookie)).body.snapshot.name, 'TestArrow');
    assert.equal((await call('/armory/import', { json: JSON.stringify(fixture()), memberId: 1 }, member.cookie)).status, 201);
    assert.equal((await call('/armory/2', undefined, member.cookie)).body.snapshot.source, 'json');
    assert.equal((await call('/state', undefined, member.cookie)).body.members.find(m => m.id === 1).has_armory, 1);
    assert.equal((await fetch(base + '/armory')).status, 200);
    assert.equal((await fetch(base + '/armory-ui.js')).status, 200);
  } finally { await app.close(); }
});

test('演示站会话 Cookie 不覆盖同一主机正式公会的登录 Cookie', async () => {
  const app = createApp({ dbPath: ':memory:', demo: true });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const res = await fetch(base + '/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guild: '演示', username: 'demo', password: 'TestPass2026!', nickname: '演示', character: 'Demo', className: '法师', level: 1, mode: 'SC 天梯' }) });
    assert.equal(res.status, 201);
    const cookie = res.headers.get('set-cookie').split(';')[0]; assert.ok(cookie.startsWith('pd2_demo_session='));
    const mixedCookie = `pd2_session=${'f'.repeat(64)}; ${cookie}`;
    const status = await fetch(base + '/api/status', { headers: { Cookie: mixedCookie } }); assert.equal((await status.json()).me.nickname, '演示');
    const logout = await fetch(base + '/api/logout', { method: 'POST', headers: { Cookie: mixedCookie, 'Content-Type': 'application/json' }, body: '{}' });
    assert.ok(logout.headers.get('set-cookie').startsWith('pd2_demo_session='));
  } finally { await app.close(); }
});
