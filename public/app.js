import { parseEquipmentPaste, createGearCanvas } from './gear-image.js';
import { contributionBadges } from './contributions.js';
const $ = s => document.querySelector(s);
const modes = ['SC 天梯', 'HC 天梯', 'SC 非天梯', 'HC 非天梯'];
const classes = ['亚马逊', '刺客', '野蛮人', '德鲁伊', '圣骑士', '死灵法师', '法师'];
const routes = { home: ['公会大厅', '营地里的每一次相遇，都是下一场冒险的开始。'], members: ['成员名册', '找到并肩作战的人。'], parties: ['拼车大厅', '组一支队伍，一起进入庇护之地。'], gear: ['装备互助', '你背包里的闲置，也许是队友缺少的那一件。'], messages: ['消息公告', '让每一位成员都跟上公会的节奏。'] };
const paths = { home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>', members: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>', parties: '<path d="m4 20 7-7m2-2 7-7M14 3l7 7M3 14l7 7M5 3l16 16M3 5l16 16"/>', gear: '<path d="m12 3 8 4v6c0 4-8 8-8 8s-8-4-8-8V7Z"/><path d="M8 12h8m-4-4v8"/>', messages: '<path d="M4 4h16v12H9l-5 4Z"/><path d="M8 8h8M8 12h5"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', plus: '<path d="M12 5v14M5 12h14"/>', camp: '<path d="m3 21 9-18 9 18ZM8 21l4-8 4 8"/><path d="m7 4 10 17M17 4 7 21"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', logout: '<path d="M10 4H4v16h6m4-13 5 5-5 5M8 12h11"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>', check: '<path d="m5 12 4 4L19 6"/>' };
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.gear}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const options = (values, selected) => values.map(v => `<option ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
const date = value => new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
let state, route = 'home', query = '', modeFilter = '我的模式', authMode, polling, refreshing = false;
let inviteCode = new URLSearchParams(location.hash.slice(1)).get('invite') || '';
async function api(path, body) {
  const response = await fetch(`/api${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json(); if (!response.ok) { const error = new Error(value.error || '操作失败。'); error.status = response.status; throw error; } return value;
}
let toastTimer, gearPreviewTimer, gearCanvas;
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = `visible ${error ? 'error' : ''}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 5000); }
function fieldsProfile(member = {}) {
  return `<div class="form-grid"><label>公会昵称<input name="nickname" maxlength="30" required value="${esc(member.nickname)}" placeholder="队友怎么称呼你"></label><label>角色名<input name="character" maxlength="30" required value="${esc(member.character)}" placeholder="游戏中的角色名称"></label><label>职业<select name="className">${options(classes, member.className)}</select></label><label>等级<input name="level" type="number" min="1" max="99" value="${member.level || 1}" required></label><label>游戏模式<select name="mode">${options(modes, member.mode)}</select></label><label>BD / 流派<input name="build" maxlength="80" value="${esc(member.build)}" placeholder="例如：冰法、召唤德"></label></div><label>常用在线时段<input name="availability" maxlength="100" value="${esc(member.availability)}" placeholder="例如：工作日 20:00–23:00（北京时间）"></label>`;
}
function renderAuth(status) {
  clearInterval(polling);
  authMode = status.setup ? 'setup' : inviteCode ? 'register' : 'login';
  $('#app').innerHTML = `<div class="auth-layout"><section class="auth-story"><a class="brand" href="/">${icon('camp')}<span>营地<span class="brand-en">GUILD CAMP</span></span></a><div><span class="eyebrow">PROJECT DIABLO II · SEASON 14</span><h1>独自闯荡。<br>一起归来。</h1><p>把你的公会聚在一起。<br>寻找队友，分享收获，开启下一场冒险。</p><div class="auth-pills"><span>成员登记</span><span>拼车组队</span><span>装备互助</span></div></div><small>独立社区工具 · 非 PD2 官方产品</small></section><section class="auth-form-area"><div class="auth-box"><span class="eyebrow">ALLIANCE / 联盟</span><h2>${authMode === 'setup' ? '点亮你的公会营地' : authMode === 'register' ? '你的队友在等你' : '欢迎回到营地'}</h2><p class="muted">${authMode === 'setup' ? '首次创建公会，你将成为会长。请使用专属密码。' : authMode === 'register' ? `受邀加入 ${esc(status.guild)}，登记后即可参与。` : `${esc(status.guild)} · 登录后查看公会动态。`}</p><form id="auth-form">${authMode === 'setup' ? '<label>公会名称<input name="guild" maxlength="40" required placeholder="为你们的营地起个名字"></label>' : ''}<div class="form-grid"><label>登录名<input name="username" minlength="3" maxlength="30" pattern="[A-Za-z0-9_-]{3,30}" autocomplete="username" required placeholder="3–30 位英文或数字"></label><label>密码<input name="password" type="password" minlength="10" maxlength="128" autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" required placeholder="至少 10 个字符"></label></div>${authMode !== 'login' ? fieldsProfile() : ''}<p class="form-error" role="alert"></p><button class="button primary full" type="submit">${authMode === 'setup' ? '创建公会营地' : authMode === 'register' ? '登记并加入公会' : '进入公会营地'}${icon('arrow')}</button></form>${authMode === 'login' ? '<p class="small muted">还没有账号？请向会长索取一次性邀请链接。<br>请使用与游戏账号不同的密码。</p>' : authMode === 'register' ? '<button class="button text" data-action="login-screen">已有账号？前往登录</button>' : '<p class="small muted">此步骤需在服务器本机完成。数据保存在本机数据库。</p>'}</div></section></div>`;
}
function renderShell() {
  $('#app').innerHTML = `<aside class="sidebar"><a class="brand" href="/">${icon('camp')}<span>营地<span class="brand-en">GUILD CAMP</span></span></a><div class="guild-label"><span class="guild-emblem">${icon('gear')}</span><div><strong>${esc(state.guild)}</strong><span>S14 · ALLIANCE</span></div></div><span class="nav-label">公会空间</span><nav>${Object.entries(routes).map(([key, [title]]) => `<button class="nav-item ${route === key ? 'active' : ''}" data-route="${key}">${icon(key)}<span>${title}</span><span class="nav-count" id="count-${key}"></span></button>`).join('')}<a class="nav-item" href="/armory">${icon('gear')}<span>角色装备</span></a></nav><div class="sidebar-bottom"><div class="season-note"><span class="tiny-gold">SEASON 14</span><strong>同行，才是联盟。</strong><p>下一件好装备，<br>下一张好地图，<br>都值得和队友分享。</p></div><button class="profile-button" data-action="profile"><span class="avatar">${esc(state.me.nickname.slice(0, 1))}</span><span><strong id="my-name">${esc(state.me.nickname)}</strong><small>${state.me.role === 'admin' ? '会长' : '公会成员'} · 编辑资料</small></span></button><button class="logout" data-action="logout">${icon('logout')}退出登录</button></div></aside><div class="workspace"><header class="topbar"><span class="breadcrumb">公会空间 <span>/</span> <strong id="breadcrumb">公会大厅</strong></span><div class="topbar-actions"><label class="search">${icon('search')}<input id="search" aria-label="搜索当前页面" placeholder="搜索成员、队伍或装备"></label><select id="mode-filter" aria-label="筛选游戏模式">${options(['我的模式', '全部模式', ...modes], modeFilter)}</select><span class="live"><i></i><span id="connection">已连接</span></span></div></header><main id="main"></main><footer>营地 · PD2 公会助手 <span>网站活跃不代表游戏在线 · 通知仅在本站接收</span></footer></div>`;
  renderMain(); clearInterval(polling); polling = setInterval(() => refresh(true), 8000);
}
const nameOf = id => state.members.find(m => m.id === id)?.nickname || '成员';
const visibleMode = item => modeFilter === '全部模式' || item.mode === (modeFilter === '我的模式' ? state.me.mode : modeFilter);
const searchMatch = (...text) => text.join(' ').toLowerCase().includes(query.toLowerCase());
const button = (label, action, id, style = '', disabled = false) => `<button type="button" class="button ${style}" data-action="${action}" ${id ? `data-id="${id}"` : ''} ${disabled ? 'disabled' : ''}>${label}</button>`;
const badge = (label, cls = '') => `<span class="badge ${cls}">${esc(label)}</span>`;
function empty(title, detail, action = '') { return `<div class="empty">${icon('camp')}<h3>${title}</h3><p>${detail}</p>${action}</div>`; }
function partyCard(party) {
  const joined = party.members.includes(state.me.id), owner = party.owner_id === state.me.id, full = party.members.length >= party.capacity, closed = party.status !== 'open', sameMode = party.mode === state.me.mode;
  const status = closed ? '已结束' : full ? '已满员' : '招募中';
  return `<article class="card party-card"><div class="card-top"><span class="category">${icon('parties')}${esc(party.activity)}</span>${badge(status, !closed && !full ? 'green' : '')}</div><h3>${esc(party.title)}</h3><div class="meta">${badge(party.mode)}<span>${esc(nameOf(party.owner_id))} 发起</span></div><p class="description">${esc(party.notes || '带上你的角色，一起出发。')}</p><div class="departure">${icon('clock')}<strong>${date(party.start_at)}</strong><span>本地时间</span></div><div class="roster">${party.members.map(id => `<span class="mini-avatar" title="${esc(nameOf(id))}">${esc(nameOf(id).slice(0, 1))}</span>`).join('')}<span class="seat-count">${party.members.length}<span> / ${party.capacity} 人</span></span></div><p class="small muted">队员：${party.members.map(id => esc(nameOf(id))).join('、')}</p>${party.room ? `<div class="room">房间 / 密码：<strong>${esc(party.room)}</strong>${button('复制', 'copy-room', party.id, 'compact')}</div>` : joined && !closed ? '<p class="small muted">队长尚未填写房间，请在游戏内联系队长。</p>' : ''}<div class="card-actions">${closed ? button('本次拼车已结束', '', null, 'full', true) : owner ? button('结束队伍', 'close-party', party.id, 'full') : joined ? button('退出队伍', 'leave-party', party.id, 'full') : button(!sameMode ? '游戏模式不匹配' : full ? '队伍已满' : '加入队伍 ' + icon('arrow'), 'join-party', party.id, 'full primary', full || !sameMode)}${!closed && !owner && state.me.role === 'admin' ? button('结束', 'close-party', party.id, 'compact') : ''}</div></article>`;
}
function gearCard(gear) {
  const owner = gear.owner_id === state.me.id, claimant = gear.claimant_id === state.me.id;
  const status = { available: '可领取', reserved: '已预留', completed: '已交付', withdrawn: '已撤回' }[gear.status];
  let actions = '';
  if (gear.status === 'available') actions = owner ? button('撤回分享', 'withdraw-gear', gear.id, 'full') : button(gear.mode === state.me.mode ? '预留这件装备' : '游戏模式不匹配', 'claim-gear', gear.id, 'full primary', gear.mode !== state.me.mode);
  if (gear.status === 'reserved' && (owner || claimant)) actions = button('取消预留', 'release-gear', gear.id) + (owner ? button('确认已交付', 'complete-gear', gear.id, 'primary') : '');
  actions = (actions || '<span class="small muted">' + (gear.status === 'reserved' ? '等待分享者与预留人交付' : '本次分享已结束') + '</span>') + button('生成装备图片', 'gear-image', gear.id, 'compact');
  return `<article class="card gear-card"><div class="card-top"><span class="category">${icon('gear')}${esc(gear.category)}</span>${badge(status, gear.status === 'available' ? 'green' : '')}</div><h3 class="item-name">${esc(gear.name)}</h3><div class="meta">${badge(gear.mode)}<span>${esc(nameOf(gear.owner_id))} 分享</span></div><p class="description preserve">${esc(gear.description)}</p>${gear.claimant_id ? `<p class="claim-note">${esc(nameOf(gear.claimant_id))} ${gear.status === 'completed' ? '已领取' : '已预留'} · 请在游戏中联系分享者</p>` : ''}<div class="card-actions">${actions || '<span class="small muted">' + (gear.status === 'reserved' ? '等待分享者与预留人交付' : '本次分享已结束') + '</span>'}</div></article>`;
}
function messageCard(message) {
  return `<article class="card message-card ${message.is_read ? 'read' : ''}"><div class="message-icon">${icon('messages')}</div><div class="message-content"><div class="card-top"><div class="meta">${badge(message.audience)}${!message.is_read ? badge('未读', 'gold') : ''}</div><span class="small muted">${date(message.created_at)}</span></div><h3>${esc(message.title)}</h3><p class="preserve">${esc(message.body)}</p><div class="message-footer"><span>${esc(nameOf(message.author_id))} · ${message.read_count} 人已读</span>${message.is_read ? '<span class="read-label">' + icon('check') + '已确认</span>' : button('确认已读', 'read-message', message.id, 'compact')}</div></div></article>`;
}
function renderMain() {
  if (!state) return;
  const [title, subtitle] = routes[route]; $('#breadcrumb').textContent = title;
  document.querySelectorAll('[data-route]').forEach(el => { el.classList.toggle('active', el.dataset.route === route); if (el.dataset.route === route) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  $('#my-name').textContent = state.me.nickname;
  const openParties = state.parties.filter(p => p.status === 'open' && p.members.length < p.capacity && visibleMode(p));
  const available = state.gear.filter(g => g.status === 'available' && visibleMode(g));
  const unread = state.messages.filter(m => !m.is_read).length;
  $('#count-messages').textContent = unread || ''; $('#count-parties').textContent = openParties.length || '';
  const primary = route === 'members' ? state.me.role === 'admin' ? button(icon('plus') + '邀请成员', 'invite', null, 'primary') : button('编辑我的资料', 'profile') : route === 'gear' ? button(icon('plus') + '分享装备', 'create-gear', null, 'primary') : route === 'messages' ? state.me.role === 'admin' ? button(icon('plus') + '发布公告', 'create-message', null, 'primary') : '' : button(icon('plus') + '发起拼车', 'create-party', null, 'primary');
  let content = `${state.demo ? '<div class="info-strip">演示营地 · 以下人物与物品均为示例，操作仅保存在本机内存中，重启演示后恢复。</div>' : ''}<div class="page-heading"><div><span class="eyebrow">${route === 'home' ? 'WELCOME TO THE CAMP' : 'SEASON 14 · ALLIANCE'}</span><h1>${title}</h1><p>${subtitle}</p></div>${primary}</div>`;
  if (route === 'home') {
    content += `<section class="hero"><div class="hero-copy"><span class="eyebrow">${esc(state.guild)} / S14</span><h2>篝火已燃起，<br>只差你的队伍。</h2><p>今晚刷哪张图？先来营地看看。<br>队友、装备和下一场冒险，都在这里。</p><div class="hero-buttons">${button('寻找队伍 ' + icon('arrow'), 'go-parties', null, 'primary')}${button('查看公会成员', 'go-members', null, 'subtle')}</div></div><div class="hero-art" aria-hidden="true"><div class="moon"></div><div class="mountain back"></div><div class="mountain front"></div><div class="tent"></div><div class="fire"><span></span><i></i></div><div class="ground"></div><div class="art-caption">THE SANCTUARY IS BETTER TOGETHER</div></div></section><section class="stats"><div class="stat">${icon('members')}<div><span>公会成员</span><strong>${state.members.length}<small> 人</small></strong></div><em>${state.members.filter(m => state.serverTime - m.last_seen < 120000).length} 人网站活跃</em></div><div class="stat">${icon('parties')}<div><span>正在招募</span><strong>${openParties.length}<small> 支队伍</small></strong></div><em>当前模式筛选</em></div><div class="stat">${icon('gear')}<div><span>等待新主人的装备</span><strong>${available.length}<small> 件</small></strong></div><em>公会成员互助</em></div></section><div class="section-title"><div><h2>下一班车</h2><span>找到你的位置，一起出发</span></div><button data-route="parties" class="button text">全部拼车 ${icon('arrow')}</button></div><div class="cards">${openParties.filter(p => searchMatch(p.title, p.notes)).slice(0, 3).map(partyCard).join('') || empty('第一支队伍，等你发起', '开荒、升级或刷地图，把今晚的计划告诉队友。', button('发起拼车', 'create-party', null, 'primary'))}</div><div class="section-title"><div><h2>营地公告</h2><span>${unread ? `${unread} 条公告等待确认` : '公会的重要消息，都在这里'}</span></div><button data-route="messages" class="button text">全部公告 ${icon('arrow')}</button></div>${state.messages.filter(m => searchMatch(m.title, m.body)).slice(0, 2).map(messageCard).join('') || empty('营地暂时很安静', state.me.role === 'admin' ? '发布第一条公告，和队友约好集合时间。' : '会长发布的通知会出现在这里。')}`;
  }
  if (route === 'members') {
    const members = state.members.filter(m => visibleMode(m) && searchMatch(m.nickname, m.character, m.className, m.build));
    content += `<div class="info-strip">${icon('members')}<span>共 ${state.members.length} 位成员 · 显示 ${members.length} 位 · 一个账号登记一个当前角色</span></div><div class="table-wrap"><table><thead><tr><th>公会成员</th><th>角色 / 职业</th><th>等级 / BD</th><th>游戏模式</th><th>常用时段</th><th>网站状态</th><th>装备快照</th></tr></thead><tbody>${members.map(m => `<tr><td><div class="member-cell"><span class="avatar">${esc(m.nickname.slice(0, 1))}</span><span><strong>${esc(m.nickname)}</strong><small>${m.role === 'admin' ? '会长' : '成员'}${m.id === state.me.id ? ' · 我' : ''}</small>${memberBadges(m)}<small>成功分享 ${m.completedShares || 0} 次</small></span></div></td><td><strong>${esc(m.character)}</strong><small>${esc(m.className)}</small></td><td>Lv.${m.level}<small>${esc(m.build || '尚未登记 BD')}</small></td><td>${badge(m.mode)}</td><td>${esc(m.availability || '未填写')}</td><td><span class="presence ${state.serverTime - m.last_seen < 120000 ? 'online' : ''}">${state.serverTime - m.last_seen < 120000 ? '最近活跃' : '离线'}</span></td><td>${m.has_armory ? `<a class="button compact" href="/armory?member=${m.id}">查看装备</a>` : '<span class="small muted">尚未导入</span>'}</td></tr>`).join('')}</tbody></table>${members.length ? '' : empty('没有匹配的成员', '试试其他关键词或切换模式筛选。')}</div>`;
  }
  if (route === 'parties') {
    const parties = state.parties.filter(p => visibleMode(p) && searchMatch(p.title, p.activity, p.notes, nameOf(p.owner_id))).sort((a, b) => (a.status !== 'open') - (b.status !== 'open'));
    content += `<div class="info-strip">${icon('parties')}<span>当前角色：${esc(state.me.character)} · ${esc(state.me.mode)} · 加入队伍后可查看房间信息</span></div><div class="cards">${parties.map(partyCard).join('') || empty('这里还有很多空位', '发起第一班车，或调整模式和搜索条件。', button('发起拼车', 'create-party', null, 'primary'))}</div>`;
  }
  if (route === 'gear') {
    const gear = state.gear.filter(g => visibleMode(g) && searchMatch(g.name, g.description, g.category, nameOf(g.owner_id)));
    const count = state.me.completedShares || 0;
    const claimable = contributionBadges.filter(b => count >= b.threshold && !state.me.badges?.some(earned => earned.id === b.id)).length;
    content += `<section class="contribution-summary"><div><h2>我的公会贡献</h2><p>累计成功分享 <strong>${count}</strong> 次 · 已确认交付后计入</p>${memberBadges(state.me)}</div>${button(claimable ? `领取徽章 · ${claimable}` : '查看贡献徽章', 'achievements', null, claimable ? 'primary' : '')}</section>`;
    content += `<div class="info-strip">${icon('gear')}<span>公会内部无偿互助 · 网页负责预留与记录，物品请在游戏中交付</span></div><div class="cards">${gear.map(gearCard).join('') || empty('好装备，值得传下去', '把闲置装备和属性贴上来，帮助队友成型。', button('分享装备', 'create-gear', null, 'primary'))}</div>`;
  }
  if (route === 'messages') content += `<div class="info-strip">${icon('messages')}<span>公告由会长发布 · 显示全体成员及你的游戏模式公告 · 通知仅在站内接收</span></div>${state.messages.filter(m => searchMatch(m.title, m.body)).map(messageCard).join('') || empty('暂时没有公告', '公会通知发布后，可以在这里确认已读。')}`;
  $('#main').innerHTML = content;
}
function showDialog(title, formId, fields, submit = '确认') {
  const dialog = $('#dialog');
  dialog.innerHTML = `<div class="dialog-heading"><div><span class="eyebrow">GUILD CAMP</span><h2>${title}</h2></div><button class="close-dialog" data-action="close-dialog" aria-label="关闭弹窗">×</button></div><form id="${formId}">${fields}<p class="form-error" role="alert"></p><div class="dialog-actions">${button('取消', 'close-dialog')}<button type="submit" class="button primary">${submit}</button></div></form>`;
  dialog.classList.toggle('gear-dialog', formId === 'gear-form' || formId === 'gear-image-form');
  dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector('.close-dialog').focus({ preventScroll: true });
}
function openForm(kind) {
  if (kind === 'profile') return showDialog('我的角色资料', 'profile-form', `<p class="muted small">游戏内数据请手动登记。切换模式前需结束当前参与的拼车和装备互助。</p>${fieldsProfile(state.me)}`, '保存资料');
  if (kind === 'create-party') {
    const local = new Date(Date.now() + 30 * 60000); local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return showDialog('发起一班拼车', 'party-form', `<p class="muted small">模式：${esc(state.me.mode)} · 你将自动作为队长加入。</p><label>拼车标题<input name="title" maxlength="80" required placeholder="例如：T1 地图慢刷，欢迎刚成型的队友"></label><div class="form-grid"><label>活动类型<select name="activity">${options(['地图', '刷怪升级', '开荒', 'Boss', '其他'])}</select></label><label>总人数（含队长）<input name="capacity" type="number" min="2" max="8" value="8" required></label></div><label>出发时间（你的本地时间）<input name="start_at" type="datetime-local" value="${local.toISOString().slice(0, 16)}" required></label><label>房间名称 / 密码<input name="room" maxlength="120" placeholder="可稍后通过游戏内联系；仅报名成员及会长可见"></label><label>组队说明<textarea name="notes" maxlength="1000" rows="3" placeholder="地图阶级、装备要求、分配规则、服务器地区等"></textarea></label>`, '发布拼车');
  }
  if (kind === 'create-gear') {
    showDialog('让装备找到新主人', 'gear-form', `<p class="small muted">模式：${esc(state.me.mode)} · 公会内部无偿分享，游戏中完成交付。</p><details class="gear-import" open><summary>快速粘贴装备 · 兼容 PD2 Trader 数据</summary><p class="small muted">游戏内鼠标指向装备，按 Ctrl+C；在下方粘贴后点“解析并填入”。查价器 Ctrl+D 会恢复原剪贴板，请使用游戏 Ctrl+C。</p><label>装备原始数据<textarea id="gear-paste" rows="3" maxlength="65536" placeholder="粘贴游戏复制的单件装备 JSON，或普通属性文本"></textarea></label><div class="gear-tools">${button('读取剪贴板', 'paste-equipment')}${button('解析并填入', 'parse-equipment', null, 'primary')}<a class="button subtle" href="/armory">从角色装备选择</a></div><p id="gear-import-status" class="small" role="status"></p></details><div class="form-grid"><label>装备名称<input name="name" maxlength="80" required placeholder="例如：蛇魔法师之皮"></label><label>装备分类<select name="category">${options(['武器', '防具', '饰品', '符文 / 材料', '地图', '其他'])}</select></label></div><label>属性与说明<textarea name="description" rows="6" maxlength="1500" required placeholder="也可以直接在这里粘贴属性文本，补充腐化词缀及交付时间。"></textarea></label>${gearImagePanel()}`, '发布分享');
    updateGearImage(); return;
  }
  if (kind === 'create-message') return showDialog('发布公会公告', 'message-form', `<label>公告标题<input name="title" maxlength="80" required placeholder="例如：今晚 8 点开荒集合"></label><label>发送对象<select name="audience">${options(['全体成员', ...modes])}</select></label><label>公告内容<textarea name="body" maxlength="2000" rows="6" required placeholder="队友需要知道的重要事情…"></textarea></label><p class="small muted">发布后显示在成员网页中，可统计已读人数。</p>`, '发布公告');
}
function openArmoryDraft() {
  if (new URLSearchParams(location.search).get('share') !== 'armory') return;
  history.replaceState(null, '', '/');
  try {
    const raw = sessionStorage.getItem('armory-gear-draft');
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (draft.memberId !== state.me.id || draft.mode !== state.me.mode) { toast('草稿与当前账号或游戏模式不匹配，请重新选择装备。', true); return; }
    route = 'gear'; renderMain(); openForm('create-gear');
    const form = $('#gear-form');
    form.elements.name.value = draft.name || '';
    form.elements.category.value = draft.category || '其他';
    form.elements.description.value = draft.description || '';
    updateGearImage();
    sessionStorage.removeItem('armory-gear-draft');
  } catch { toast('无法读取装备草稿，请重新选择物品。', true); }
}
function gearImagePanel() {
  return `<section class="gear-image-panel" aria-label="装备分享图片"><div class="gear-preview-heading"><h3>装备图片预览</h3><span class="small muted">本地生成 PNG</span></div><p id="gear-image-empty" class="small muted">填写装备名称和属性后，图片会自动生成；下载图片不需要发布分享。</p><img id="gear-image-preview" alt="装备分享图片预览" hidden><div class="gear-tools"><a class="button" id="gear-image-download" aria-disabled="true">下载 PNG</a>${button('复制图片', 'copy-gear-image', null, '', true)}</div><p id="gear-image-status" class="small muted" role="status"></p></section>`;
}
function memberBadges(member) {
  const badges = contributionBadges.filter(b => member.badges?.some(earned => earned.id === b.id));
  return badges.length ? `<div class="contribution-badges">${badges.map(b => `<span class="contribution-badge" title="${esc(b.description)} · 已成功分享至少 ${b.threshold} 次"><span class="badge-symbol" aria-hidden="true">${b.symbol}</span>${esc(b.name)}</span>`).join('')}</div>` : '';
}
function openAchievements(message = '') {
  const count = state.me.completedShares || 0;
  showDialog('分享成就 · 传火之路', 'achievements-form', `<p class="achievement-summary">累计成功分享 <strong>${count}</strong> 次。以分享者“确认已交付”为准，每条装备分享最多计一次；所有模式的历史交付累计。</p><div class="achievement-list">${contributionBadges.map(b => {
    const earned = state.me.badges?.some(owned => owned.id === b.id), ready = count >= b.threshold;
    return `<article class="achievement-card ${earned ? 'earned' : ready ? 'ready' : 'locked'}"><span class="achievement-symbol" aria-hidden="true">${b.symbol}</span><div class="achievement-content"><h3>${esc(b.name)}</h3><p>${esc(b.description)}</p><progress value="${Math.min(count, b.threshold)}" max="${b.threshold}" aria-label="${esc(b.name)}领取进度"></progress><p>${Math.min(count, b.threshold)} / ${b.threshold} 次</p></div>${earned ? '<span class="achievement-state">已领取 ✓</span>' : `<button type="button" class="button ${ready ? 'primary' : ''}" data-action="claim-badge" data-badge-id="${b.id}" ${ready ? '' : 'disabled'}>${ready ? '领取徽章' : `需 ${b.threshold} 次`}</button>`}</article>`;
  }).join('')}</div><p class="achievement-status" role="status">${esc(message)}</p>`, '完成');
}
function renderGearImage(data) {
  gearCanvas = null;
  const image = $('#gear-image-preview'), link = $('#gear-image-download');
  if (!image) return;
  const enabled = !!(data.name?.trim() && data.description?.trim());
  image.removeAttribute('src');
  image.hidden = !enabled; $('#gear-image-empty').hidden = enabled;
  link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true');
  $('[data-action="copy-gear-image"]').disabled = true;
  if (!enabled) return;
  try {
    gearCanvas = createGearCanvas(data); image.src = gearCanvas.toDataURL('image/png');
    link.href = image.src; link.download = `${data.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 70)}-PD2.png`; link.setAttribute('aria-disabled', 'false');
    $('[data-action="copy-gear-image"]').disabled = false;
    $('#gear-image-status').textContent = '图片仅包含当前显示的名称、属性、模式和分享者；请确认后发送。';
  } catch (error) { gearCanvas = null; image.hidden = true; $('#gear-image-status').textContent = error.message; }
}
function updateGearImage() {
  clearTimeout(gearPreviewTimer);
  const form = $('#gear-form'); if (!form) return;
  renderGearImage({ ...Object.fromEntries(new FormData(form)), mode: state.me.mode, guild: state.guild, author: state.me.nickname });
}
function importPastedEquipment() {
  const parsed = parseEquipmentPaste($('#gear-paste').value), form = $('#gear-form');
  const replacing = !!(form.elements.name.value.trim() || form.elements.description.value.trim());
  // An explicit parse click replaces editable fields; plain text leaves an existing name/category intact.
  if (parsed.name) { form.elements.name.value = parsed.name; form.elements.category.value = parsed.category; }
  form.elements.description.value = parsed.description;
  $('#gear-import-status').textContent = parsed.source === 'pd2-clipboard' ? `已${replacing ? '更新' : '填入'}装备名称和属性；分类可手动调整。数据未包含游戏模式，当前使用你的登记模式 ${state.me.mode}。` : '已填入属性文本，请补充装备名称并确认分类。';
  updateGearImage();
}
async function refresh(quiet = false) {
  if (refreshing) return; refreshing = true;
  try { state = await api('/state'); if (!$('#main')) { renderShell(); openArmoryDraft(); } else renderMain(); $('#connection').textContent = '已连接'; $('.live').classList.remove('disconnected'); }
  catch (e) { if (e.status === 401) { state = null; renderAuth(await api('/status')); } else { if ($('#connection')) { $('#connection').textContent = '连接中断'; $('.live').classList.add('disconnected'); } if (!quiet) toast(e.message, true); } }
  finally { refreshing = false; }
}
async function start() { try { const status = await api('/status'); if (status.me) await refresh(); else renderAuth(status); } catch (e) { $('#app').innerHTML = '<div class="boot">暂时无法连接公会服务器，请刷新重试。</div>'; toast(e.message, true); } }
document.addEventListener('click', async e => {
  const el = e.target.closest('button'); if (!el || el.disabled) return;
  if (el.dataset.route) { route = el.dataset.route; query = ''; $('#search').value = ''; renderMain(); window.scrollTo(0, 0); return; }
  const action = el.dataset.action, id = Number(el.dataset.id); if (!action) return;
  if (action === 'close-dialog') { $('#dialog').close(); return; }
  if (action === 'login-screen') { inviteCode = ''; history.replaceState(null, '', '/'); renderAuth(await api('/status')); return; }
  if (action.startsWith('go-')) { route = action.slice(3); renderMain(); return; }
  if (['profile', 'create-party', 'create-gear', 'create-message'].includes(action)) { openForm(action); return; }
  if (action === 'achievements') { openAchievements(); return; }
  el.disabled = true;
  try {
    if (action === 'claim-badge') {
      const result = await api('/badges/claim', { badgeId: el.dataset.badgeId });
      await refresh(); openAchievements(`已领取「${result.badge.name}」，已展示在成员名册。`); toast(`获得徽章：${result.badge.name}`); return;
    }
    if (action === 'parse-equipment') { importPastedEquipment(); return; }
    if (action === 'paste-equipment') {
      try { $('#gear-paste').value = await navigator.clipboard.readText(); }
      catch { $('#gear-paste').focus(); toast('浏览器未允许读取剪贴板，请在原始数据框按 Ctrl+V 粘贴。'); return; }
      importPastedEquipment(); return;
    }
    if (action === 'copy-gear-image') {
      updateGearImage();
      if (!gearCanvas) throw new Error('请先填写装备名称和属性。');
      try {
        if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('unsupported');
        const blob = new Promise((resolve, reject) => gearCanvas.toBlob(b => b ? resolve(b) : reject(new Error('生成失败')), 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('装备图片已复制，可粘贴到群聊。');
      } catch { toast('浏览器未允许复制图片，请点击“下载 PNG”后发送。', true); }
      return;
    }
    if (action === 'gear-image') {
      const gear = state.gear.find(g => g.id === id); if (!gear) return;
      showDialog('装备分享图片', 'gear-image-form', gearImagePanel(), '关闭预览');
      renderGearImage({ ...gear, guild: state.guild, author: nameOf(gear.owner_id) }); return;
    }
    if (action === 'logout') { await api('/logout', {}); state = null; await start(); return; }
    if (action === 'invite') {
      const invitation = await api('/invites', {}); const link = `${location.origin}/#invite=${invitation.code}`;
      showDialog('邀请一位新队友', 'invite-form', `<p class="muted">一次性邀请，7 天内有效。请只发给你要邀请的成员。</p><label>邀请链接<input id="invite-link" readonly value="${esc(link)}"></label><p class="small muted">对方使用链接登记后即成为公会成员。每位新成员请单独生成邀请。</p>`, '复制邀请链接'); return;
    }
    if (action === 'copy-room') { await navigator.clipboard.writeText(state.parties.find(p => p.id === id).room); toast('房间信息已复制'); return; }
    const endpoints = { 'join-party': `/parties/${id}/join`, 'leave-party': `/parties/${id}/leave`, 'close-party': `/parties/${id}/close`, 'claim-gear': `/gear/${id}/claim`, 'release-gear': `/gear/${id}/release`, 'complete-gear': `/gear/${id}/complete`, 'withdraw-gear': `/gear/${id}/withdraw`, 'read-message': `/messages/${id}/read` };
    if (endpoints[action]) { if (['close-party', 'withdraw-gear', 'complete-gear'].includes(action)) {
      const labels = { 'close-party': ['结束这支队伍？', '队伍结束后将停止报名。', '确认结束'], 'withdraw-gear': ['撤回这件装备？', '撤回后将不再接受预留。', '确认撤回'], 'complete-gear': ['已经在游戏中交付了吗？', '确认后会记录为已交付。', '确认已交付'] };
      const [title, text, submit] = labels[action]; showDialog(title, 'confirm-form', `<p>${text}</p><input name="endpoint" type="hidden" value="${endpoints[action]}">`, submit); return;
    } await api(endpoints[action], {}); toast('已更新'); await refresh(); }
  } catch (error) { toast(error.message, true); } finally { if (el.isConnected) el.disabled = false; }
});
document.addEventListener('submit', async e => {
  e.preventDefault(); const form = e.target, body = Object.fromEntries(new FormData(form)), submit = form.querySelector('[type="submit"]');
  if (!submit) return; submit.disabled = true; const errorEl = form.querySelector('.form-error'); if (errorEl) errorEl.textContent = '';
  try {
    if (['gear-image-form', 'achievements-form'].includes(form.id)) { $('#dialog').close(); return; }
    if (form.id === 'invite-form') { const input = $('#invite-link'); try { await navigator.clipboard.writeText(input.value); toast('邀请链接已复制'); } catch { input.select(); toast('请复制已选中的邀请链接'); } return; }
    if (form.id === 'auth-form') { if (authMode === 'register') body.invite = inviteCode; await api(`/${authMode}`, body); inviteCode = ''; history.replaceState(null, '', '/'); await refresh(); return; }
    const endpoints = { 'profile-form': '/profile', 'party-form': '/parties', 'gear-form': '/gear', 'message-form': '/messages', 'confirm-form': body.endpoint };
    if (form.id === 'party-form') body.start_at = new Date(body.start_at).toISOString();
    if (endpoints[form.id]) { await api(endpoints[form.id], body); $('#dialog').close(); toast('保存成功'); await refresh(); }
  } catch (error) { if (errorEl) errorEl.textContent = error.message; else toast(error.message, true); } finally { submit.disabled = false; }
});
document.addEventListener('input', e => {
  if (e.target.id === 'search') { query = e.target.value; renderMain(); }
  if (e.target.closest('#gear-form') && ['name', 'description'].includes(e.target.name)) { clearTimeout(gearPreviewTimer); gearPreviewTimer = setTimeout(updateGearImage, 180); }
});
document.addEventListener('change', e => { if (e.target.closest('#gear-form') && e.target.name === 'category') updateGearImage(); });
document.addEventListener('change', e => { if (e.target.id === 'mode-filter') { modeFilter = e.target.value; renderMain(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state) refresh(true); });
start();
