import { createHash } from 'node:crypto';

const classNames = { Amazon: '亚马逊', Assassin: '刺客', Barbarian: '野蛮人', Druid: '德鲁伊', Paladin: '圣骑士', Necromancer: '死灵法师', Sorceress: '法师' };
const slots = { Helm: '头盔', Amulet: '项链', Armor: '护甲', 'Right Hand': '主手', 'Left Hand': '副手', 'Right Ring': '戒指 1', 'Left Ring': '戒指 2', Belt: '腰带', Boots: '鞋子', Gloves: '手套', 'Right Hand Switch': '备用主手', 'Left Hand Switch': '备用副手' };
const error = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (v, max = 180) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const labels = item => {
  const properties = Array.isArray(item.properties) ? item.properties.filter(v => typeof v === 'string' && v.trim()) : [];
  return (properties.length ? properties : Array.isArray(item.modifiers) ? item.modifiers.map(m => m?.label).filter(v => typeof v === 'string') : []).slice(0, 80).map(v => text(v, 400));
};

export function parseCharacterInput(input) {
  if (typeof input !== 'string' || input.length > 300) error(400, '请输入角色名或官方角色链接。');
  let name = input.trim();
  if (/^https?:/i.test(name)) {
    let url; try { url = new URL(name); } catch { error(400, '角色链接格式无效。'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) error(400, '请使用不含参数的官方 HTTPS 角色链接。');
    const match = ['projectdiablo2.com', 'www.projectdiablo2.com'].includes(url.hostname) ? url.pathname.match(/^\/character\/([^/]+)\/?$/) : url.hostname === 'api.projectdiablo2.com' ? url.pathname.match(/^\/game\/character\/([^/]+)\/?$/) : null;
    if (!match) error(400, '请使用 /character/角色名 链接；账号 Armory 页需要登录，不能直接导入。');
    try { name = decodeURIComponent(match[1]); } catch { error(400, '角色名编码无效。'); }
  }
  if (!/^[\p{L}\p{N}_-]{1,30}$/u.test(name)) error(400, '角色名只支持 1–30 位字母、数字、下划线或短横线。');
  return name;
}

function normalizeItem(item, scope, index) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) error(400, '装备数据格式无效。');
  const name = text(item.name || item.runeword?.name || item.base?.name);
  if (!name) error(400, '部分物品缺少名称，暂时无法导入。');
  const equipped = item.location?.zone === 'Equipped' || item.location?.zone_id === 1;
  const storage = text(item.location?.storage);
  const group = scope === 'mercenary' ? '佣兵' : equipped ? '穿戴装备' : storage === 'Inventory' ? '背包' : storage === 'Stash' ? '个人仓库' : storage === 'Cube' ? '方块' : '其他位置';
  const baseType = text(item.base?.type);
  const category = item.category === 'weapon' ? '武器' : ['Ring', 'Amulet', 'Small Charm', 'Medium Charm', 'Large Charm', 'Jewel'].includes(baseType) ? '饰品' : item.category === 'armor' ? '防具' : /rune|gem/i.test(baseType) ? '符文 / 材料' : /map/i.test(baseType) ? '地图' : '其他';
  const identity = `${scope}:${item.id ?? item.hash ?? name}:${index}`;
  return {
    key: createHash('sha256').update(identity).digest('hex').slice(0, 24), name,
    baseName: text(item.base?.name), quality: text(item.quality?.name), category, group,
    slot: equipped ? slots[item.location?.equipment] || text(item.location?.equipment) || '穿戴位置未知' : group,
    ethereal: item.is_ethereal === true, corrupted: item.corrupted === true, desecrated: item.desecrated === true,
    sockets: Number.isInteger(item.socket_count) && item.socket_count >= 0 && item.socket_count <= 6 ? item.socket_count : 0,
    properties: labels(item), socketed: (Array.isArray(item.socketed) ? item.socketed : []).slice(0, 6).map(s => ({ name: text(s?.name || s?.base?.name) || '镶嵌物', properties: s && typeof s === 'object' ? labels(s) : [] })),
    requiredLevel: Number.isInteger(item.requirements?.level) ? item.requirements.level : null,
    itemLevel: Number.isInteger(item.item_level) ? item.item_level : null,
    defense: Number.isFinite(item.defense?.total) ? item.defense.total : null,
  };
}

export function normalizeArmory(data, { source = 'json', now = Date.now(), requestedName } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) error(400, '请导入官方角色接口返回的 JSON 对象。');
  const c = data.character;
  if (!c || !Number.isInteger(c.level) || c.level < 1 || c.level > 99 || !classNames[c.class?.name] || typeof c.status?.is_hardcore !== 'boolean' || typeof c.status?.is_ladder !== 'boolean' || !Array.isArray(data.items)) error(400, '角色 JSON 缺少职业、等级、模式或物品列表。请使用官方 /game/character/角色名 数据。');
  const name = parseCharacterInput(c.name);
  if (requestedName && name.toLowerCase() !== requestedName.toLowerCase()) error(502, '官方接口返回的角色名与请求不一致，未保存。');
  const mercItems = data.mercenary?.items ?? [];
  if (!Array.isArray(mercItems) || data.items.length + mercItems.length > 1000) error(400, '物品列表格式无效或超过 1000 件。');
  const updated = Number(data.file?.updated_at);
  return {
    name, className: classNames[c.class.name], level: c.level,
    mode: `${c.status.is_hardcore ? 'HC' : 'SC'} ${c.status.is_ladder ? '天梯' : '非天梯'}`,
    source, importedAt: now, updatedAt: Number.isFinite(updated) && updated > 0 && updated * 1000 <= now + 86400000 ? updated * 1000 : null,
    sourceUrl: `https://api.projectdiablo2.com/game/character/${encodeURIComponent(name)}`,
    armoryUrl: `https://projectdiablo2.com/character/${encodeURIComponent(name)}`,
    // Only display fields are stored; account, guild, gold and unrelated fields are dropped.
    items: [...data.items.map((item, i) => normalizeItem(item, 'character', i)), ...mercItems.map((item, i) => normalizeItem(item, 'mercenary', i))],
  };
}

export function createArmoryReader({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  return async name => {
    const key = name.toLowerCase(), cached = cache.get(key);
    if (cached && now() - cached.at < 300000) return cached.data;
    let response;
    try { response = await fetchImpl(`https://api.projectdiablo2.com/game/character/${encodeURIComponent(name)}`, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
    catch { error(502, '暂时无法连接 PD2 官方接口。可稍后重试，或打开官方数据链接复制 JSON 导入。'); }
    if (response.status === 404) error(404, '官方接口未找到该角色，请检查角色名。');
    if ([401, 403].includes(response.status)) error(502, '官方接口拒绝访问。请使用自己能打开的官方 JSON 手动导入，不要提交登录凭证。');
    if (response.status === 429) error(503, 'PD2 官方接口请求过多，请稍后重试。');
    if (!response.ok) error(502, 'PD2 官方接口暂时不可用，请稍后重试。');
    let chunks = [], length = 0;
    try { for await (const chunk of response.body) { length += chunk.length; if (length > 2097152) error(502, '官方返回数据过大，未导入。'); chunks.push(chunk); } }
    catch (e) { if (e.status) throw e; error(502, '读取官方数据中断，请稍后重试。'); }
    let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { error(502, '官方返回的不是有效角色 JSON，未导入。'); }
    normalizeArmory(data, { requestedName: name });
    for (const [k, v] of cache) if (now() - v.at >= 300000) cache.delete(k);
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { at: now(), data }); return data;
  };
}
