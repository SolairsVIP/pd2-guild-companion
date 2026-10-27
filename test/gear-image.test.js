import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEquipmentPaste, statText, wrapCardText } from '../public/gear-image.js';

test('兼容 PD2 Trader 的游戏剪贴板格式，保留零值、负值及镶嵌物', () => {
  const item = { name: '测试戒指', type: 'Ring', quality: 'Rare', iLevel: 88, isEthereal: true, sockets: 1, stats: [{ stat_id: 105, name: '% Faster Cast Rate', value: 10 }, { stat_id: 0, name: 'to Strength', value: 0 }, { stat_id: 333, name: 'to Enemy Fire Resistance', value: -5 }, { stat_id: 360, name: 'Corrupted', value: 3 }], socketed: [{ name: 'Jah Rune', stats: [{ name: "Ignore Target's Defense" }] }] };
  const parsed = parseEquipmentPaste(JSON.stringify(item));
  assert.equal(parsed.name, '测试戒指'); assert.equal(parsed.category, '饰品'); assert.equal(parsed.source, 'pd2-clipboard');
  for (const text of ['10% Faster Cast Rate', '0 to Strength', '-5 to Enemy Fire Resistance', 'Corrupted', '无形', '孔数：1', 'Jah Rune', "Ignore Target's Defense"]) assert.ok(parsed.description.includes(text), text);
  assert.equal(parseEquipmentPaste(JSON.stringify({ ...item, isRuneword: true, runeword: 'Ice', type: 'Demon Crossbow' })).name, 'Ice');
  assert.equal(parseEquipmentPaste(JSON.stringify({ type:'Monarch', quality:'Normal', iLevel:80, stats:[] })).category, '防具');
});
test('触发词缀区分几率、技能等级和数值，不猜测数值含义', () => {
  assert.equal(statText({name:'Chance to cast',value:7,chance:20,level:32,skill:'Frost Nova'}), 'Chance to cast · 数值 7 · 触发几率 20% · 技能等级 32 · Frost Nova');
  assert.equal(statText({label:'+5% to Fire Skill Damage',name:'Fire Damage',value:5}), '+5% to Fire Skill Damage');
});
test('普通文字保留换行，无效或过大 JSON 不生成错误分享', () => {
  assert.deepEqual(parseEquipmentPaste('属性一\r\n属性二'), {name:'',category:'其他',description:'属性一\n属性二',source:'text'});
  for(const raw of ['{bad}', '[]', JSON.stringify({token:'private'}), JSON.stringify({type:'Ring',quality:'Rare',iLevel:88,stats:[]}), 'a'.repeat(65537)]) assert.throws(()=>parseEquipmentPaste(raw));
});
test('图片文字换行覆盖中文、长词、空行及 Unicode，不丢字符', () => {
  const value='长长长长长\n\n⚔️装备🛡abc';
  const lines=wrapCardText(value,t=>Array.from(t).length,3);
  assert.ok(lines.every(line=>Array.from(line).length<=3));
  assert.equal(lines.join('').replaceAll('\n',''), value.replaceAll('\n',''));
  assert.ok(lines.includes(''));
});
