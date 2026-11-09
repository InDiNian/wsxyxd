#!/usr/bin/env python3
"""Download PRTS elite-two head icons; keep original icons when no E2 exists."""
import concurrent.futures
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from urllib.parse import unquote
from importlib.util import spec_from_file_location, module_from_spec

spec = spec_from_file_location('prts_importer', __file__.replace('import-elite2-avatars.py', 'import-prts.py'))
prts = module_from_spec(spec)
spec.loader.exec_module(prts)


def import_avatar(card):
    # The name in the original media URL also handles alternate operator pages.
    original = unquote(card.get('originalAvatarSourceUrl', card.get('avatarSourceUrl', ''))).split('?')[0].rsplit('/', 1)[-1]
    name = re.sub(r'^头像_|\.png$', '', original) or card['name']
    url = prts.media_url(f'头像_{name}_2.png')
    target = prts.ASSETS / f'{card["id"]}-avatar-e2.webp'
    try:
        if not target.exists():
            response = prts.requests.get(url, headers=prts.HEADERS, timeout=(10, 35))
            if response.status_code == 404:
                return card['id'], None, '没有精二头像，沿用原头像'
            response.raise_for_status()
            image = prts.Image.open(io.BytesIO(response.content)).convert('RGBA')
            image = prts.ImageOps.contain(image, (256, 256))
            image.save(target, 'WEBP', quality=90, method=5)
        return card['id'], { 'image': f'/assets/operators/{target.name}', 'avatarSourceUrl': url, 'avatarStage': 'elite2', 'originalImage': card.get('originalImage', card['image']), 'originalAvatarSourceUrl': card.get('originalAvatarSourceUrl', card.get('avatarSourceUrl')) }, None
    except Exception as error:
        return card['id'], None, str(error)


if __name__ == '__main__':
    path = prts.ROOT / 'data' / 'cards.json'
    cards = json.loads(path.read_text())
    updates, unavailable = {}, []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for ident, update, error in pool.map(import_avatar, cards):
            if update:
                updates[ident] = update
            else:
                unavailable.append({'id': ident, 'name': next(c['name'] for c in cards if c['id'] == ident), 'reason': error})
    # Read again so a concurrent data update cannot be overwritten.
    cards = json.loads(path.read_text())
    for card in cards:
        if card['id'] in updates:
            card.update(updates[card['id']])
        else:
            card['avatarStage'] = 'original-unavailable'
    path.write_text(json.dumps(cards, ensure_ascii=False, indent=2) + '\n')
    report = {'updatedAt': datetime.now(timezone.utc).isoformat(), 'elite2Count': len(updates), 'unavailable': unavailable}
    (prts.ROOT / 'data' / 'avatar-import.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
