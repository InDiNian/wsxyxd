#!/usr/bin/env python3
"""Import the 1–6 tier default roster and factual operator reference data from PRTS.

Requires requests, beautifulsoup4 and Pillow. Responses are cached; the importer never
executes scripts from wiki pages. See data/sources.json for the captured provenance.
"""
import concurrent.futures
import hashlib
import io
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urljoin

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache' / 'prts'
ASSETS = ROOT / 'assets' / 'operators'
ROSTER_URL = 'https://prts.wiki/w/' + quote('卫戍协议·规程')
ROMANS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ']
HEADERS = {'User-Agent': 'LineupLabLocal/0.2 (personal local reference importer)', 'Referer': 'https://prts.wiki/'}
CACHE.mkdir(parents=True, exist_ok=True)
ASSETS.mkdir(parents=True, exist_ok=True)


def fetch(url, target):
    if target.exists():
        return target.read_bytes()
    for attempt in range(3):
        try:
            response = requests.get(url, headers=HEADERS, timeout=(10, 45))
            response.raise_for_status()
            target.write_bytes(response.content)
            return response.content
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(1 + attempt * 2)


def text(node):
    if node is None:
        return ''
    clone = BeautifulSoup(str(node), 'html.parser')
    for hidden in clone.select('[style*="display:none"], [style*="display: none"], .reference, script, style'):
        hidden.decompose()
    for br in clone.select('br'):
        br.replace_with('\n')
    return re.sub(r'[ \t\r\f\v]+', ' ', clone.get_text()).strip()


def media_url(filename):
    filename = filename.replace(' ', '_')
    digest = hashlib.md5(filename.encode()).hexdigest()
    return f'https://media.prts.wiki/{digest[0]}/{digest[:2]}/{quote(filename)}'


def roster():
    soup = BeautifulSoup(fetch(ROSTER_URL, CACHE / 'roster.html').decode(), 'html.parser')
    tables = [t for t in soup.select('table') if '参战干员一览' in t.get_text()]
    table = next(t for t in tables if not t.select('img'))
    avatars = {}
    for link in tables[0].select('a[title]'):
        image = link.select_one('img#charicon')
        if image:
            avatars[link['title']] = image['src']
    result, tier = [], 0
    for row in table.select('tr'):
        cells = row.find_all(['td', 'th'], recursive=False)
        if cells and cells[0].get_text(strip=True) in ROMANS:
            tier = ROMANS.index(cells[0].get_text(strip=True)) + 1
        # Blue rows are prototype replacements, not the requested default roster.
        if not 1 <= tier <= 6 or '#27c8' in row.get('style', ''):
            continue
        for link in row.select('a[title]'):
            name = link.get_text(strip=True)
            result.append({'name': name, 'tier': tier, 'sourceUrl': urljoin(ROSTER_URL, link['href']), 'avatarUrl': avatars.get(link['title'])})
    if len(result) != len({c['name'] for c in result}) or not all(any(c['tier'] == tier for c in result) for tier in range(1, 7)):
        raise ValueError('The source roster structure changed; inspect before importing.')
    return result


def parse_lore(soup):
    birthplace = ''
    for node in soup.find_all(string=lambda value: value and '【出身地】' in value):
        match = re.search(r'【出身地】\s*([^\n【]+)', node)
        if match:
            birthplace = match.group(1).strip()
            break
    factions, hidden = [], []
    heading = soup.find(id='属性')
    table = heading.find_next('table') if heading else None
    if table:
        for row in table.select('tr'):
            cells = row.find_all(['td', 'th'], recursive=False)
            if len(cells) < 2:
                continue
            label = text(cells[0])
            values = [text(link) for link in cells[1].select('a') if text(link)]
            if label.startswith('所属势力'):
                factions = list(dict.fromkeys(values))
            elif label.startswith('隐藏势力'):
                hidden = list(dict.fromkeys(values))
    return {'birthplace': birthplace, 'factionPath': factions, 'hiddenFactions': hidden}


