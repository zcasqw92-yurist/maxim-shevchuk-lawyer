#!/usr/bin/env python3
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path('research-output')
PAGES = OUT / 'pages'
SUBS = OUT / 'subtitles'
PAGES.mkdir(parents=True, exist_ok=True)
SUBS.mkdir(parents=True, exist_ok=True)

playlist = json.loads((OUT / 'playlist.json').read_text(encoding='utf-8'))
entries = playlist.get('entries') or []

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.7',
}


def fetch(url, timeout=25):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, response.read()


def balanced_json(text, marker):
    pos = text.find(marker)
    if pos < 0:
        return None
    start = text.find('{', pos + len(marker))
    if start < 0:
        return None
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:index + 1])
                except json.JSONDecodeError:
                    return None
    return None


def deep_find(obj, key):
    if isinstance(obj, dict):
        if key in obj:
            yield obj[key]
        for value in obj.values():
            yield from deep_find(value, key)
    elif isinstance(obj, list):
        for value in obj:
            yield from deep_find(value, key)


def text_value(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        if isinstance(value.get('simpleText'), str):
            return value['simpleText']
        runs = value.get('runs')
        if isinstance(runs, list):
            return ''.join(str(run.get('text') or '') for run in runs if isinstance(run, dict))
    return ''


def choose_caption(tracks):
    if not tracks:
        return None
    preferred = []
    for track in tracks:
        code = str(track.get('languageCode') or '')
        kind = str(track.get('kind') or '')
        priority = 9
        if code.startswith('ru') and kind != 'asr': priority = 0
        elif code.startswith('ru'): priority = 1
        elif code.startswith('en') and kind != 'asr': priority = 2
        elif code.startswith('en'): priority = 3
        preferred.append((priority, track))
    preferred.sort(key=lambda item: item[0])
    return preferred[0][1] if preferred and preferred[0][0] < 9 else None


summary = []
for index, entry in enumerate(entries, 1):
    video_id = entry.get('id') or ''
    record = {
        'index': index,
        'id': video_id,
        'playlist_title': entry.get('title'),
        'duration': entry.get('duration'),
        'url': f'https://www.youtube.com/watch?v={video_id}',
    }
    page_text = ''
    status = None
    errors = []
    for url in [
        f'https://www.youtube.com/watch?v={video_id}&hl=ru&gl=RU',
        f'https://www.youtube-nocookie.com/embed/{video_id}?hl=ru',
    ]:
        try:
            status, body = fetch(url)
            page_text = body.decode('utf-8', errors='replace')
            if 'ytInitialPlayerResponse' in page_text or 'shortDescription' in page_text:
                record['page_source'] = url
                break
        except Exception as exc:
            errors.append(f'{url}: {type(exc).__name__}: {exc}')
    record['http_status'] = status
    if errors:
        record['fetch_errors'] = errors

    player = None
    for marker in ['ytInitialPlayerResponse =', 'var ytInitialPlayerResponse =', '"PLAYER_RESPONSE":']:
        player = balanced_json(page_text, marker)
        if player:
            break
    initial = balanced_json(page_text, 'var ytInitialData =') or balanced_json(page_text, 'ytInitialData =')

    details = (player or {}).get('videoDetails') or {}
    record['title'] = details.get('title') or entry.get('title')
    record['author'] = details.get('author')
    record['length_seconds'] = details.get('lengthSeconds')
    record['view_count'] = details.get('viewCount')
    record['short_description'] = details.get('shortDescription') or ''
    record['keywords'] = details.get('keywords') or []
    record['is_live'] = details.get('isLiveContent')

    if initial:
        # Useful visible description/title snippets when player metadata is restricted.
        snippets = []
        for key in ['attributedDescriptionBodyText', 'description', 'snippetText']:
            for value in deep_find(initial, key):
                text = text_value(value).strip()
                if text and text not in snippets:
                    snippets.append(text)
                if len(snippets) >= 12:
                    break
        record['visible_snippets'] = snippets[:12]

    tracks = (((player or {}).get('captions') or {}).get('playerCaptionsTracklistRenderer') or {}).get('captionTracks') or []
    record['caption_tracks'] = [
        {
            'languageCode': track.get('languageCode'),
            'name': text_value(track.get('name')),
            'kind': track.get('kind'),
            'isTranslatable': track.get('isTranslatable'),
        }
        for track in tracks
    ]
    selected = choose_caption(tracks)
    if selected and selected.get('baseUrl'):
        try:
            caption_url = selected['baseUrl']
            separator = '&' if '?' in caption_url else '?'
            _, caption_body = fetch(f'{caption_url}{separator}fmt=vtt')
            caption_text = caption_body.decode('utf-8', errors='replace')
            subtitle_path = SUBS / f'{index:03d}-{video_id}.vtt'
            subtitle_path.write_text(caption_text, encoding='utf-8')
            record['subtitle_file'] = str(subtitle_path.relative_to(OUT))
            record['subtitle_language'] = selected.get('languageCode')
            record['subtitle_kind'] = selected.get('kind')
        except Exception as exc:
            record['subtitle_error'] = f'{type(exc).__name__}: {exc}'

    if not player:
        record['page_markers'] = {
            'bot_check': 'confirm you’re not a bot' in page_text.lower() or 'подтвердите, что вы не бот' in page_text.lower(),
            'consent': 'consent.youtube.com' in page_text,
            'private': 'private video' in page_text.lower(),
            'html_length': len(page_text),
        }

    (PAGES / f'{index:03d}-{video_id}.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    summary.append({
        'index': index,
        'id': video_id,
        'title': record.get('title'),
        'description_chars': len(record.get('short_description') or ''),
        'caption_tracks': record.get('caption_tracks'),
        'subtitle_file': record.get('subtitle_file'),
        'http_status': record.get('http_status'),
        'page_markers': record.get('page_markers'),
    })
    print(f"{index:03d}/{len(entries)} {video_id} description={summary[-1]['description_chars']} captions={len(tracks)} subtitle={bool(record.get('subtitle_file'))}", flush=True)
    time.sleep(0.20)

(OUT / 'page-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Completed pages={len(summary)} descriptions={sum(bool(x["description_chars"]) for x in summary)} subtitles={sum(bool(x["subtitle_file"]) for x in summary)}')
