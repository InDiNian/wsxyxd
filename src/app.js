import { validateData, normalizeSelection, calculateLineup, filterCards, featureFacets, normalizeBuild, squadCapacity, pactProgress } from './domain.js';

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M12 5v15m0-15C9 2 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-2-9 1Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v2"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M10 8h4v8h-4Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
  leaf: '<path d="M20 3C6 2 1 10 7 17s15 0 13-14ZM4 21 16 9M9 16v-5m0 5h5"/>',
  waves: '<path d="M2 6c4-5 6 5 10 0s6 5 10 0M2 12c4-5 6 5 10 0s6 5 10 0M2 18c4-5 6 5 10 0s6 5 10 0"/>',
  flame: '<path d="M12 2c2 6 7 8 7 13a7 7 0 0 1-14 0c0-4 3-7 4-8 0 5 3 4 3-5Z"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/>',
  crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5m-5-10L7 17"/>',
  wand: '<path d="m4 20 12-12 4 4L8 24M14 10l4 4M6 3v4M4 5h4m12-4v4m-2-2h4"/>',
  swords: '<path d="m3 3 6 2 12 14-2 2L5 9ZM21 3l-6 2-3 4m-3 6-6 6m12-6 6-6V3M3 16l5 5m8-18 5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  mountain: '<path d="m2 20 7-13 4 6 3-9 6 16Zm4-7 3 1 2-3m3-1 2 1 2-1"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  anchor: '<circle cx="12" cy="5" r="3"/><path d="M12 8v13M7 11h10M3 14v4c3 0 4 3 9 3s6-3 9-3v-4M1 16l2-2 2 2m14 0 2-2 2 2"/>',
  music: '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14ZM13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.sparkles}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const storageKey = 'lineup-lab:v1';
let cards = [], traits = [], equipment = [], selected = [], view = 'builder', sourceInfo = {};
let loadout = {}, eliteIds = [], capacityExpanded = false, equipmentQuery = '';
const build = () => ({ cardIds: [...selected], loadout, eliteIds, capacityExpanded });
const lineupFor = (ids = selected, config = { loadout, eliteIds }) => calculateLineup(ids, cards, traits, { ...config, equipment });
const initialView = new URLSearchParams(location.search).get('view');
if (['builder', 'library', 'rules'].includes(initialView)) view = initialView;
if (initialView === 'editor') view = 'rules';
let filters = { query: '', tier: null, profession: '', trait: '', classification: '', feature: '' };
let currentSkill = 0, currentSkillLevel = 7;
const tierNames = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];
const professionIcons = { '先锋': 'flag', '近卫': 'swords', '重装': 'shield', '狙击': 'crosshair', '术师': 'wand', '医疗': 'plus', '辅助': 'sparkles', '特种': 'crosshair' };
const pactName = id => traits.find(t => t.id === id)?.name || id;
const coreTraits = () => traits.filter(t => t.category === 'core');
const additionalTraits = () => traits.filter(t => t.category === 'additional');
let toastTimer, dialogReturnFocus;
let storageAvailable = true;
const $ = selector => document.querySelector(selector);

function portrait(card, instance = 'card') {
  const path = instance === 'detail' && card.artImage ? card.artImage : card.image;
  if (path && /^(\/|\.\/|https?:\/\/)/.test(path)) return `<img class="portrait ${instance === 'detail' ? 'full-art' : 'operator-avatar'}" src="${escape(path)}" alt="${escape(card.name)}${instance === 'detail' ? '立绘' : '头像'}" loading="${instance === 'detail' ? 'eager' : 'lazy'}" />`;
  const id = `${instance}-${card.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const color = /^#[0-9a-f]{6}$/i.test(card.color || '') ? card.color : '#789b8a';
  const accessories = {
    archer: '<path d="M139 41Q203 104 145 178" fill="none" stroke="#f0e6bc" stroke-width="5"/><path d="m139 41 6 137m-27-72 52-7m-9-5 9 5-8 7" fill="none" stroke="#f0e6bc" stroke-width="2"/><path d="m68 69 14-36 10 33" fill="#e3e0d1"/><path d="m88 59 22-35-5 47" fill="#e3e0d1"/>',
    guardian: '<path d="m128 104 39 9v35q-5 26-39 40-31-17-35-40v-35Z" fill="#b9c1ba" stroke="#e4e2cd" stroke-width="2"/><path d="m128 118 23 6v23q-5 17-23 27-19-12-21-27v-23Z" fill="none" stroke="#e4e2cd" stroke-width="2"/><path d="m66 67 5-21 17 8 17-8 7 21" fill="#e2ded1"/>',
    mage: '<path d="m140 62-7 121" stroke="#d7cfac" stroke-width="5"/><path d="m141 34 15 23-17 23-15-24Z" fill="#e9edc7"/><path d="m140 43 7 14-8 12-7-13Z" fill="white" opacity=".6"/><path d="m58 74 29-48 32 52-29-12Z" fill="#d5d2d4"/><circle cx="141" cy="56" r="25" fill="none" stroke="white" opacity=".25"/>',
    fighter: '<path d="m139 37 14 8-17 112-13 9 1-17Z" fill="#e0e1dc"/><path d="m116 143 27 4" stroke="#e6cfa2" stroke-width="7"/><path d="m128 151-4 28" stroke="#4a4b50" stroke-width="6"/><path d="m62 78-5-24 20 9 14-24 9 24 20-10-5 29" fill="#e1d9c9"/>',
  };
  return `<svg class="portrait" viewBox="0 0 200 200" role="img" aria-label="${escape(card.name)}的占位插画"><defs><linearGradient id="bg-${id}" x2=".8" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#263f45"/></linearGradient><linearGradient id="cape-${id}" x2=".4" y2="1"><stop stop-color="#e6e3d9"/><stop offset="1" stop-color="${color}"/></linearGradient></defs><rect width="200" height="200" fill="url(#bg-${id})"/><circle cx="112" cy="62" r="58" fill="#f4eed6" opacity=".12"/><circle cx="112" cy="62" r="44" fill="none" stroke="#f4eed6" stroke-width=".7" opacity=".3"/><path d="M0 160 47 88l24 41 44-81 85 116v36H0" fill="#182f36" opacity=".15"/><path d="m16 200 35-74 37-27 37 22 42 79Z" fill="url(#cape-${id})"/><path d="m74 111-16 80 29-32 24 41 12-76-35-24Z" fill="#293f47"/><path d="m80 101 9 38 14-39" fill="#f0d7bd"/><ellipse cx="89" cy="83" rx="24" ry="29" fill="#e5cbb7"/><path d="M64 88q-12-45 24-44 34 0 28 45l-11-16-4-15-17 18-17-5Z" fill="#2f3c48"/><path d="m68 88-9 31 17-13m30-17 13 27-18-12" fill="#2f3c48"/><path d="m78 86 6 1m12 0 5-1" stroke="#53545b" stroke-width="2" stroke-linecap="round"/><path d="m86 97 7 1" stroke="#b99085" stroke-width="1.4" stroke-linecap="round"/>${accessories[card.archetype] || accessories.mage}<path d="m21 34 2 6 6 2-6 2-2 6-2-6-6-2 6-2m150 90 1 4 4 1-4 1-1 4-1-4-4-1 4-1" fill="#f2ebd2" opacity=".7"/><rect y="181" width="200" height="19" fill="#132d30" opacity=".08"/></svg>`;
}

