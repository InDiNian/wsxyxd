/** The UI and calculation both consume these JSON contracts. No game rules are hardcoded. */
export function validateData(cards, traits) {
  if (!Array.isArray(cards) || !Array.isArray(traits)) throw new Error('卡牌与羁绊数据必须为数组。');
  for (const [items, label] of [[cards, '卡牌'], [traits, '羁绊']]) {
    const ids = new Set();
    for (const item of items) {
      if (!item.id || typeof item.id !== 'string' || !item.name || ids.has(item.id)) throw new Error(`${label}需要唯一 id 和名称。`);
      ids.add(item.id);
    }
  }
  const traitIds = new Set(traits.map(t => t.id));
  for (const card of cards) {
    if (!Array.isArray(card.traitIds) || card.traitIds.some(id => !traitIds.has(id))) throw new Error(`卡牌「${card.name}」引用了不存在的羁绊。`);
    if (card.cost != null && (!Number.isInteger(card.cost) || card.cost < 0)) throw new Error(`卡牌「${card.name}」费用无效。`);
    if (card.tier != null && (!Number.isInteger(card.tier) || card.tier < 1 || card.tier > 6)) throw new Error(`卡牌「${card.name}」等阶无效。`);
    if (card.skills != null && (!Array.isArray(card.skills) || card.skills.some(s => !s.name || !Array.isArray(s.levels) || s.levels.some(l => !Number.isInteger(l.level) || !l.description)))) throw new Error(`卡牌「${card.name}」技能数据无效。`);
  }
  for (const trait of traits) {
    if (trait.levels != null && (!Array.isArray(trait.levels) || trait.levels.some(l => !Number.isInteger(l.count) || l.count < 1 || typeof l.effect !== 'string'))) throw new Error(`羁绊「${trait.name}」档位无效。`);
  }
}

export function normalizeSelection(ids, cards) {
  const valid = new Set(cards.map(c => c.id));
  return [...new Set(Array.isArray(ids) ? ids.filter(id => valid.has(id)) : [])];
}

export function normalizeBuild(raw, cards, equipment = []) {
  const cardIds = normalizeSelection(raw?.cardIds || raw?.selected || [], cards);
  const allowed = new Set(equipment.filter(e => !e.consumable).map(e => e.id));
  const loadout = Object.fromEntries(cardIds.flatMap(id => {
    const slots = Array.isArray(raw?.loadout?.[id]) ? raw.loadout[id].slice(0, 2).map(e => allowed.has(e) ? e : null) : [];
    return slots.some(Boolean) ? [[id, slots]] : [];
  }));
  return { cardIds, loadout, eliteIds: normalizeSelection(raw?.eliteIds, cards).filter(id => cardIds.includes(id)), capacityExpanded: raw?.capacityExpanded === true };
}

export function squadCapacity(build) { return build?.capacityExpanded === true ? 9 : 8; }

export function equippedTraits(card, slots = [], equipment = []) {
  const items = (Array.isArray(slots) ? slots : []).slice(0, 2).map(id => equipment.find(e => e.id === id && !e.consumable)).filter(Boolean);
  const equipmentTraitIds = items.some(e => e.enablesPactConversion) ? [...new Set(items.map(e => e.conversionTraitId).filter(Boolean))] : [];
  return { traitIds: [...new Set([...card.traitIds, ...equipmentTraitIds])], equipmentTraitIds: equipmentTraitIds.filter(id => !card.traitIds.includes(id)), items };
}

