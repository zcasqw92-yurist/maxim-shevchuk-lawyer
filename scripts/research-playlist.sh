#!/usr/bin/env bash
set -uo pipefail

PLAYLIST_URL='https://www.youtube.com/playlist?list=PLKvlIwNvLweJlmSqDT7-66sfBweq2on74'
OUT='research-output'
mkdir -p "$OUT/items"
: > "$OUT/diagnostics.log"

set +e
yt-dlp \
  --flat-playlist \
  --dump-single-json \
  --no-warnings \
  "$PLAYLIST_URL" \
  > "$OUT/playlist.json" \
  2>> "$OUT/diagnostics.log"
FLAT_CODE=$?

# Метаданные каждого ролика и доступные авторские/автоматические субтитры.
yt-dlp \
  --skip-download \
  --write-info-json \
  --write-subs \
  --write-auto-subs \
  --sub-langs 'ru.*,en.*' \
  --sub-format 'vtt/best' \
  --ignore-errors \
  --no-overwrites \
  --output "$OUT/items/%(playlist_index)03d-%(id)s.%(ext)s" \
  "$PLAYLIST_URL" \
  >> "$OUT/diagnostics.log" 2>&1
DETAIL_CODE=$?
set -e

python - <<'PY'
import json
from pathlib import Path

out = Path('research-output')
playlist_path = out / 'playlist.json'
lines = []
if playlist_path.exists() and playlist_path.stat().st_size:
    try:
        data = json.loads(playlist_path.read_text(encoding='utf-8'))
        entries = data.get('entries') or []
        lines.append(f"Плейлист: {data.get('title') or 'Без названия'}")
        lines.append(f"Автор: {data.get('uploader') or data.get('channel') or 'Не определён'}")
        lines.append(f"Количество видео: {len(entries)}")
        lines.append('')
        for index, item in enumerate(entries, 1):
            video_id = item.get('id') or ''
            title = item.get('title') or 'Без названия'
            duration = item.get('duration')
            duration_text = f"{int(duration)//60}:{int(duration)%60:02d}" if isinstance(duration, (int, float)) else '—'
            lines.append(f"{index:02d}. {title} | {duration_text} | https://www.youtube.com/watch?v={video_id}")
    except Exception as exc:
        lines.append(f'Не удалось разобрать playlist.json: {exc}')
else:
    lines.append('playlist.json отсутствует или пуст.')

info_files = sorted((out / 'items').glob('*.info.json'))
subtitle_files = sorted([* (out / 'items').glob('*.vtt'), * (out / 'items').glob('*.srt')])
lines.extend(['', f'Файлов метаданных: {len(info_files)}', f'Файлов субтитров: {len(subtitle_files)}'])
(out / 'manifest.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
PY

printf '\nflat_playlist_exit=%s\ndetails_exit=%s\n' "$FLAT_CODE" "$DETAIL_CODE" >> "$OUT/diagnostics.log"

# Сбор считается успешным, если получен хотя бы состав плейлиста.
if [[ ! -s "$OUT/playlist.json" ]]; then
  exit 1
fi