function traitChip(id) {
  const trait = traits.find(t => t.id === id);
  return trait ? `<span class="trait-chip">${icon(trait.icon)}${escape(trait.name)}</span>` : '';
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200);
}

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ version: 3, selected, loadout, eliteIds, capacityExpanded })); return true; }
  catch { storageAvailable = false; return false; }
}

function readStorage() {
  try {
    const raw = localStorage.getItem(storageKey), data = JSON.parse(raw || '{}');
    if (raw && data.version !== 2 && data.version !== 3) { try { if (!localStorage.getItem(storageKey + ':before-equipment')) localStorage.setItem(storageKey + ':before-equipment', raw); } catch { storageAvailable = false; } }
    if (raw && data.version === 2) { try { if (!localStorage.getItem(storageKey + ':before-pact-overview')) localStorage.setItem(storageKey + ':before-pact-overview', raw); } catch { storageAvailable = false; } }
    const current = normalizeBuild(data, cards, equipment);
    selected = current.cardIds; loadout = current.loadout; eliteIds = current.eliteIds; capacityExpanded = current.capacityExpanded;

  } catch { storageAvailable = false; }
}

function shell() {
  $('#app').innerHTML = `
    <header class="site-header"><div class="header-inner">
      <a class="brand" href="#" aria-label="弈阵首页"><span class="brand-symbol"><svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="m18 3 13 7.5v15L18 33 5 25.5v-15Z" stroke="currentColor" stroke-width="1.5"/><path d="m18 10 7 4v8l-7 4-7-4v-8Z" fill="currentColor"/></svg></span><span class="brand-name">弈阵<span>LINEUP LAB</span></span></a>
      <nav class="desktop-nav" aria-label="主导航">${navButtons()}</nav>
      <span class="local-status"><i></i> 本地工作台</span>
    </div></header>
    <main id="main" class="page"></main>
    <footer class="site-footer"><span>弈阵 <span class="footer-dot">·</span> 让每一份羁绊恰到好处</span><span>LOCAL FIRST <span class="footer-dot">/</span> V 0.10</span></footer>
    <nav class="mobile-nav" aria-label="手机导航">${navButtons()}</nav>
    <dialog id="dialog" aria-label="详情"><div id="dialog-content"></div></dialog>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>`;
  $('#app').addEventListener('click', handleClick);
  $('#app').addEventListener('input', event => {
    if (event.target.id === 'search') { filters.query = event.target.value; renderCards(); renderFilterStatus(); }
    if (event.target.id === 'equipment-search') { equipmentQuery = event.target.value; renderEquipmentCatalog(); }
  });
  $('#app').addEventListener('change', event => {
    if (event.target.id === 'trait-filter') { filters.trait = event.target.value; renderCards(); renderFilterStatus(); }
    if (event.target.id === 'capacity-expanded') { setCapacity(event.target.checked); }
    if (event.target.matches('[data-equipment-slot], #member-elite, #conversion-preset')) { changeMemberEquipment(event.target); }
    if (event.target.id === 'profession-filter') { filters.profession = event.target.value; renderCards(); renderFilterStatus(); }
    if (event.target.id === 'skill-level') { currentSkillLevel = Number(event.target.value); renderSkillPanel($('#skill-panel').dataset.id); }
  });
  $('#dialog').addEventListener('click', event => { if (event.target === $('#dialog')) closeDialog(); });
  $('#dialog').addEventListener('close', () => { dialogReturnFocus?.focus(); });
  $('#app').addEventListener('error', event => {
    if (event.target.tagName === 'IMG') {
      const path = event.target.getAttribute('src');
      const card = cards.find(c => c.image === path || c.artImage === path);
      if (card) event.target.outerHTML = portrait({ ...card, image: card.artImage === path ? card.image : null, artImage: null }, 'fallback');
    }
  }, true);
}

function navButtons() {
  return [['builder', 'grid', '阵容搭配'], ['library', 'book', '卡牌图鉴'], ['rules', 'sparkles', '盟约与装备']].map(([id, image, label]) => `<button class="nav-item ${view === id ? 'active' : ''}" data-action="view" data-view="${id}" ${view === id ? 'aria-current="page"' : ''}>${icon(image)}<span>${label}</span></button>`).join('');
}

