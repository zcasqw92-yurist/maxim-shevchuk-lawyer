#!/usr/bin/env python3
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

OUT = Path('research-output')
TRANSCRIPTS = OUT / 'selected-transcripts'
TRANSCRIPTS.mkdir(parents=True, exist_ok=True)
playlist = json.loads((OUT / 'playlist.json').read_text(encoding='utf-8'))
entries = playlist.get('entries') or []

# Все юридические/смежные ролики и репрезентативные видео по ключевым приёмам автора.
selected_indexes = [
    12, 35, 38, 46, 58, 86, 95, 108, 111, 120, 125, 129, 136, 143, 156, 157, 159, 160, 161, 162,
]
headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; research/1.0)',
    'Accept': 'text/markdown,text/plain;q=0.9,*/*;q=0.5',
}
results = []
for index in selected_indexes:
    if index < 1 or index > len(entries):
        continue
    entry = entries[index - 1]
    video_id = entry.get('id') or ''
    title = entry.get('title') or 'Без названия'
    url = f'https://youtube-transcript.ai/transcript/{video_id}.txt?lang=ru'
    record = {'index': index, 'id': video_id, 'title': title, 'url': url}
    try:
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=90) as response:
            body = response.read().decode('utf-8', errors='replace')
            record['status'] = response.status
            record['content_type'] = response.headers.get('content-type')
            record['chars'] = len(body)
            record['preview'] = body[:500]
            if response.status == 200 and len(body.strip()) > 200 and '<html' not in body[:200].lower():
                path = TRANSCRIPTS / f'{index:03d}-{video_id}.txt'
                path.write_text(body, encoding='utf-8')
                record['file'] = str(path.relative_to(OUT))
    except urllib.error.HTTPError as exc:
        record['status'] = exc.code
        record['error'] = f'HTTPError: {exc}'
        try:
            record['preview'] = exc.read().decode('utf-8', errors='replace')[:500]
        except Exception:
            pass
    except Exception as exc:
        record['error'] = f'{type(exc).__name__}: {exc}'
    results.append(record)
    print(f"{index:03d} {video_id} status={record.get('status')} chars={record.get('chars', 0)} saved={bool(record.get('file'))}", flush=True)
    time.sleep(0.75)

(OUT / 'selected-transcripts-summary.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(f"Selected transcripts saved: {sum(bool(item.get('file')) for item in results)} of {len(results)}")
