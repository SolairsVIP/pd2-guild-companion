const clean = (value, limit = 1500) => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, limit) : '';
const qualities = new Set(['Normal', 'Superior', 'Magic', 'Rare', 'Set', 'Unique', 'Crafted', 'Runeword']);
const number = value => Number.isFinite(value) ? String(value) : '';

export function statText(stat) {
  if (!stat || typeof stat !== 'object') throw new Error('部分词缀格式无效，请检查原始数据。');
  if (typeof stat.label === 'string' && stat.label.trim()) return clean(stat.label, 400);
  const name = clean(stat.name, 300);
  if (!name) throw new Error('部分词缀缺少名称，请检查原始数据。');
  const value = number(stat.value);
  // Preserve the source wording and distinguish proc chance, skill level and actual value.
  if (stat.chance !== undefined || stat.level !== undefined || stat.skill !== undefined) {
    return [name, value && `数值 ${value}`, stat.chance !== undefined && `触发几率 ${number(stat.chance)}%`, stat.level !== undefined && `技能等级 ${number(stat.level)}`, clean(stat.skill, 100)].filter(Boolean).join(' · ');
  }
  if (!value || stat.stat_id === 360) return name;
  const leadingNumber = name.match(/^[+\-]?\d+(?:\.\d+)?/);
  if (leadingNumber && Number(leadingNumber[0]) === stat.value) return name;
  return `${value}${name.startsWith('%') ? '' : ' '}${name}`;
}

function categoryFor(type) {
  if (/ring|amulet|charm|jewel/i.test(type)) return '饰品';
  if (/helm|armor|armour|shield|glove|gauntlet|boot|belt|sash|monarch|bracer|greave|plate|robe|cap|circlet/i.test(type)) return '防具';
  if (/sword|bow|axe|spear|polearm|thresher|wand|staff|stave|claw|knife|dagger|mace|hammer|scepter|javelin|orb/i.test(type)) return '武器';
  if (/rune|gem/i.test(type)) return '符文 / 材料';
  if (/map/i.test(type)) return '地图';
  return '其他';
}

export function parseEquipmentPaste(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('请先复制装备，再粘贴到导入框。');
  if (raw.length > 65536) throw new Error('单件装备数据不能超过 64 KB。');
  const text = clean(raw, 65536);
  if (!/^[{\[]/.test(text)) {
    if (text.length > 1500) throw new Error('属性文本超过 1500 字，请精简后导入。');
    return { name: '', category: '其他', description: text, source: 'text' };
  }
  let item; try { item = JSON.parse(text); } catch { throw new Error('JSON 格式无效，请重新在游戏中指向装备按 Ctrl+C 复制完整数据。'); }
  if (!item || Array.isArray(item) || typeof item !== 'object' || !qualities.has(item.quality) || typeof item.type !== 'string' || !item.type.trim() || !Number.isInteger(item.iLevel) || item.iLevel < 1 || item.iLevel > 99 || (item.stats != null && !Array.isArray(item.stats))) throw new Error('这不是 PD2 游戏复制的单件装备 JSON。需要 quality、type、iLevel 和 stats 字段；角色整包数据请在角色装备页导入。');
  if ((item.stats?.length || 0) > 80 || (item.socketed?.length || 0) > 6) throw new Error('装备词缀或镶嵌物数量超出限制。');
  if (!item.stats?.length && !['Normal', 'Superior'].includes(item.quality)) throw new Error('这件装备没有词缀数据，请重新复制完整装备。');
  const name = clean(item.isRuneword && item.runeword ? item.runeword : item.name || item.type, 80);
  const stats = (item.stats || []).map(statText);
  const sockets = Number.isInteger(item.sockets) && item.sockets >= 0 && item.sockets <= 6 ? item.sockets : null;
  const lines = [
    `底材：${clean(item.type, 120)}`, `品质：${item.quality}`, `物品等级：${item.iLevel}`,
    Number.isFinite(item.defense) && `防御：${item.defense}`, item.isEthereal === true && '无形', sockets !== null && `孔数：${sockets}`, ...stats,
  ].filter(Boolean);
  if (item.socketed !== undefined && !Array.isArray(item.socketed)) throw new Error('镶嵌物格式无效。');
  for (const socket of item.socketed || []) {
    if (!socket || typeof socket !== 'object' || (socket.stats != null && !Array.isArray(socket.stats)) || (socket.stats?.length || 0) > 80) throw new Error('镶嵌物属性格式无效。');
    lines.push(`镶嵌：${clean(socket.name || socket.type, 120) || '未命名镶嵌物'}`);
    for (const stat of socket.stats || []) lines.push(`  ${statText(stat)}`);
  }
  const description = lines.join('\n');
  if (description.length > 1500) throw new Error('装备属性超过分享表单的 1500 字限制，请使用属性文本精简后导入。');
  return { name, category: categoryFor(item.type), description, source: 'pd2-clipboard' };
}

export function wrapCardText(text, measure, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of Array.from(paragraph)) {
      if (line && measure(line + char) > maxWidth) { lines.push(line); line = char; }
      else line += char;
    }
    lines.push(line);
  }
  return lines;
}