function renderPage() {
  document.querySelectorAll('.desktop-nav, .mobile-nav').forEach(nav => nav.innerHTML = navButtons());
  const headings = { builder: ['BUILD YOUR SYNERGY', '好阵容，从羁绊开始。', '挑选干员，搭配装备，实时查看小队盟约。'], library: ['OPERATOR ARCHIVE', '每一张卡，都值得了解。', '搜索干员、盟约和特质，找到你需要的搭配。'], rules: ['PACT & EQUIPMENT ARCHIVE', '让每一件装备，都有用武之地。', '查阅 PRTS 盟约规则、人数条件与装备效果。'] };
  const [eyebrow, title, subtitle] = headings[view];
  $('#main').innerHTML = `<div class="page-heading"><div><div class="eyebrow"><span></span>${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="demo-badge">${icon('book')}<div><strong>卫戍协议 · 规程</strong><span>PRTS 盟约记录</span></div></div></div>
    ${view === 'builder' ? `<div class="workspace"><section id="squad-panel" class="panel squad-panel" aria-label="已选小队"></section><section class="panel library-panel" aria-label="卡牌库">${libraryShell()}</section></div>` : view === 'library' ? `<section class="panel standalone-library" aria-label="卡牌图鉴">${libraryShell()}</section>` : referenceShell()}
    <div class="data-note">${icon('info')}<span>干员盟约、普通 / 精锐特质、盟约人数与装备效果来自 <a href="${escape(sourceInfo.modeSourceUrl)}" target="_blank" rel="noopener noreferrer">PRTS · 盟约记录 ↗</a>。点击盟约查看完整效果与条件。<br/>干员美术资源 © 鹰角网络 · 技能仍提供常规等级 4 / 7 参考资料。</span></div>`;
  renderDynamic();
  if (view === 'rules') renderEquipmentCatalog();
}

function libraryShell() {
  return `<div class="section-heading"><div class="section-title">${icon('book')}<h2>${view === 'library' ? '卡牌图鉴' : '卡牌库'}</h2><span class="count-label">${cards.length}</span></div><span class="section-hint">点击卡面查看详情</span></div>
    <div class="filters"><label class="search-field">${icon('search')}<input id="search" type="search" placeholder="搜索干员、盟约或特质" autocomplete="off" value="${escape(filters.query)}" aria-label="搜索干员、盟约、特质或技能，包括作战中等标签"/><kbd>/</kbd></label><label class="trait-select"><select id="profession-filter" aria-label="按职业筛选"><option value="">全部职业</option>${[...new Set(cards.map(c => c.profession).filter(Boolean))].map(p => `<option value="${escape(p)}" ${filters.profession === p ? 'selected' : ''}>${escape(p)}</option>`).join('')}</select>${icon('down')}</label>${traits.length ? `<label class="trait-select"><select id="trait-filter" aria-label="按核心或附加盟约筛选"><option value="">全部盟约</option>${[['core', '核心盟约'], ['additional', '附加盟约']].map(([category, label]) => `<optgroup label="${label}">${traits.filter(t => t.category === category).map(t => `<option value="${escape(t.id)}" ${!filters.classification && filters.trait === t.id ? 'selected' : ''}>${escape(t.name)}</option>`).join('')}</optgroup>`).join('')}</select>${icon('down')}</label>` : ''}</div>
    <div class="classification-banner"><span>${icon('info')}PRTS 模式盟约与特质 · Ⅰ—Ⅵ 阶</span><button data-action="classification">查看核心盟约 ${icon('chevron')}</button></div>
    <div class="cost-filter"><span>等阶</span><div role="group" aria-label="按等阶筛选"><button class="cost-button ${filters.tier === null ? 'active' : ''}" data-action="tier" data-tier="all" aria-pressed="${filters.tier === null}">全部</button>${[1, 2, 3, 4, 5, 6].map(tier => `<button class="cost-button ${filters.tier === tier ? 'active' : ''}" data-action="tier" data-tier="${tier}" aria-pressed="${filters.tier === tier}" aria-label="${tier}阶"><i class="cost-dot cost-${tier}"></i>${tier}</button>`).join('')}</div><span id="filter-status" class="filter-status"></span></div>
    <div id="feature-filters" class="feature-phase-filters" aria-label="按特质标签筛选"></div><div id="card-grid" class="card-grid"></div>`;
}

function renderDynamic() {
  const lineup = lineupFor();
  if ($('#squad-panel')) renderSquad(lineup);
  if ($('#card-grid')) { renderCards(); renderFilterStatus(); }
}

function renderSquad(lineup) {
  const capacity = squadCapacity(build()), over = selected.length > capacity;
  $('#squad-panel').innerHTML = `<div class="section-heading"><div class="section-title">${icon('users')}<h2>我的小队</h2><span class="count-label ${over ? 'over-capacity' : ''}">${selected.length} / ${capacity}</span></div><button class="text-button muted" data-action="clear" ${selected.length ? '' : 'disabled'}>${icon('trash')}清空</button></div>
    <div class="squad-options"><label class="capacity-option"><input id="capacity-expanded" type="checkbox" ${capacityExpanded ? 'checked' : ''}/><span>已使用「人事部文档」<small>人数上限 8 → 9</small></span></label><button class="text-button" data-action="equipment-info" data-id="${escape(equipment.find(e => e.capacityLimit)?.id)}">装备说明 ${icon('info')}</button></div>
    ${over ? `<p class="capacity-warning" role="status">这份旧阵容有 ${selected.length} 位成员，当前上限为 ${capacity} 人。请移除超出的成员以符合人数上限。</p>` : ''}
    ${compactPacts(lineup)}
    ${lineup.members.length ? `<div class="team-roster">${lineup.members.map(card => `<article class="selected-card squad-member"><button class="selected-portrait" data-action="details" data-id="${escape(card.id)}" aria-label="查看${escape(card.name)}详情">${portrait(card, 'selected')}</button><div class="member-label"><button data-action="details" data-id="${escape(card.id)}">${escape(card.name)}</button>${card.elite ? '<span class="elite-pill">精锐</span>' : ''}</div><button class="remove-card" data-action="remove" data-id="${escape(card.id)}" aria-label="移除${escape(card.name)}">${icon('close')}</button><button class="member-config" data-action="configure" data-id="${escape(card.id)}" aria-label="配置${escape(card.name)}的装备和精锐状态"><span class="member-gear-icons">${[0, 1].map(slot => { const e = equipment.find(e => e.id === loadout[card.id]?.[slot]); return `<span title="${escape(e?.name || '空装备位')}">${e ? equipmentIcon(e) : icon('plus')}</span>`; }).join('')}</span><span>${card.items.length ? '调整装备' : '配置装备'} ${icon('chevron')}</span></button>${card.equipmentTraitIds.length ? `<div class="member-extra-pacts">${card.equipmentTraitIds.map(id => `<span>＋${escape(pactName(id))}</span>`).join('')}</div>` : ''}</article>`).join('')}${lineup.members.length < capacity ? '<button class="team-add-more" data-action="browse">'+icon('plus')+'<span>添加干员</span></button>' : ''}</div>` : `<div class="squad-empty"><div class="empty-cards" aria-hidden="true"><span>${icon('sparkles')}</span><span>${icon('plus')}</span><span>${icon('leaf')}</span></div><h3>你的下一支小队，从这里开始</h3><p>选择下方干员，入队后可配置装备与精锐状态。</p><button class="text-button example-button" data-action="example">试试示例阵容 ${icon('arrow')}</button></div>`}
`;
}

