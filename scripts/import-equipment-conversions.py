#!/usr/bin/env python3
"""Import current homologue mappings from the game's device talent at a pinned revision."""
import argparse
import hashlib
import importlib.util
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('pacts', ROOT / 'scripts/import-pact-records.py')
pacts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pacts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', required=True, help='Full Git commit SHA for the reviewed game data')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}', args.revision):
        parser.error('--revision must be a full Git commit SHA')
    path = 'zh_CN/gamedata/excel/character_table.json'
    repository = 'https://github.com/Kengxxiao/ArknightsGameData'
    url = f'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/{args.revision}/{path}'
    raw = pacts.fetch(url, pacts.CACHE / f'character-conversions-{args.revision}.json')
    device_id = 'trap_1073_acarm073'
    device = json.loads(raw)[device_id]
    if device['name'] != '变形同构体':
        raise ValueError('Unexpected game device')
    candidates = device['talents'][0]['candidates']
    descriptions = {c['description'].replace('\\n', '\n') for c in candidates}
    if len(descriptions) != 1:
        raise ValueError('Device has multiple talent variants; review before importing')
    description = descriptions.pop()
    names = {t['name']: t['id'] for t in json.loads((ROOT / 'data/traits.json').read_text())}
    rules = []
    for line in description.splitlines():
        match = re.fullmatch(r'“([^”]+)”(系列装备)?→【([^】]+)】盟约', line.strip())
        if not match or match[3] not in names:
            raise ValueError(f'Unknown conversion rule: {line}')
        rules.append({'equipmentName': match[1], 'series': bool(match[2]), 'traitId': names[match[3]]})
    if len(rules) != 18:
        raise ValueError('Expected 18 pact mappings; review the new talent before updating this guard')
    source_url = f'{repository}/blob/{args.revision}/{path}'
    now = datetime.now(timezone.utc).isoformat()
    manifest = {'source': 'Arknights game data · device talent', 'sourceUrl': source_url, 'revision': args.revision, 'sha256': hashlib.sha256(raw).hexdigest(), 'deviceId': device_id, 'importedAt': now, 'talentDescription': description, 'rules': rules}
    equipment_file = ROOT / 'data/equipment.json'
    equipment = json.loads(equipment_file.read_text())
    for item in equipment:
        item['conversionTraitId'] = pacts.conversion_for(item['name'], rules)
        item['conversionSourceUrl'] = source_url if item['conversionTraitId'] else None
    matched = [e for e in equipment if e['conversionTraitId']]
    if {r['traitId'] for r in rules} != {e['conversionTraitId'] for e in matched}:
        raise ValueError('A talent rule has no matching equipment in the current roster')
    (ROOT / 'data/equipment-conversions.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    equipment_file.write_text(json.dumps(equipment, ensure_ascii=False, indent=2) + '\n')
    source_file = ROOT / 'data/sources.json'
    source = json.loads(source_file.read_text())
    source.update({'equipmentRuleSourceUrl': source_url, 'equipmentRulesImportedAt': now, 'conversionOptionCount': len(matched), 'conversionPactCount': len(rules)})
    source_file.write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n')
    report_file = ROOT / 'data/mode-import.json'
    report = json.loads(report_file.read_text())
    report.update({'conversionOptions': len(matched), 'conversionPacts': len(rules), 'conversionRulesImportedAt': now})
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'conversionOptions': len(matched), 'conversionPacts': len(rules), 'sourceUrl': source_url}, ensure_ascii=False))


if __name__ == '__main__':
    main()
