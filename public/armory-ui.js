const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = value => value ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '官方未提供';
import { equippedItems, itemsInSlots, itemImage } from './equipment-view.js';
let equipmentScope = '穿戴装备', weaponSet = 1, detailKey = null, pinned = false, detailAnchor = null, hideTimer, restoringFocus = false;
let state, ownerId, snapshot, busy = false;
let toastTimer;
function toast(message, error = false) { $('#toast').textContent = message; $('#toast').className = `visible ${error ? 'error' : ''}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').className = '', 5000); }
async function api(path, body) {
  const res = await fetch('/api' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await res.json(); if (!res.ok) { if (res.status === 401) location.href = '/'; throw new Error(value.error || '请求失败'); } return value;
}
const tag = (label, cls = '') => `<span class="badge ${cls}">${esc(label)}</span>`;
function shell() {
  const own = ownerId === state.me.id;
  $('#armory-app').innerHTML = `<div class="page-heading"><div><span class="eyebrow">PD2 ARMORY / 公会装备快照</span><h1>角色装备</h1><p>从官方公开角色数据导入，让队友看见你的配装。</p></div><label class="member-switch">查看成员<select id="member-select" aria-label="查看哪位成员的装备">${state.members.filter(m => m.id === state.me.id || m.has_armory).map(m => `<option value="${m.id}" ${m.id === ownerId ? 'selected' : ''}>${esc(m.nickname)}${m.id === state.me.id ? '（我）' : ''}</option>`).join('')}</select></label></div><div class="info-strip"><span>公开角色数据可被任何人读取，导入不验证账号归属；保存后本公会成员可见。仅包含官方返回的物品，不代表完整账号仓库或实时背包。</span></div>${own ? `<section class="card import-panel"><h2>导入我的角色装备</h2><p class="muted small">只向 PD2 官方接口发送角色名，不提交游戏密码或 Cookie。重新导入会替换你上一次保存的快照。</p><form id="import-form"><label>角色名或官方角色链接<input name="character" maxlength="300" required value="${esc(snapshot?.name || state.me.character)}" placeholder="ExampleHero 或 https://projectdiablo2.com/character/ExampleHero"></label><button class="button primary" type="submit">从官方读取并保存到公会</button><p class="form-error" role="alert"></p></form><details class="json-import"><summary>无法联网？使用官方 JSON 手动导入</summary><p class="small muted">在浏览器打开 <a id="official-json-link" href="https://api.projectdiablo2.com/game/character/${encodeURIComponent(snapshot?.name || state.me.character)}" target="_blank" rel="noopener noreferrer">官方角色 JSON</a>，复制完整内容粘贴到下方，或选择保存的 .json 文件。请勿粘贴登录信息。</p><form id="json-form"><label>选择官方 JSON 文件<input id="json-file" type="file" accept=".json,application/json"></label><label>官方角色 JSON<textarea name="json" maxlength="2097152" rows="5" required placeholder='{"character": {...}, "items": [...]}'></textarea></label><button class="button" type="submit">解析并保存到公会</button><p class="form-error" role="alert"></p></form></details></section>` : `<div class="info-strip">正在查看 ${esc(state.members.find(m => m.id === ownerId)?.nickname || '成员')} 保存的装备快照。仅本人可以替换快照或从中创建分享草稿。</div>`}<section id="snapshot"></section>`;
  drawSnapshot();
  const panel = $('#import-form')?.closest('.import-panel');
  if (panel && snapshot) {
    const details = document.createElement('details'); details.className = panel.className;
    const summary = document.createElement('summary'); summary.textContent = '更新角色装备快照';
    details.append(summary, ...panel.childNodes); panel.replaceWith(details);
  }
}
function drawSnapshot() {
  closeDetail();
  if (!snapshot) { $('#snapshot').innerHTML = '<div class="empty"><h3>还没有装备快照</h3><p>输入角色名，或粘贴官方 JSON，即可查看物品和属性。</p></div>'; return; }
  const own = ownerId === state.me.id;
  $('#snapshot').innerHTML = `<section class="snapshot-heading card"><div><span class="eyebrow">${snapshot.source === 'official' ? '从官方接口读取' : '手动 JSON · 来源未验证'}</span><h2>${esc(snapshot.name)} <small>Lv.${snapshot.level} ${esc(snapshot.className)}</small></h2><div class="meta">${tag(snapshot.mode)}${tag('未验证账号归属')}<a href="${esc(snapshot.armoryUrl)}" target="_blank" rel="noopener noreferrer">查看官方角色页 ↗</a></div></div><div class="snapshot-dates"><p>官方数据时间：${fmt(snapshot.updatedAt)}</p><p>本站导入时间：${fmt(snapshot.importedAt)}</p></div></section>${snapshot.mode !== state.me.mode && own ? `<div class="info-strip">快照模式为 ${esc(snapshot.mode)}，你的登记模式为 ${esc(state.me.mode)}。当前可浏览；如需从快照分享装备，请先在大厅编辑角色资料，使模式一致。</div>` : ''}`;
  $('#snapshot').insertAdjacentHTML('beforeend', '<section class="equipment-view card" aria-label="穿戴装备查看窗口"><div class="equipment-view-heading"><div><span class="eyebrow">EQUIPMENT / 装备查看</span><h2>穿戴装备</h2></div><div class="equipment-tabs" aria-label="装备归属"><button type="button" data-scope="穿戴装备">角色</button><button type="button" data-scope="佣兵">佣兵</button></div></div><div id="equipment-board"></div><p class="equipment-help">鼠标悬停查看属性 · 点击固定 · Esc 关闭 · 手机点按查看</p></section>');
  drawEquipment();
}
const slotPaths = {
  helm: 'M8 19V10a8 8 0 0116 0v9l-6-3h-4zM8 9l-4-4m20 4l4-4M16 5v10',
  amulet: 'M7 3c0 17 18 17 18 0M16 17l5 6-5 6-5-6z',
  weapon: 'M7 27L25 4l3-1-1 4L10 30M5 21l9 7',
  armor: 'M10 3l6 3 6-3 7 7-5 6-3-3v16H11V13l-3 3-5-6z',
  offhand: 'M5 5l11-3 11 3v11c0 7-11 14-11 14S5 23 5 16zM16 5v20',
  gloves: 'M8 28L4 16l3-2 4 5V6l3-1 2 11V3l3 1 1 12 2-10 3 2-1 13-4 7z',
  belt: 'M3 11h26v11H3zM12 8h8v17h-8zM16 15h7',
  boots: 'M11 3h13v17l5 4v5H4v-6l7-5zM12 9h10',
  'ring-one': 'M7 18a9 9 0 1018 0 9 9 0 00-18 0M10 9l6-6 6 6-6 6z',
  'ring-two': 'M7 18a9 9 0 1018 0 9 9 0 00-18 0M10 9l6-6 6 6-6 6z',
};
function slotIcon(position) { return `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="${slotPaths[position]}"></path></svg>`; }
function qualityClass(item) { return ['Unique', 'Set', 'Rare', 'Magic', 'Crafted'].includes(item.quality) ? item.quality.toLowerCase() : 'normal'; }
function drawEquipment() {
  closeDetail();
  document.querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === equipmentScope)));
  $('.equipment-view h2').textContent = equipmentScope === '佣兵' ? '佣兵装备' : '角色穿戴';
  const slots = itemsInSlots(snapshot.items, equipmentScope, weaponSet);
  $('#equipment-board').innerHTML = `<div class="equipment-stage"><div class="equipment-watermark" aria-hidden="true">△</div><div class="weapon-switch" aria-label="武器配置">${equipmentScope === '穿戴装备' ? `<button type="button" data-weapon-set="1" aria-pressed="${weaponSet === 1}">I 主武器</button><button type="button" data-weapon-set="2" aria-pressed="${weaponSet === 2}">II 备用</button>` : '<span>佣兵穿戴</span>'}</div><div class="equipment-slots">${slots.map(({slot, position, item}) => {
    const label = equipmentScope === '穿戴装备' && weaponSet === 2 && ['主手', '副手'].includes(slot) ? `备用${slot}` : slot;
    const image = item && itemImage(item);
    return `<button type="button" class="equipment-slot slot-${position} ${item ? `occupied quality-${qualityClass(item)}` : 'vacant'}" ${item ? `data-equipment="${item.key}" aria-expanded="false" aria-controls="equipment-detail"` : 'disabled'} aria-label="${esc(label)}：${esc(item?.name || '无装备数据')}"><span class="slot-label">${esc(label)}</span><span class="slot-art">${slotIcon(position)}${image ? `<img src="${esc(image)}" alt="" referrerpolicy="no-referrer">` : ''}</span><span class="slot-item-name">${esc(item?.name || '空槽位')}</span></button>`;
  }).join('')}</div><div class="equipment-stage-footer"><span>${esc(snapshot.name)}</span><span>${slots.filter(s => s.item).length} 个槽位 · ${equipmentScope === '佣兵' ? '佣兵' : `配置 ${weaponSet === 1 ? 'I' : 'II'}`}</span></div></div>`;
  $('#equipment-board').querySelectorAll('img').forEach(img => {
    img.addEventListener('load', () => img.parentElement.classList.add('has-image'));
    img.addEventListener('error', () => img.remove());
    if (img.complete && img.naturalWidth) img.parentElement.classList.add('has-image');
  });
}
function closeDetail(restoreFocus = false) {
  clearTimeout(hideTimer);
  const anchor = detailAnchor;
  if (anchor) { anchor.setAttribute('aria-expanded', 'false'); anchor.removeAttribute('aria-describedby'); }
  const detail = $('#equipment-detail'); if (detail) detail.hidden = true;
  detailKey = null; pinned = false; detailAnchor = null;
  if (restoreFocus && anchor?.isConnected) { restoringFocus = true; anchor.focus({preventScroll:true}); restoringFocus = false; }
}
function positionDetail() {
  const detail = $('#equipment-detail'); if (detail.hidden || !detailAnchor?.isConnected) return;
  // Narrow screens use a bottom sheet defined in CSS.
  if (window.innerWidth <= 650) { detail.style.left = ''; detail.style.top = ''; return; }
  const rect = detailAnchor.getBoundingClientRect(), width = detail.offsetWidth, height = detail.offsetHeight;
  const right = rect.right + 14;
  const left = right + width <= innerWidth - 12 ? right : rect.left - width - 14;
  detail.style.left = `${Math.max(12, Math.min(left, innerWidth - width - 12))}px`;
  detail.style.top = `${Math.max(12, Math.min(rect.top - 35, innerHeight - height - 12))}px`;
}
function showDetail(anchor, pin = false) {
  clearTimeout(hideTimer);
  if (pinned && !pin) return;
  const item = snapshot.items.find(i => i.key === anchor.dataset.equipment); if (!item) return;
  closeDetail(); detailKey = item.key; pinned = pin; detailAnchor = anchor;
  const detail = $('#equipment-detail');
  detail.classList.toggle('is-pinned', pin);
  detail.setAttribute('role', pin ? 'dialog' : 'tooltip');
  anchor.setAttribute('aria-expanded', String(pin)); anchor.setAttribute('aria-describedby', 'equipment-detail');
  detail.innerHTML = `<div class="equipment-detail-bar"><span>${pin ? '已固定 · 点击其他装备切换' : '装备属性 · 点击槽位固定'}</span>${pin ? '<button type="button" class="detail-close" aria-label="关闭装备属性">×</button>' : ''}</div><div class="equipment-detail-content"><p class="detail-location">${esc(item.group)} / ${esc(item.slot)}</p><h3 class="quality-${qualityClass(item)}">${esc(item.name)}</h3><p class="detail-base">${esc(item.baseName)}</p><div class="detail-flags">${[item.ethereal && '无形', item.corrupted && '已腐化', item.desecrated && '已亵渎', item.sockets && `${item.sockets} 孔`].filter(Boolean).map(v=>tag(v)).join('')}</div><p class="detail-requirements">${[item.defense !== null && `防御 ${item.defense}`, item.requiredLevel !== null && `需求等级 ${item.requiredLevel}`, item.itemLevel !== null && `物品等级 ${item.itemLevel}`].filter(Boolean).map(esc).join(' · ')}</p><ul class="properties">${item.properties.map(p=>`<li>${esc(p)}</li>`).join('') || '<li>官方未提供属性文本</li>'}</ul>${item.socketed.length ? `<div class="detail-sockets"><p>镶嵌物 (${item.socketed.length})</p>${item.socketed.map(s=>`<div><strong>${esc(s.name)}</strong>${s.properties.map(p=>`<p>${esc(p)}</p>`).join('')}</div>`).join('')}</div>` : ''}</div>`;
  if (pin && ownerId === state.me.id) {
    const canShare = snapshot.mode === state.me.mode;
    detail.querySelector('.equipment-detail-content').insertAdjacentHTML('beforeend', `<div class="detail-share"><button class="button full ${canShare ? 'primary' : ''}" type="button" data-share="${item.key}" ${canShare ? '' : 'disabled'}>${canShare ? '填入装备分享表单' : '模式不匹配，暂不能分享'}</button></div>`);
  }
  detail.hidden = false; positionDetail();
  if (pin) detail.querySelector('.detail-close').focus({preventScroll:true});
}
document.addEventListener('pointerover', event => {
  if (event.pointerType !== 'mouse' || innerWidth <= 650) return;
  const anchor = event.target.closest('[data-equipment]');
  if (anchor && !anchor.contains(event.relatedTarget)) showDetail(anchor);
  if (event.target.closest('#equipment-detail')) clearTimeout(hideTimer);
});
document.addEventListener('pointerout', event => {
  if (!pinned && event.target.closest('[data-equipment], #equipment-detail') && !event.target.closest('[data-equipment], #equipment-detail').contains(event.relatedTarget)) hideTimer = setTimeout(() => closeDetail(), 160);
});
document.addEventListener('focusin', event => { const anchor = event.target.closest('[data-equipment]'); if (anchor && !restoringFocus && anchor.matches(':focus-visible')) showDetail(anchor); });
document.addEventListener('focusout', event => { if (!pinned && event.target.closest('[data-equipment]')) closeDetail(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && detailKey) { event.preventDefault(); closeDetail(true); } });
document.addEventListener('click', event => {
  const anchor = event.target.closest('[data-equipment]');
  if (anchor) { if (pinned && detailKey === anchor.dataset.equipment) closeDetail(true); else showDetail(anchor, true); return; }
  if (event.target.closest('.detail-close')) { closeDetail(true); return; }
  const scope = event.target.closest('[data-scope]');
  if (scope) { equipmentScope = scope.dataset.scope; drawEquipment(); return; }
  const set = event.target.closest('[data-weapon-set]');
  if (set) { weaponSet = Number(set.dataset.weaponSet); drawEquipment(); return; }
  if (!event.target.closest('#equipment-detail')) closeDetail();
});
window.addEventListener('resize', positionDetail);
window.addEventListener('scroll', () => { if (pinned) positionDetail(); else closeDetail(); }, true);
document.addEventListener('submit', async event => {
  if (!['import-form', 'json-form'].includes(event.target.id)) return;
  event.preventDefault(); if (busy) return; busy = true;
  const form = event.target, submit = form.querySelector('button'), err = form.querySelector('.form-error');
  submit.disabled = true; const oldLabel = submit.textContent; submit.textContent = '正在读取并解析…'; err.textContent = '';
  try { const result = await api('/armory/import', Object.fromEntries(new FormData(form))); snapshot = result.snapshot; const me = state.members.find(m => m.id === state.me.id); if (me) me.has_armory = 1; shell(); toast(`已导入 ${snapshot.name}，显示 ${equippedItems(snapshot.items).length} 件穿戴装备（含佣兵与备用武器）`); }
  catch (error) { err.textContent = error.message; }
  finally { busy = false; if (submit.isConnected) { submit.disabled = false; submit.textContent = oldLabel; } }
});
document.addEventListener('change', async event => {
  if (event.target.id === 'member-select') {
    ownerId = Number(event.target.value); equipmentScope = '穿戴装备'; weaponSet = 1;
    try { snapshot = (await api(`/armory/${ownerId}`)).snapshot; history.replaceState(null, '', `/armory?member=${ownerId}`); shell(); } catch (error) { toast(error.message, true); }
  }
  if (event.target.id === 'json-file') {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 2097152) { toast('JSON 文件不能超过 2 MB。', true); return; }
    const target = $('#json-form textarea'); try { target.value = await file.text(); } catch { toast('无法读取文件，请重试。', true); }
  }
});
document.addEventListener('input', event => {
  if (event.target.name === 'character') {
    let name = event.target.value.trim(); try { if (name.startsWith('https://')) name = decodeURIComponent(new URL(name).pathname.split('/').filter(Boolean).at(-1)); } catch { return; }
    if (/^[\p{L}\p{N}_-]{1,30}$/u.test(name)) $('#official-json-link').href = `https://api.projectdiablo2.com/game/character/${encodeURIComponent(name)}`;
  }
});
document.addEventListener('click', event => {
  const button = event.target.closest('[data-share]'); if (!button || button.disabled || ownerId !== state.me.id || snapshot.mode !== state.me.mode) return;
  const item = snapshot.items.find(item => item.key === button.dataset.share); if (!item) return;
  const lines = [`公开 Armory 快照：${snapshot.name} · ${snapshot.mode}`, `位置：${item.group} / ${item.slot}`, `底材：${item.baseName}`, item.ethereal ? '无形' : '', item.sockets ? `${item.sockets} 孔` : '', ...item.properties, item.socketed.length ? `镶嵌：${item.socketed.map(s => s.name).join('、')}` : '', `官方数据时间：${fmt(snapshot.updatedAt)}`, '分享者需确认当前持有此物品，并在游戏中交付。'].filter(Boolean);
  try { sessionStorage.setItem('armory-gear-draft', JSON.stringify({ memberId: state.me.id, mode: snapshot.mode, name: item.name.slice(0, 80), category: item.category, description: lines.join('\n').slice(0, 1500) })); location.href = '/?share=armory'; }
  catch { toast('浏览器无法保存分享草稿，请允许本站存储后重试。', true); }
});
try {
  state = await api('/state'); const requested = Number(new URLSearchParams(location.search).get('member'));
  ownerId = state.members.some(m => m.id === requested) ? requested : state.me.id;
  snapshot = (await api(`/armory/${ownerId}`)).snapshot; shell();
} catch (error) { $('#armory-app').innerHTML = `<div class="empty"><h3>暂时无法加载角色装备</h3><p>${esc(error.message)}</p><a class="button" href="/">返回大厅</a></div>`; }