function pactIcon(trait) {
  return trait.image ? `<img class="pact-icon-image" src="${escape(trait.image)}" alt="" loading="eager"/>` : icon(trait.icon);
}

function progressDescription(trait, progress) {
  return `${trait.name}，${progress.label}${trait.countMode === 'elite' ? ' 名精锐' : ' 人'}，${progress.inactive ? '多人独行，效果失效' : progress.completed ? `已达成第 ${progress.completed} 档` : '尚未激活'}${trait.activationBonus ? `，包含调和激活人数加成；实际 ${trait.count} 人` : ''}`;
}

function compactPacts(lineup) {
  const items = [...lineup.synergies].sort((a, b) => Number(b.isActive) - Number(a.isActive) || traits.findIndex(t => t.id === a.id) - traits.findIndex(t => t.id === b.id));
  return `<div class="compact-pacts" aria-label="小队盟约速览"><div class="compact-pacts-heading"><span>盟约速览</span><small>一杠一档 · 点击查看</small></div>${items.length ? `<ul class="compact-pact-list">${items.map(trait => {
    const progress = pactProgress(trait), description = progressDescription(trait, progress);
    return `<li><button class="compact-pact ${progress.completed ? 'is-active' : ''} ${progress.inactive ? 'is-inactive' : ''}" data-action="trait" data-id="${escape(trait.id)}" data-progress="${progress.label}" data-rank="${progress.completed}" title="${escape(description)}" aria-label="${escape(description)}"><span class="compact-pact-emblem"><span class="pact-tier-bars" aria-hidden="true">${Array.from({ length: progress.completed }, () => '<i></i>').join('')}</span>${pactIcon(trait)}</span><span class="compact-pact-segments" style="--segments:${progress.segments}" aria-hidden="true">${Array.from({ length: progress.segments }, (_, index) => `<i class="${index < progress.filled ? 'lit' : ''}"></i>`).join('')}</span></button></li>`;
  }).join('')}</ul>` : '<p class="compact-pact-empty">选择干员后，在这里查看盟约进度。</p>'}</div>`;
}

function cardPactMarkup(card) {
  return `<span class="trait-chip">${icon(professionIcons[card.profession])}${escape(card.profession)}</span>${card.traitIds.map(id => `<span class="card-pact ${id.startsWith('additional-') ? 'additional' : ''}">${traitChip(id)}</span>`).join('')}`;
}

function renderCards() {
  const filtered = filterCards(cards, filters, traits);
  const cardMarkup = card => {
    const added = selected.includes(card.id);
    return `<article class="hero-card ${added ? 'is-selected' : ''} cost-border-${card.tier ?? 0}"><button class="card-art" data-action="details" data-id="${escape(card.id)}" aria-label="查看${escape(card.name)}的特性和技能">${portrait(card)}<span class="card-art-shade"></span><span class="card-cost">${tierNames[card.tier]} 阶</span><span class="art-caption">${escape(card.branch || card.title)}</span>${added ? `<span class="selected-badge">${icon('check')}已入队</span>` : ''}</button><div class="card-info"><div class="card-title-row"><button class="card-name" data-action="details" data-id="${escape(card.id)}">${escape(card.name)}</button><button class="card-add ${added ? 'added' : ''}" data-action="toggle" data-id="${escape(card.id)}" aria-label="${added ? '移除' : '添加'}${escape(card.name)}" aria-pressed="${added}">${icon(added ? 'check' : 'plus')}</button></div><div class="card-traits">${cardPactMarkup(card)}</div><p class="card-feature-preview">${escape(card.modeFeature || '无额外特性')}</p></div></article>`;
  };
  $('#card-grid').innerHTML = filtered.length ? [1, 2, 3, 4, 5, 6].map(tier => {
    const group = filtered.filter(c => c.tier === tier);
    return group.length ? `<div class="tier-heading"><h3><i class="cost-dot cost-${tier}"></i>${tierNames[tier]} 阶 <span>${tier}阶干员</span></h3><span>${group.length} 位</span></div>${group.map(cardMarkup).join('')}` : '';
  }).join('') : `<div class="no-results">${icon('search')}<h3>没有匹配的干员</h3><p>换个关键词，或调整筛选条件。</p><button class="secondary-button" data-action="reset-filters">重置筛选</button></div>`;
}

function renderFeatureFilters() {
  const host = $('#feature-filters');
  if (!host) return;
  const facets = featureFacets(cards, filters, traits);
  host.innerHTML = `<span>特质</span>${[{ name: '', count: facets.total }, ...facets.items].map(item => `<button class="${filters.feature === item.name ? 'active' : ''}" data-action="feature-filter" data-feature="${escape(item.name)}" aria-pressed="${filters.feature === item.name}">${item.name ? escape(`<${item.name}>`) : '全部'}<span class="feature-facet-count">${item.count}</span></button>`).join('')}`;
}