def parse_operator(soup):
    scripts = '\n'.join(s.get_text() for s in soup.select('script') if 'var char_info' in s.get_text())
    info = scripts.split('var char_info=', 1)[-1].split('//语音范围限制', 1)[0]

    def field(key):
        match = re.search(r'"' + key + r'"\s*:\s*"([^"\n]*)"', info)
        return match.group(1) if match else ''

    heading = soup.find(id='特性')
    trait_table = heading.find_next('table') if heading else None
    trait_cells = trait_table.select('tr')[1].find_all('td', recursive=False) if trait_table else []
    description = text(trait_cells[1]) if len(trait_cells) > 1 else ''
    skills = []
    heading = soup.find(id='技能')
    if heading:
        for sibling in heading.parent.next_siblings:
            if getattr(sibling, 'name', None) is None:
                continue
            if sibling.select_one('h2') or sibling.name == 'h2':
                break
            if sibling.name != 'table' or 'nodesktop' in sibling.get('class', []):
                continue
            name_node = sibling.select_one('big')
            if not name_node:
                continue
            name = text(name_node)
            if any(s['name'] == name for s in skills):
                continue
            rows = sibling.select('tr')
            activation = ' · '.join(re.findall(r'自动回复|攻击回复|受击回复|手动触发|自动触发|被动', text(rows[0])))
            levels = []
            for row in rows:
                cells = row.find_all('td', recursive=False)
                if len(cells) < 5:
                    continue
                level = text(cells[0])
                if level not in ['4', '7']:
                    continue
                levels.append({'level': int(level), 'description': text(cells[1]), 'initialSp': text(cells[-3]), 'spCost': text(cells[-2]), 'duration': text(cells[-1])})
            if levels:
                skills.append({'index': len(skills) + 1, 'name': name, 'activation': activation, 'levels': levels})
    return {'profession': field('class'), 'branch': field('branch'), 'faction': field('group'), 'rarity': field('star'), 'description': description, 'skills': skills, 'artName': field('name'), **parse_lore(soup)}


def import_card(entry):
    name = entry['name']
    ident = 'prts-' + hashlib.sha256(name.encode()).hexdigest()[:12]
    html = fetch(entry['sourceUrl'], CACHE / f'{ident}.html').decode()
    soup = BeautifulSoup(html, 'html.parser')
    info = parse_operator(soup)
    if not info['skills'] or not info['description'] or not info['profession']:
        raise ValueError(f'{name}: incomplete operator parse; review page structure')
    art_url = media_url(f'立绘_{info["artName"] or name}_1.png')
    art_file = ASSETS / f'{ident}-art.webp'
    avatar_file = ASSETS / f'{ident}-avatar.webp'
    image_errors = []
    if not art_file.exists():
        try:
            raw = fetch(art_url, CACHE / f'{ident}-art.png')
            image = Image.open(io.BytesIO(raw)).convert('RGBA')
            box = image.getchannel('A').getbbox()
            if box:
                image = image.crop(box)
            image.thumbnail((1000, 1200), Image.Resampling.LANCZOS)
            image.save(art_file, 'WEBP', quality=84, method=5)
        except Exception as error:
            image_errors.append(f'art: {error}')
    if not avatar_file.exists() and entry.get('avatarUrl'):
        try:
            raw = fetch(entry['avatarUrl'], CACHE / f'{ident}-avatar.png')
            image = Image.open(io.BytesIO(raw)).convert('RGBA')
            image = ImageOps.contain(image, (256, 256))
            image.save(avatar_file, 'WEBP', quality=88, method=5)
        except Exception as error:
            image_errors.append(f'avatar: {error}')
    card = {
        'id': ident, 'name': name, 'tier': entry['tier'], 'cost': None,
        'title': ' · '.join(filter(None, [info['profession'], info['branch']])),
        'profession': info['profession'], 'branch': info['branch'], 'faction': info['faction'],
        'birthplace': info['birthplace'], 'factionPath': info['factionPath'], 'hiddenFactions': info['hiddenFactions'],
        'traitIds': [], 'description': info['description'], 'skills': info['skills'],
        'image': f'/assets/operators/{avatar_file.name}' if avatar_file.exists() else None,
        'artImage': f'/assets/operators/{art_file.name}' if art_file.exists() else None,
        'sourceUrl': entry['sourceUrl'], 'rosterSourceUrl': ROSTER_URL,
        'imageSourceUrl': art_url, 'avatarSourceUrl': entry.get('avatarUrl'),
        'imageStatus': 'ready' if art_file.exists() and avatar_file.exists() else 'partial',
    }
    return card, image_errors