export function createGearCanvas({ name, category, description, mode, guild, author }) {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法生成图片。');
  const width = 720, padding = 52, font = '"Microsoft YaHei", "Segoe UI", sans-serif';
  ctx.font = `24px ${font}`;
  const lines = wrapCardText(clean(description), t => ctx.measureText(t).width, width - padding * 2);
  if (lines.length > 120) throw new Error('属性分行过多，请合并空行或精简至 120 行以内后生成图片。');
  ctx.font = `34px ${font}`;
  const titles = wrapCardText(clean(name, 80), t => ctx.measureText(t).width, width - padding * 2);
  ctx.font = `19px ${font}`;
  const credits = wrapCardText(`${clean(guild, 60)} · ${clean(author, 30)}`, t => ctx.measureText(t).width, width - padding * 2);
  const titleHeight = titles.length * 46, contentTop = 124 + titleHeight;
  const footerTop = contentTop + 45 + lines.length * 37 + 30;
  const height = Math.max(490, footerTop + 100 + credits.length * 28);
  // High density PNG; no remote image assets, so export works without cross-origin canvas access.
  canvas.width = width * 2; canvas.height = height * 2; ctx.scale(2, 2);
  ctx.fillStyle = '#10140f'; ctx.fillRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, '#353423'); gradient.addColorStop(1, '#11160f'); ctx.fillStyle = gradient; ctx.fillRect(12, 12, width - 24, height - 24);
  ctx.strokeStyle = '#9c8451'; ctx.lineWidth = 1; ctx.strokeRect(19, 19, width - 38, height - 38);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = `16px ${font}`; ctx.fillStyle = '#aaa689'; ctx.fillText('PD2 · 公会装备互助', width / 2, 49);
  ctx.font = `34px ${font}`; ctx.fillStyle = '#e0c182'; titles.forEach((t,i)=>ctx.fillText(t, width / 2, 92 + i * 46));
  ctx.font = `19px ${font}`; ctx.fillStyle = '#c4c6b2'; ctx.fillText(`${clean(mode, 30)}  ·  ${clean(category, 20)}`, width / 2, 100 + titleHeight);
  ctx.strokeStyle = '#635c3c'; ctx.beginPath(); ctx.moveTo(padding, contentTop + 15); ctx.lineTo(width - padding, contentTop + 15); ctx.stroke();
  ctx.font = `24px ${font}`; ctx.fillStyle = '#aebff0'; lines.forEach((t,i)=>ctx.fillText(t, width / 2, contentTop + 45 + i * 37));
  const footer = height - 87 - credits.length * 28;
  ctx.strokeStyle = '#635c3c'; ctx.beginPath(); ctx.moveTo(padding, footer - 20); ctx.lineTo(width - padding, footer - 20); ctx.stroke();
  ctx.font = `19px ${font}`; ctx.fillStyle = '#c4b794'; credits.forEach((t,i)=>ctx.fillText(t, width / 2, footer + i * 28));
  ctx.font = `16px ${font}`; ctx.fillStyle = '#949b87'; ctx.fillText('分享信息由玩家提供 · 请在游戏中确认物品与交付', width / 2, height - 65);
  return canvas;
}