export function calculateLineup(ids, cards, traits, options = {}) {
  const selected = new Set(normalizeSelection(ids, cards));
  const members = cards.filter(card => selected.has(card.id)).map(card => {
    const equipped = equippedTraits(card, options.loadout?.[card.id], options.equipment);
    const elite = options.eliteIds?.includes(card.id) || false;
    return { ...card, ...equipped, nativeTraitIds: card.traitIds, elite, traitIds: [...new Set([...equipped.traitIds, ...(elite ? traits.filter(t => t.countMode === 'elite').map(t => t.id) : [])])] };
  });
  // Harmony adds one activation count, once; it does not create another physical member.
  const coreBonus = Math.max(0, ...traits.filter(t => t.coreActivationBonus && members.filter(c => c.traitIds.includes(t.id)).length >= t.activationRequired).map(t => t.coreActivationBonus));
  const synergies = traits.map(trait => {
    const matching = members.filter(card => card.traitIds.includes(trait.id));
    const activationBonus = trait.category === 'core' && matching.length ? coreBonus : 0;
    const activationCount = matching.length + activationBonus;
    const levels = [...(trait.levels || [])].sort((a, b) => a.count - b.count);
    const inactive = trait.maxCount != null && matching.length > trait.maxCount;
    const evaluatedLevels = levels.map(l => ({ ...l, reached: !inactive && l.count <= (l.metric === 'members' ? matching.length : activationCount) }));
    const activeLevel = evaluatedLevels.filter(l => l.reached).at(-1) || null;
    return { ...trait, count: matching.length, activationCount, activationBonus, members: matching, levels: evaluatedLevels, activeLevel, isActive: !!activeLevel, inactive, nextLevel: evaluatedLevels.find(l => !l.reached) || null };
  }).filter(trait => trait.count > 0).sort((a, b) => b.count - a.count || traits.findIndex(t => t.id === a.id) - traits.findIndex(t => t.id === b.id));
  return { members, synergies, totalCost: members.reduce((sum, c) => sum + (c.cost || 0), 0) };
}

/** One progress model drives the numeric rows, segmented strip and tier marks. */
export function pactProgress(trait) {
  const levels = [...(trait.levels || [])].sort((a, b) => a.count - b.count);
  const valueFor = level => level.metric === 'members' ? trait.count : trait.activationCount ?? trait.count;
  const targetIndex = levels.findIndex(level => !level.reached || valueFor(level) === level.count);
  const index = targetIndex >= 0 ? targetIndex : Math.max(0, levels.length - 1);
  const target = levels[index] || { count: trait.activationRequired || 1, metric: 'members' };
  const value = valueFor(target) || 0;
  const previous = index > 0 ? levels[index - 1].count : 0;
  const segments = Math.max(1, target.count - previous);
  return {
    value, target: target.count, label: `${value}/${target.count}`,
    completed: trait.inactive ? 0 : levels.filter(level => level.reached).length,
    segments, filled: trait.inactive ? 0 : Math.max(0, Math.min(segments, value - previous)),
    inactive: trait.inactive === true,
  };
}

export function featureTags(card) {
  return [...new Set([...[card.modeFeature || '', card.eliteFeature || ''].join('\n').normalize('NFKC').matchAll(/<([^<>]+)>/g)].map(match => match[1].trim()).filter(Boolean))];
}

// Facet counts use the other active filters, without restricting the selected feature.
export function featureFacets(cards, filters = {}, traits = []) {
  const base = filterCards(cards, { ...filters, feature: '' }, traits);
  return { total: base.length, items: [...new Set(cards.flatMap(featureTags))].map(name => ({ name, count: base.filter(card => featureTags(card).includes(name)).length })) };
}

export function filterCards(cards, { query = '', cost = null, tier = null, profession = '', trait = '', classification = '', feature = '' } = {}, traits = []) {
  const normalize = text => String(text).normalize('NFKC').toLocaleLowerCase().replace(/[<>〈〉《》【】\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const needles = normalize(query).split(' ').filter(Boolean);
  const traitNames = new Map(traits.map(t => [t.id, [t.name, ...(t.aliases || [])].join(' ')]));
  return cards.filter(card => {
    const text = normalize([card.name, card.title || '', card.birthplace || '', card.description || '', card.modeFeature || '', card.eliteFeature || '', card.featureCategory || '', ...(card.factionPath || []), ...(card.skills || []).map(s => s.name), ...card.traitIds.map(id => traitNames.get(id) || '')].join(' '));
    return (cost === null || card.cost === cost) && (tier === null || card.tier === tier) && (!profession || card.profession === profession) && (!trait || card.traitIds.includes(trait)) && (!classification || card.corePact?.status === classification) && (!feature || featureTags(card).includes(feature)) && needles.every(needle => text.includes(needle));
  });
}
