export const equipmentSlots = [
  ['头盔', 'helm'], ['项链', 'amulet'], ['主手', 'weapon'], ['护甲', 'armor'], ['副手', 'offhand'],
  ['手套', 'gloves'], ['戒指 1', 'ring-one'], ['腰带', 'belt'], ['戒指 2', 'ring-two'], ['鞋子', 'boots'],
];

export const equippedItems = items => items.filter(item => ['穿戴装备', '佣兵'].includes(item.group));
export function itemsInSlots(items, scope, weaponSet = 1) {
  return equipmentSlots.map(([slot, position]) => ({ slot, position, item: items.find(item => item.group === scope && item.slot === (scope === '穿戴装备' && weaponSet === 2 && ['主手', '副手'].includes(slot) ? `备用${slot}` : slot)) }));
}

// Images verified on the official character equipment page. Unknown items use a labelled slot icon.
const namedImages = {
  "Arkaine's Valor": ['Balrog Skin', 'arkaines'],
  "Merman's Sprocket": ['Wyrmhide Boots', 'mermansprockets'],
  "Nightwing's Veil": ['Spired Helm', 'invghm'],
  Snowclash: ['Battle Belt', 'invtbl'],
  'Frozen Sorrow': ['War Bolts', 'invcqv_cold'],
  "Bul-Kathos' Wedding Band": ['Ring', 'invrin4'],
  'Wisp Projector': ['Ring', 'invrin3'],
  "Mara's Kaleidoscope": ['Amulet', 'invamu3'],
};
const baseImages = { 'Demon Crossbow': 'invrxb', 'Heavy Bracers': 'invmgl', 'Crystal Sword': 'invcrs', Monarch: 'invkit', Thresher: 'invscy', 'Battle Gauntlets': 'invtgl', Demonhead: 'invmsk', 'Sacred Armor': 'invaar', 'Demonhide Sash': 'invlbl', 'Scarabshell Boots': 'invvbt' };
export function itemImage(item) {
  const named = namedImages[item.name];
  const file = named?.[0] === item.baseName ? named[1] : baseImages[item.baseName];
  return file ? `https://projectdiablo2.com/image/items/${file}.png` : null;
}
