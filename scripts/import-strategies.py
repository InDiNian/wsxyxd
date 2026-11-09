#!/usr/bin/env python3
"""Import the current mode's strategy report using the same PRTS snapshot as pacts."""
import concurrent.futures
import hashlib
import importlib.util
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('pact_import', ROOT / 'scripts/import-pact-records.py')
pacts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pacts)


def parse_strategies(soup, traits):
    heading = 'S.W.E.E.P.策略报告'
    start = soup.find('h2', id=heading)
    if not start:
        raise ValueError('Missing strategy report')
    records = []
    for table in start.parent.next_siblings:
        if getattr(table, 'name', None) == 'div' and 'mw-heading2' in table.get('class', []):
            break
        if getattr(table, 'name', None) != 'table':
            continue
        rows = table.select('tr')
        cells = rows[0].find_all('td', recursive=False)
        if len(cells) != 3 or len(rows) != 2:
            raise ValueError('Unexpected strategy table structure')
        name = pacts.clean(rows[1])
        initiator = pacts.clean(cells[0])
        img = cells[0].select_one('img')
        detail = BeautifulSoup(str(cells[2]), 'lxml')
        unlock_node = detail.find_all('i')[-1]
        unlock = pacts.clean(unlock_node)
        unlock_node.decompose()
        text = pacts.clean(detail)
        life = re.match(r'初始生命值\s*(\d+)', text)
        if not life:
            raise ValueError(f'{name}: missing initial life')
        effect = text[life.end():].strip()
        usage = [label for label in ['被动', '点击', '拖拽'] if label + ('效果' if label == '被动' else '使用') in effect]
        if not effect or not usage or not unlock or not img:
            raise ValueError(f'{name}: incomplete strategy')
        ident = 'strategy-' + hashlib.sha256(name.encode()).hexdigest()[:12]
        records.append({
            'id': ident, 'name': name, 'initiator': initiator, 'initialLife': int(life.group(1)),
            'usageTypes': usage, 'effect': effect, 'unlock': unlock,
            'traitIds': [t['id'] for t in traits if re.search('[【〖]' + re.escape(t['name']) + '[】〗]', effect + unlock)],
            'imageSourceUrl': img['src'], 'source': 'PRTS',
            'sourceUrl': pacts.URL + '#' + quote(heading),
        })
    if len(records) != 61 or len({r['id'] for r in records}) != len(records):
        raise ValueError(f'Expected 61 unique strategies, got {len(records)}; review the source before updating this guard.')
    return records


def main():
    soup = BeautifulSoup(pacts.fetch(pacts.URL, pacts.CACHE / 'pact-records.html'), 'lxml')
    traits = json.loads((ROOT / 'data/traits.json').read_text())
    records = parse_strategies(soup, traits)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda item: pacts.image(item, 'strategies'), records))
    (ROOT / 'data/strategies.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    source_file = ROOT / 'data/sources.json'
    source = json.loads(source_file.read_text())
    source.update({'strategyCount': len(records), 'strategySourceUrl': records[0]['sourceUrl'], 'strategyImportedAt': datetime.now(timezone.utc).isoformat()})
    source_file.write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'strategies': len(records), 'initiallyUnlocked': sum(r['unlock'] == '初始解锁' for r in records)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