function renderFilterStatus() {
  $('#filter-status').textContent = `${filterCards(cards, filters, traits).length} 张卡牌`;
  renderFeatureFilters();
}


function openDialog(content, label) {
  const dialog = $('#dialog');
  if (!dialog.open) dialogReturnFocus = document.activeElement;
  $('#dialog-content').innerHTML = content;
  dialog.setAttribute('aria-label', label);
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

function closeDialog() { $('#dialog').close(); }
const dialogClose = () => `<button class="dialog-close icon-button" data-action="close" aria-label="关闭弹窗">${icon('close')}</button>`;

function showCard(id) {
  const card = cards.find(c => c.id === id);
  if (!card) return;
  const added = selected.includes(id);
  currentSkill = 0;
  openDialog(`<div class="detail-hero operator-detail">${portrait(card, 'detail')}<div class="detail-hero-shade"></div>${dialogClose()}<div class="detail-heading"><span class="eyebrow">OPERATOR PROFILE <span class="detail-demo">${tierNames[card.tier]} 阶</span></span><h2>${escape(card.name)}</h2><p>${escape(card.title)}</p></div>${card.artImage ? `<button class="view-art" data-action="art" data-id="${escape(id)}">查看立绘 ${icon('arrow')}</button>` : ''}</div><div class="detail-body"><div class="operator-facts"><span>${icon(professionIcons[card.profession])}${escape(card.profession)}</span><span>${escape(card.branch)}</span>${card.faction ? `<span>${escape(card.faction)}</span>` : ''}</div><div class="mode-feature-section"><div class="pact-detail-heading"><h3>模式特质</h3><span class="classification-state">${escape(card.featureCategory)} · PRTS</span></div><div class="mode-feature-variants"><section><h4>普通</h4><p class="mode-feature-text">${escape(card.modeFeature)}</p></section><section><h4>精锐</h4><p class="mode-feature-text">${escape(card.eliteFeature)}</p></section></div></div><h3>职业特性 · PRTS</h3><p class="detail-description">${escape(card.description || '卡牌特性待补充。')}</p><div class="skill-section"><div class="skill-section-heading"><h3>干员技能</h3><span>常规技能参考</span></div><div id="skill-panel" data-id="${escape(id)}"></div></div>${corePactDetails(card)}${added ? `<button class="secondary-button full-width detail-config-button" data-action="configure" data-id="${escape(id)}">${icon('edit')}配置装备与精锐状态</button>` : ''}<a class="source-link" href="${escape(card.sourceUrl)}" target="_blank" rel="noopener noreferrer">资料来源：PRTS · ${escape(card.name)} ${icon('arrow')}</a><button class="primary-button full-width ${added ? 'remove-button' : ''}" data-action="detail-toggle" data-id="${escape(id)}">${icon(added ? 'close' : 'plus')}${added ? '从小队移除' : '加入我的小队'}</button></div>`, `${card.name}卡牌详情`);
  renderSkillPanel(id);
}

function renderSkillPanel(id) {
  const card = cards.find(c => c.id === id);
  const skills = card?.skills || [];
  if (!$('#skill-panel')) return;
  if (!skills.length) { $('#skill-panel').innerHTML = '<p class="detail-description">技能资料待补充。</p>'; return; }
  const skill = skills[currentSkill] || skills[0];
  const level = skill.levels.find(l => l.level === currentSkillLevel) || skill.levels.at(-1);
  $('#skill-panel').innerHTML = `<div class="skill-tabs" role="group" aria-label="选择技能">${skills.map((s, i) => `<button data-action="skill" data-index="${i}" data-id="${escape(id)}" class="${skill === s ? 'active' : ''}" aria-pressed="${skill === s}"><small>S${s.index}</small>${escape(s.name)}</button>`).join('')}</div><div class="skill-reference"><span>${escape(skill.activation)}</span><label><select id="skill-level" aria-label="技能参考等级">${skill.levels.map(l => `<option value="${l.level}" ${l === level ? 'selected' : ''}>等级 ${l.level}</option>`).join('')}</select>${icon('down')}</label></div><p class="skill-description">${escape(level.description)}</p><div class="skill-stats"><span>初始技力 <b>${escape(level.initialSp || '—')}</b></span><span>消耗技力 <b>${escape(level.spCost || '—')}</b></span><span>持续 <b>${escape(level.duration ? `${level.duration} 秒` : '—')}</b></span></div><p class="skill-footnote">展示干员常规技能，未指定本模式的携带技能。</p>`;
}

function showArt(id) {
  const card = cards.find(c => c.id === id);
  if (!card?.artImage) return;
  openDialog(`<div class="art-dialog">${dialogClose()}<img src="${escape(card.artImage)}" alt="${escape(card.name)}完整立绘"/><h2>${escape(card.name)} <small>默认立绘</small></h2><p>美术资源 © 鹰角网络 · 来源：PRTS</p><button class="secondary-button full-width" data-action="details" data-id="${escape(id)}">返回干员资料</button></div>`, `${card.name}完整立绘`);
}

function pactButtons(ids) {
  return `<div class="detail-traits">${ids.map(id => { const t = traits.find(t => t.id === id); return `<button data-action="trait" data-id="${escape(id)}">${icon(t.icon)}${escape(t.name)}${icon('chevron')}</button>`; }).join('')}</div>`;
}

function corePactDetails(card) {
  const core = card.traitIds.filter(id => id.startsWith('core-')), additional = card.traitIds.filter(id => id.startsWith('additional-'));
  return `<div class="pact-detail-heading"><h3>核心盟约</h3><span class="classification-state">PRTS 模式归属</span></div>${core.length ? pactButtons(core) : '<p class="pact-inference-note">无核心盟约</p>'}<div class="pact-detail-heading"><h3>附加盟约</h3></div>${additional.length ? pactButtons(additional) : '<p class="pact-inference-note">无附加盟约</p>'}<a class="source-link" href="${escape(card.modeData.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看 PRTS 模式记录 ${icon('arrow')}</a>`;
}

function relatedList(list, instance = 'related') {
  return `<div class="related-cards">${list.map(c => `<button data-action="details" data-id="${escape(c.id)}"><span>${portrait(c, instance)}</span><strong>${escape(c.name)}</strong><small>${selected.includes(c.id) ? '已入队' : `${c.tier} 阶`}</small>${icon('chevron')}</button>`).join('')}</div>`;
}

function showAdditionalCatalog() { showPactCatalog('additional'); }
function showClassification() { showPactCatalog('core'); }

function showPactCatalog(category) {
  const label = category === 'core' ? '核心盟约' : '附加盟约';
  openDialog(`<div class="classification-dialog additional-catalog">${dialogClose()}<div class="large-emblem">${icon('sparkles')}</div><span class="eyebrow">PRTS PACTS</span><h2>${label}</h2><p>直接采用 PRTS 模式记录。点击查看人数、效果和成员。</p><div class="additional-catalog-grid">${traits.filter(t => t.category === category).map(t => `<button data-action="trait" data-id="${escape(t.id)}"><span>${icon(t.icon)}</span><strong>${escape(t.name)}</strong><small>${t.activationRequired} 人激活${t.countMode === 'elite' ? ' · 按精锐计数' : ''}</small>${icon('chevron')}</button>`).join('')}</div></div>`, label);
}

function showTrait(id) {
  const trait = traits.find(t => t.id === id); if (!trait) return;
  const current = lineupFor().synergies.find(t => t.id === id);
  const related = cards.filter(c => trait.countMode === 'elite' || c.traitIds.includes(id));
  const converted = current?.members.filter(c => c.equipmentTraitIds.includes(id)) || [];
  openDialog(`<div class="trait-dialog">${dialogClose()}<div class="large-emblem">${icon(trait.icon)}</div><span class="eyebrow">PRTS · ${trait.category === 'core' ? 'CORE' : 'ADDITIONAL'} PACT</span><h2>${escape(trait.name)}<span>${current?.count || 0} ${trait.countMode === 'elite' ? '名精锐' : '人'}${current?.isActive ? ' · 已激活' : ''}</span></h2>${current?.activationBonus ? `<p class="pact-bonus-note">实际 ${current.count} 人 ＋ 调和 ${current.activationBonus}，激活人数 ${current.activationCount}。“不同干员”条件按实际人数判断。</p>` : ''}${current?.inactive ? '<p class="capacity-warning">场上有多名独行干员，独行效果失效。</p>' : ''}<h3>人数与效果</h3><div class="trait-levels">${trait.levels.map((l, index) => `<div class="trait-level ${current?.levels[index]?.reached ? 'reached' : ''}"><b>${l.count} ${trait.countMode === 'elite' ? '精锐' : '人'}</b><span>${escape(l.effect)}</span>${current?.levels[index]?.reached ? icon('check') : ''}</div>`).join('')}</div><details class="pact-full-rule"><summary>完整盟约说明与层数条件</summary><p>${escape(trait.description)}</p></details>${converted.length ? `<h3>装备新增成员 <small>${converted.length}</small></h3>${relatedList(converted, 'converted')}` : ''}<h3>${trait.countMode === 'elite' ? '可通过精锐状态计数' : '原生盟约成员'} <small>${related.length}</small></h3>${relatedList(related, 'pact')}<a class="source-link" href="${escape(trait.sourceUrl)}" target="_blank" rel="noopener noreferrer">PRTS 盟约规则 ${icon('arrow')}</a></div>`, `${trait.name}盟约详情`);
}

function equipmentIcon(item) {
  return item.image ? `<img src="${escape(item.image)}" alt="${escape(item.name)}" loading="lazy"/>` : icon('shield');
}

function showMemberEditor(id) {
  const card = cards.find(c => c.id === id);
  if (!card || !selected.includes(id)) return;
  const carried = equipment.filter(e => !e.consumable);
  const converter = carried.find(e => e.enablesPactConversion);
  const options = slot => `<option value="">空装备位</option>${[['同构装备', carried.filter(e => e.enablesPactConversion)], ['可与同构体搭配', carried.filter(e => e.conversionTraitId)], ['其他装备', carried.filter(e => !e.enablesPactConversion && !e.conversionTraitId)]].map(([label, items]) => `<optgroup label="${label}">${items.map(e => `<option value="${escape(e.id)}" ${loadout[id]?.[slot] === e.id ? 'selected' : ''}>${escape(e.name)}${e.conversionTraitId ? ` → ${escape(pactName(e.conversionTraitId))}` : ''}</option>`).join('')}</optgroup>`).join('')}`;
  openDialog(`<div class="member-editor" data-id="${escape(id)}">${dialogClose()}<div class="member-editor-heading"><span>${portrait(card, 'configuration')}</span><div><span class="eyebrow">EDIT SQUAD MEMBER</span><h2>${escape(card.name)}</h2><p>配置装备与精锐状态，盟约实时更新</p></div></div><label class="elite-option"><input id="member-elite" type="checkbox" ${eliteIds.includes(id) ? 'checked' : ''}/><span><strong>精锐干员</strong><small>参与「绝技」计数，并展示精锐特质</small></span></label><h3>装备组合</h3><p class="equipment-hint">「变形同构体」与指定装备一起携带，才会获得额外盟约。</p><label class="configuration-label" for="conversion-preset">快速选择同构组合</label><select id="conversion-preset"><option value="">自选装备 / 选择额外盟约</option>${carried.filter(e => e.conversionTraitId).map(e => `<option value="${escape(e.id)}">${escape(pactName(e.conversionTraitId))} · ${escape(e.name)}</option>`).join('')}</select><div class="member-equipment-slots">${[0, 1].map(slot => `<label for="equipment-slot-${slot}">装备 ${slot + 1}<select id="equipment-slot-${slot}" data-equipment-slot="${slot}">${options(slot)}</select></label>`).join('')}</div><div id="member-equipment-feedback" aria-live="polite"></div><div class="member-editor-actions"><button class="secondary-button" data-action="reset-equipment" data-id="${escape(id)}">卸下装备</button><button class="primary-button" data-action="close">完成配置 ${icon('check')}</button></div><p class="equipment-source-note">装备转化采用 PRTS 已列出的对应关系；同一干员已有的盟约不重复计数。人事部文档在小队中统一启用，不占装备位。</p><a class="source-link" href="${escape(converter?.sourceUrl || sourceInfo.modeSourceUrl)}" target="_blank" rel="noopener noreferrer">查看装备来源 ${icon('arrow')}</a></div>`, `${card.name}装备与精锐状态`);
  renderMemberFeedback(id);
}

function changeMemberEquipment(target) {
  const id = target.closest('.member-editor')?.dataset.id;
  if (!selected.includes(id)) return;
  if (target.id === 'member-elite') eliteIds = target.checked ? [...new Set([...eliteIds, id])] : eliteIds.filter(x => x !== id);
  else if (target.id === 'conversion-preset') {
    if (!target.value) return;
    loadout[id] = [equipment.find(e => e.enablesPactConversion).id, target.value];
    $('#equipment-slot-0').value = loadout[id][0]; $('#equipment-slot-1').value = loadout[id][1];
  } else {
    const slots = [...(loadout[id] || [null, null])]; slots[Number(target.dataset.equipmentSlot)] = target.value || null; loadout[id] = slots;
    $('#conversion-preset').value = '';
  }
  const normalized = normalizeBuild(build(), cards, equipment); loadout = normalized.loadout; eliteIds = normalized.eliteIds;
  if (!persist()) toast('当前配置暂留在页面，浏览器未能保存。');
  renderDynamic(); renderMemberFeedback(id);
}

function renderMemberFeedback(id) {
  const card = lineupFor().members.find(c => c.id === id);
  if (!card || !$('#member-equipment-feedback')) return;
  const hasConverter = card.items.some(e => e.enablesPactConversion);
  const duplicate = hasConverter && !card.equipmentTraitIds.length && card.items.some(e => e.conversionTraitId && card.nativeTraitIds.includes(e.conversionTraitId));
  $('#member-equipment-feedback').innerHTML = `<div class="equipment-result"><h3>当前盟约</h3><div class="detail-traits">${card.nativeTraitIds.map(id => `<span class="trait-chip">${escape(pactName(id))}</span>`).join('')}${card.equipmentTraitIds.map(id => `<span class="trait-chip equipment-granted">装备 ＋ ${escape(pactName(id))}</span>`).join('')}${card.elite ? '<span class="trait-chip equipment-granted">精锐 · 绝技</span>' : ''}</div><p>${card.equipmentTraitIds.length ? '装备新增盟约已计入小队。' : duplicate ? '已拥有该盟约，同一干员仍只计 1 人。' : hasConverter ? '请搭配一种 PRTS 已列出对应盟约的装备。' : '普通装备单独携带不会增加盟约。'}</p></div><section class="configured-feature"><h3>${card.elite ? '精锐' : '普通'}特质</h3><p>${escape(card.elite ? card.eliteFeature : card.modeFeature)}</p></section>`;
}

function referenceShell() {
  return `<div class="reference-sections">${[['core', '核心盟约'], ['additional', '附加盟约']].map(([category, label]) => `<section class="panel reference-panel"><div class="section-heading"><div class="section-title">${icon('sparkles')}<h2>${label}</h2><span class="count-label">${traits.filter(t => t.category === category).length}</span></div></div><div class="pact-reference-grid">${traits.filter(t => t.category === category).map(t => `<button class="pact-reference-card" data-action="trait" data-id="${escape(t.id)}"><span class="trait-emblem">${icon(t.icon)}</span><span><strong>${escape(t.name)}</strong><small>${t.activationRequired} ${t.countMode === 'elite' ? '名精锐' : '人'}激活${t.maxCount ? ' · 仅单人有效' : ''}</small></span>${icon('chevron')}</button>`).join('')}</div></section>`).join('')}<section class="panel reference-panel equipment-reference-panel"><div class="section-heading"><div class="section-title">${icon('shield')}<h2>装备资料</h2><span class="count-label">${equipment.length}</span></div><span class="section-hint">点击查看效果</span></div><label class="search-field equipment-search">${icon('search')}<input id="equipment-search" type="search" placeholder="搜索装备、效果或转化盟约" aria-label="搜索装备资料" value="${escape(equipmentQuery)}"/></label><div id="equipment-catalog" class="equipment-catalog"></div></section></div>`;
}

function renderEquipmentCatalog() {
  if (!$('#equipment-catalog')) return;
  const q = equipmentQuery.trim().normalize('NFKC').toLowerCase();
  const visible = equipment.filter(e => [e.name, e.effect, e.conversionTraitId ? pactName(e.conversionTraitId) : ''].join(' ').normalize('NFKC').toLowerCase().includes(q));
  $('#equipment-catalog').innerHTML = visible.length ? visible.map(e => `<button class="equipment-reference-card" data-action="equipment-info" data-id="${escape(e.id)}"><span class="equipment-art">${equipmentIcon(e)}</span><span class="equipment-reference-copy"><strong>${escape(e.name)}</strong><small>${e.tier} 阶 · ${e.price} 资金</small><span>${e.capacityLimit ? '小队上限 → 9 人' : e.enablesPactConversion ? '搭配装备，获得额外盟约' : e.conversionTraitId ? `与同构体搭配 → ${escape(pactName(e.conversionTraitId))}` : e.consumable ? '消耗型装备' : '携带装备'}</span></span>${icon('chevron')}</button>`).join('') : '<p class="pact-stat-empty">没有匹配的装备</p>';
}

function showEquipment(id) {
  const e = equipment.find(e => e.id === id); if (!e) return;
  openDialog(`<div class="equipment-dialog">${dialogClose()}<div class="equipment-detail-art">${equipmentIcon(e)}</div><span class="eyebrow">PRTS EQUIPMENT · ${e.tier} 阶</span><h2>${escape(e.name)}</h2><p class="equipment-effect">${escape(e.effect)}</p>${e.conversionTraitId ? `<p class="pact-bonus-note">与「变形同构体」同时携带时，额外获得【${escape(pactName(e.conversionTraitId))}】；单独携带不增加盟约。</p>` : ''}${e.enablesPactConversion ? `<h3>PRTS 已列出的搭配</h3><div class="equipment-conversion-list">${equipment.filter(x => x.conversionTraitId).map(x => `<span>${escape(x.name)} <b>→ ${escape(pactName(x.conversionTraitId))}</b></span>`).join('')}</div>` : ''}${e.capacityLimit ? `<button class="primary-button full-width" data-action="apply-capacity">${icon('users')}${capacityExpanded ? '已启用 9 人上限，返回小队' : '使用人事部文档 · 上限变为 9 人'}</button>` : ''}<a class="source-link" href="${escape(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">PRTS 装备资料 ${icon('arrow')}</a>${e.conversionSourceUrl ? `<a class="source-link" href="${escape(e.conversionSourceUrl)}" target="_blank" rel="noopener noreferrer">PRTS 同构对应关系 ${icon('arrow')}</a>` : ''}</div>`, `${e.name}装备资料`);
}


function updateSelection(next) {
  const ids = normalizeSelection(next, cards), limit = squadCapacity(build());
  if (ids.length > limit && ids.length > selected.length) { toast(`小队已达 ${limit} 人上限${capacityExpanded ? '' : '，使用「人事部文档」可扩展至 9 人'}`); return false; }
  const normalized = normalizeBuild({ ...build(), cardIds: ids }, cards, equipment);
  selected = normalized.cardIds; loadout = normalized.loadout; eliteIds = normalized.eliteIds;
  const success = persist(); renderDynamic();
  if (!success) toast('浏览器未能保存，刷新后可能丢失；当前编辑仍保留在页面。');
  return true;
}

function setCapacity(expanded) {
  if (!expanded && selected.length > 8) { $('#capacity-expanded').checked = true; toast('先将小队调整为 8 人，再取消人事部文档效果。'); return; }
  capacityExpanded = expanded; persist(); renderDynamic();
  toast(expanded ? '已使用人事部文档：小队上限 9 人' : '已恢复基础人数上限：8 人');
}

function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const { action, id } = button.dataset;
  if (action === 'view') { view = button.dataset.view; history.replaceState(null, '', view === 'builder' ? '/' : `/?view=${view}`); renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  if (action === 'toggle' || action === 'detail-toggle') {
    const changed = updateSelection(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
    if (action === 'detail-toggle' && changed) showCard(id);
    else $(`.hero-card [data-action="toggle"][data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }
  if (action === 'remove') updateSelection(selected.filter(x => x !== id));
  if (action === 'clear') { updateSelection([]); toast('已清空当前小队'); }
  if (action === 'example') { updateSelection([cards[0], cards[1], cards[4], cards[5]].filter(Boolean).map(c => c.id)); toast(`已载入 ${selected.length} 人示例阵容，可以继续自由搭配`); }
  if (action === 'browse') { $('#search')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#search')?.focus({ preventScroll: true }); }
  if (action === 'feature-filter') { filters.feature = button.dataset.feature; renderCards(); renderFilterStatus(); $(`[data-action="feature-filter"][data-feature="${CSS.escape(filters.feature)}"]`)?.focus({ preventScroll: true }); }
  if (action === 'configure') showMemberEditor(id);
  if (action === 'equipment-info') showEquipment(id);
  if (action === 'reset-equipment') { loadout[id] = []; persist(); renderDynamic(); showMemberEditor(id); }
  if (action === 'apply-capacity') { capacityExpanded = true; persist(); closeDialog(); view = 'builder'; history.replaceState(null, '', '/'); renderPage(); toast('已使用人事部文档：小队上限 9 人'); }
  if (action === 'details') showCard(id);
  if (action === 'trait') showTrait(id);
  if (action === 'close') closeDialog();
  if (action === 'art') showArt(id);
  if (action === 'classification') showClassification();
  if (action === 'additional-catalog') showAdditionalCatalog();
  if (action === 'skill') { currentSkill = Number(button.dataset.index); renderSkillPanel(id); $(`.skill-tabs [data-index="${currentSkill}"]`)?.focus({ preventScroll: true }); }
  if (action === 'tier') {
    filters.tier = button.dataset.tier === 'all' ? null : Number(button.dataset.tier);
    document.querySelectorAll('[data-action="tier"]').forEach(b => { const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    renderCards(); renderFilterStatus();
  }
  if (action === 'reset-filters') { filters = { query: '', tier: null, profession: '', trait: '', classification: '', feature: '' }; renderPage(); $('#search')?.focus(); }

}

async function init() {
  try {
    const responses = await Promise.all([fetch('/data/cards.json'), fetch('/data/traits.json'), fetch('/data/sources.json'), fetch('/data/equipment.json')]);
    if (responses.some(r => !r.ok)) throw new Error('卡牌数据加载失败，请检查 data 目录。');
    [cards, traits, sourceInfo, equipment] = await Promise.all(responses.map(r => r.json()));
    validateData(cards, traits);
    readStorage(); shell(); renderPage();
    document.addEventListener('keydown', event => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !$('#dialog').open && !event.ctrlKey && !event.metaKey) { event.preventDefault(); $('#search')?.focus(); }
    });
    window.addEventListener('storage', event => {
      if (event.key === storageKey || event.key === null) { readStorage(); renderDynamic(); }
    });
  } catch (error) {
    $('#app').innerHTML = `<main class="load-error"><div class="large-emblem">${icon('info')}</div><h1>暂时无法加载卡牌</h1><p>${escape(error.message)}</p><button class="primary-button" onclick="location.reload()">重新加载</button></main>`;
  }
}
init();
