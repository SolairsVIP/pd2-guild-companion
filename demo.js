import { createApp } from './server.js';

// Separate, disposable preview. Never reads or writes the real guild database.
const app = createApp({ dbPath: ':memory:', demo: true, secureCookies: false });
await new Promise(resolve => app.server.listen(3215, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:3215';
async function call(path, data, cookie = '') {
  const res = await fetch(base + '/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(data) });
  const value = await res.json(); if (!res.ok) throw new Error(value.error);
  return { value, cookie: res.headers.get('set-cookie')?.split(';')[0] || cookie };
}
const account = (username, nickname, character, className, build, level = 85, mode = 'SC 天梯') => ({ username, password: 'CampDemo2026!', nickname, character, className, build, level, mode, availability: '20:00–23:00（北京时间）' });
const admin = await call('/setup', { guild: '篝火远征团 · 演示', ...account('demo', '营地守望者', 'CampKeeper', '圣骑士', '祝福之锤', 88) });
const members = [];
for (const info of [account('north', '北境', 'NorthWind', '法师', '冰霜新星', 89), account('ash', '余烬', 'AshWalker', '死灵法师', '召唤', 86), account('oak', '老橡树', 'OldOak', '德鲁伊', '召唤德', 82), account('stone', '石头', 'StoneWall', '野蛮人', '旋风斩', 87), account('dawn', '黎明', 'DawnArrow', '亚马逊', '多重箭', 84), account('hardcore', '守夜人', 'NightWatch', '刺客', '雷光陷阱', 80, 'HC 天梯')]) {
  const invite = await call('/invites', {}, admin.cookie);
  members.push(await call('/register', { ...info, invite: invite.value.code }));
}
const start = minutes => new Date(Date.now() + minutes * 60000).toISOString();
await call('/parties', { title: 'T1 地图慢刷，欢迎刚成型的队友', activity: '地图', capacity: 8, start_at: start(30), room: 'camp-map-01 / 14', notes: '轻松刷图，不赶进度。来个 BO 和辅助更好，掉落按开车前约定分配。' }, members[0].cookie);
await call('/parties/1/join', {}, members[1].cookie);
await call('/parties/1/join', {}, members[2].cookie);
await call('/parties', { title: '一起刷牛，聊聊新赛季', activity: '刷怪升级', capacity: 5, start_at: start(60), room: 'camp-cow / 14', notes: '适合练级和找底材，亚服。装备一般也欢迎，先到先上车。' }, members[3].cookie);
await call('/parties/2/join', {}, members[4].cookie);
await call('/parties', { title: '今晚开荒互助小队', activity: '开荒', capacity: 4, start_at: start(90), room: 'camp-help / 14', notes: '有任务卡住了就来，互帮互助，一起走到地狱。' }, admin.cookie);
await call('/gear', { name: '蛇魔法师之皮', category: '防具', description: '演示物品 · Skin of the Vipermagi\n+1 所有技能 / 30% 快速施法\n适合刚起步的施法职业，优先给需要的队友。' }, members[0].cookie);
await call('/gear', { name: '塔拉夏的赫拉迪克之纹章', category: '防具', description: '演示物品 · 塔拉夏头\n佣兵过渡使用，需要的队友直接预留。\n晚间 8 点后可以交付。' }, members[1].cookie);
await call('/gear', { name: '开荒底材小礼包', category: '符文 / 材料', description: '演示分享 · 几件开荒用底材\n有需要可以预留，游戏内见面时挑选。' }, admin.cookie);
await call('/messages', { title: '欢迎来到篝火远征团', audience: '全体成员', body: '这里是我们的赛季营地。先登记角色与常用时段，想刷图就在拼车大厅开一班车。\n有用不上的装备也欢迎分享，让每一位队友都能顺利起步。' }, admin.cookie);
await call('/messages', { title: '今晚的地图车，记得先报名', audience: 'SC 天梯', body: '拼车时请写清地图阶级、服务器和分配规则。报名后可以看到房间信息；临时有事记得退出，给其他队友留个位置。' }, admin.cookie);
console.log(`演示预览：${base}\n登录名：demo\n演示密码：CampDemo2026!\n示例数据仅保存在内存，正式公会请打开 http://127.0.0.1:3214`);
