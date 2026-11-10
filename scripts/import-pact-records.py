#!/usr/bin/env python3
"""Import mode memberships, normal/elite features, pact rules and equipment from PRTS."""
import concurrent.futures
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache/prts'
URL = 'https://prts.wiki/w/' + quote('卫戍协议·规程/PRTS盟约记录')
HEADERS = {'User-Agent': 'LineupLabLocal/0.8 (local reference importer)', 'Referer': 'https://prts.wiki/'}


def fetch(url, path):
    if path.exists():
        return path.read_bytes()
    for attempt in range(3):
        try:
            response = requests.get(url, headers=HEADERS, timeout=(15, 45))
            response.raise_for_status()
            break
        except requests.RequestException:
            if attempt == 2:
                raise
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(response.content)
    return response.content


def clean(node):
    node = BeautifulSoup(str(node), 'lxml')
    for hidden in node.select('[style*="display:none"], [style*="display: none"], .reference, script, style, img'):
        hidden.decompose()
    for br in node.select('br'):
        br.replace_with('\n')
    for p in node.select('p'):
        p.insert_before('\n')
        p.insert_after('\n')
    lines = [re.sub(r'[ \t\r\f\v]+', ' ', line).strip() for line in node.get_text().splitlines()]
    result = []
    for line in lines:
        if line and (not result or line != result[-1]):
            result.append(line)
    return '\n'.join(result)


def section(soup, title, heading='h3'):
    start = soup.find(heading, id=title).parent
    for node in start.next_siblings:
        if getattr(node, 'name', None) == 'div' and 'mw-heading' in node.get('class', []):
            break
        if getattr(node, 'name', None) == 'table':
            yield node


def parse_pacts(soup, previous):
    traits = []
    for category, heading in [('core', '核心盟约'), ('additional', '附加盟约')]:
        for table in section(soup, heading):
            cells = table.find('tr').find_all('td', recursive=False)
            name = clean(cells[0])
            old = next(t for t in previous if t['name'] == name)
            activation = cells[1].find('div')
            minimum = int(re.search(r'\d+', clean(activation)).group())
            activation.decompose()
            description = clean(cells[1])
            matches = list(re.finditer(r'<在场\s*(\d+)\s*名[^>]*>', description))
            base = description[:matches[0].start()].strip() if matches else description
            levels = [{'count': minimum, 'effect': base, 'metric': 'activation'}] if base else []
            for index, match in enumerate(matches):
                count = int(match.group(1))
                effect = description[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(description)].strip()
                levels.append({'count': count, 'effect': effect, 'metric': 'members'})
            if not levels:
                raise ValueError(f'{name}: no activation rule')
            traits.append({k: old[k] for k in ['id', 'name', 'icon', 'aliases'] if k in old} | {
                'imageSourceUrl': cells[0].select_one('img')['src'] if cells[0].select_one('img') else None,
                'category': category, 'description': description, 'activationRequired': minimum,
                'levels': levels, 'maxCount': 1 if name == '独行' else None,
                'countMode': 'elite' if name == '绝技' else 'membership',
                'coreActivationBonus': 1 if name == '调和' else 0,
                'sourceUrl': URL + '#' + quote(heading), 'source': 'PRTS',
            })
    if len(traits) != 26:
        raise ValueError('Expected ten core and sixteen additional pacts.')
    return traits


def parse_operators(soup, cards, traits):
    table = soup.find('h2', id='干员数据库').parent.find_next_sibling('table')
    names = {t['name']: t['id'] for t in traits}
    updates, excluded = {}, []
    for group in [t for t in table.select('table') if not t.select('table')]:
        for row in group.select('tr')[2:]:
            cells = row.find_all('td', recursive=False)
            if len(cells) != 3 or not cells[0].select_one('a[title]'):
                continue
            name = cells[0].select_one('a[title]')['title']
            if name not in {c['name'] for c in cards}:
                excluded.append(name)
                continue
            pacts = clean(cells[1]).splitlines()
            unknown = [p for p in pacts if p not in names]
            if unknown:
                raise ValueError(f'{name}: unknown pacts {unknown}')
            badge = cells[2].find('div', recursive=False)
            category = clean(badge) if badge else ''
            if badge:
                badge.decompose()
            arrow = cells[2].select_one('.mdi-arrow-right')
            if arrow:
                arrow.replace_with('\n__ELITE__\n')
            features = clean(cells[2]).split('__ELITE__', 1)
            updates[name] = {'traitIds': [names[p] for p in pacts], 'modeFeature': features[0].strip(), 'eliteFeature': features[-1].strip(), 'featureCategory': category}
    missing = [c['name'] for c in cards if c['name'] not in updates]
    if missing:
        raise ValueError(f'Missing mode records: {missing}')
    return updates, excluded


def conversion_rules():
    data = json.loads((ROOT / 'data/equipment-conversions.json').read_text())
    return data['rules'], data['sourceUrl']


def conversion_for(name, rules):
    matches = [r for r in rules if name == r['equipmentName'] or (r['series'] and name.endswith(r['equipmentName']))]
    if len(matches) > 1:
        raise ValueError(f'{name}: ambiguous conversion rules')
    return matches[0]['traitId'] if matches else None