def main():
    entries = roster()
    print(f'Found {len(entries)} default operators in tiers 1–6.', flush=True)
    results, failures, image_failures = {}, [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pending = {pool.submit(import_card, entry): entry for entry in entries}
        for future in concurrent.futures.as_completed(pending):
            entry = pending[future]
            try:
                card, image_errors = future.result()
                results[entry['name']] = card
                if image_errors:
                    image_failures.append({'name': entry['name'], 'errors': image_errors})
                print(f'[{len(results)}/{len(entries)}] {entry["tier"]}阶 {entry["name"]}: {len(card["skills"])} skills, images {card["imageStatus"]}', flush=True)
                if image_errors:
                    print('  image warnings: ' + '; '.join(image_errors), flush=True)
            except Exception as error:
                failures.append({'name': entry['name'], 'error': str(error)})
                print(f'FAILED {entry["name"]}: {error}', flush=True)
    report = {'failures': failures, 'imageFailures': image_failures}
    (CACHE / 'import-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(f'{len(failures)} operator imports failed; existing data was not replaced.')
    cards = [results[entry['name']] for entry in entries]
    previous_file = ROOT / 'data' / 'cards.json'
    previous_cards = json.loads(previous_file.read_text()) if previous_file.exists() else []
    is_prts_dataset = bool(previous_cards) and all(c['id'].startswith('prts-') for c in previous_cards)
    if is_prts_dataset:
        previous_traits = {c['id']: c.get('traitIds', []) for c in previous_cards}
        previous_core = {c['id']: c.get('corePact') for c in previous_cards}
        previous_mode = {c['id']: {key: c[key] for key in ['modeFeature', 'eliteFeature', 'featureCategory', 'modeData', 'avatarStage', 'originalImage', 'originalAvatarSourceUrl'] if key in c} for c in previous_cards}
        for card in cards:
            card['traitIds'] = previous_traits.get(card['id'], [])
            if previous_core.get(card['id']):
                card['corePact'] = previous_core[card['id']]
            card.update(previous_mode.get(card['id'], {}))
            previous = next((c for c in previous_cards if c['id'] == card['id']), {})
            if previous.get('avatarStage') == 'elite2':
                card['image'] = previous['image']
                card['avatarSourceUrl'] = previous['avatarSourceUrl']
    (ROOT / 'data' / 'cards.json').write_text(json.dumps(cards, ensure_ascii=False, indent=2) + '\n')
    if not is_prts_dataset or not (ROOT / 'data' / 'traits.json').exists():
        (ROOT / 'data' / 'traits.json').write_text('[]\n')
    previous_meta_file = ROOT / 'data' / 'sources.json'
    previous_meta = json.loads(previous_meta_file.read_text()) if previous_meta_file.exists() else {}
    meta = {
        **previous_meta,
        'dataset': '卫戍协议·规程', 'sourceName': 'PRTS', 'rosterUrl': ROSTER_URL,
        'importedAt': datetime.now(timezone.utc).isoformat(), 'tiers': [1, 2, 3, 4, 5, 6],
        'countsByTier': {str(t): len([c for c in cards if c['tier'] == t]) for t in range(1, 7)},
        'operatorCount': len(cards), 'skillCount': sum(len(c['skills']) for c in cards),
        'rosterMode': 'default', 'synergyStatus': previous_meta.get('synergyStatus', 'pending'),
        'skillReference': '干员常规技能，提供等级4和7的参考数据；未指定卫戍协议专属技能配置。',
        'artAttribution': '干员美术资源 © 鹰角网络，来源：PRTS 对应干员页面。',
        'excludedTiers': [], 'excludedRoster': '原型补位',
    }
    (ROOT / 'data' / 'sources.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    print(f'Wrote {len(cards)} operators, {meta["skillCount"]} skills. Image warnings: {len(image_failures)}.', flush=True)


if __name__ == '__main__':
    main()
