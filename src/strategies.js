export function filterStrategies(records, { query = '', usage = '', trait = '' } = {}) {
  const normalize = text => String(text).normalize('NFKC').toLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return records.filter(item => (!usage || item.usageTypes.includes(usage)) &&
    (!trait || item.traitIds.includes(trait)) &&
    words.every(word => normalize([item.name, item.initiator, item.effect, item.unlock, ...item.usageTypes].join(' ')).includes(word)));
}