def parse_equipment(soup, traits):
    rules, source_url = conversion_rules()
    if any(r['traitId'] not in {t['id'] for t in traits} for r in rules):
        raise ValueError('Conversion rule refers to an unknown pact')
    equipment = []
    for table in soup.select('.sweep-item-card'):
        name = clean(table.select_one('.sweep-item-title-cell'))
        effect_cell = table.select_one('.sweep-item-effect-cell')
        for flavor in effect_cell.select('i'):
            flavor.decompose()
        effect = clean(effect_cell)
        tier = int(next(c for c in table['class'] if c.startswith('sweep-item-tier-')).rsplit('-', 1)[-1])
        img = table.select_one('.sweep-item-icon-cell img')
        ident = 'equipment-' + hashlib.sha256(name.encode()).hexdigest()[:12]
        equipment.append({
            'id': ident, 'name': name, 'tier': tier, 'price': int(clean(table.select_one('.sweep-item-price-cell'))),
            'effect': effect, 'consumable': '销毁' in effect,
            'capacityLimit': 9 if name == '人事部文档' else None,
            'enablesPactConversion': name == '变形同构体',
            'conversionTraitId': conversion_for(name, rules),
            'conversionSourceUrl': source_url if conversion_for(name, rules) else None,
            'sourceUrl': URL + '#' + quote(name), 'imageSourceUrl': img['src'] if img else None,
        })
    if not any(e['capacityLimit'] == 9 for e in equipment) or not any(e['enablesPactConversion'] for e in equipment):
        raise ValueError('Required capacity and conversion equipment missing.')
    return equipment


def image(equipment, directory='equipment'):
    if not equipment['imageSourceUrl']:
        return
    path = ROOT / 'assets' / directory / (equipment['id'] + '.webp')
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        raw = fetch(equipment['imageSourceUrl'], CACHE / (equipment['id'] + '.png'))
        img = Image.open(io.BytesIO(raw)).convert('RGBA')
        ImageOps.contain(img, (160, 160)).save(path, 'WEBP', quality=90, method=5)
    equipment['image'] = f'/assets/{directory}/' + path.name


def main():
    soup = BeautifulSoup(fetch(URL, CACHE / 'pact-records.html'), 'lxml')
    cards = json.loads((ROOT / 'data/cards.json').read_text())
    previous = json.loads((ROOT / 'data/traits.json').read_text())
    traits = parse_pacts(soup, previous)
    updates, excluded = parse_operators(soup, cards, traits)
    equipment = parse_equipment(soup, traits)
    image_warnings = []
    def import_image(item):
        try:
            image(item, 'pacts' if item.get('category') in ['core', 'additional'] else 'equipment')
        except Exception as error:
            image_warnings.append({'name': item['name'], 'error': str(error)})
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(import_image, [*equipment, *traits]))
    now = datetime.now(timezone.utc).isoformat()
    for card in cards:
        card.update(updates[card['name']])
        card['modeData'] = {'source': 'PRTS', 'status': 'complete', 'sourceUrl': URL + '#' + quote('干员数据库'), 'importedAt': now}
        core_ids = [i for i in card['traitIds'] if i.startswith('core-')]
        card['corePact'] = {'status': 'source', 'traitIds': core_ids, 'sourceUrl': card['modeData']['sourceUrl'], 'reason': '直接采用 PRTS 盟约记录中的模式归属。'}
    source = json.loads((ROOT / 'data/sources.json').read_text())
    for key in ['completedDraft', 'corePacts', 'additionalPacts', 'coreClassification', 'corePactClassification']:
        source.pop(key, None)
    source.update({'modeSourceUrl': URL, 'modeImportedAt': now, 'modeDataSource': 'PRTS', 'modeOperatorCount': len(cards), 'pactCount': len(traits), 'equipmentCount': len(equipment), 'excludedSpecialUnits': excluded, 'synergyStatus': 'source', 'equipmentRuleSourceUrl': conversion_rules()[1], 'squadRules': {'baseCapacity': 8, 'expandedCapacity': 9, 'equipmentSlots': 2}})
    for name, data in [('cards', cards), ('traits', traits), ('equipment', equipment), ('sources', source)]:
        (ROOT / f'data/{name}.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    core_report = {'source': 'PRTS', 'sourceUrl': URL, 'importedAt': now, 'operatorCount': len(cards), 'corePacts': [{'id': t['id'], 'name': t['name'], 'members': [c['name'] for c in cards if t['id'] in c['traitIds']]} for t in traits if t['category'] == 'core']}
    (ROOT / 'data/core-pacts.json').write_text(json.dumps(core_report, ensure_ascii=False, indent=2) + '\n')
    lines = ['# 核心盟约 · PRTS 模式记录', '', f'来源：{URL}', '', '全部归属直接来自模式记录，不使用出身地推断或手动覆盖。', '']
    for pact in core_report['corePacts']:
        lines.extend([f"## {pact['name']}（{len(pact['members'])} 位）", '', '、'.join(pact['members']), ''])
    (ROOT / 'docs/core-pacts.md').write_text('\n'.join(lines))
    report = {'importedAt': now, 'operators': len(cards), 'pacts': len(traits), 'equipment': len(equipment), 'conversionOptions': len([e for e in equipment if e['conversionTraitId']]), 'excludedSpecialUnits': excluded, 'imageWarnings': image_warnings}
    (ROOT / 'data/mode-import.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
