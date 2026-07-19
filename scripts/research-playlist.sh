#!/usr/bin/env bash
set -euo pipefail

PLAYLIST_URL='https://www.youtube.com/playlist?list=PLKvlIwNvLweJlmSqDT7-66sfBweq2on74'
OUT='research-output'
rm -rf "$OUT"
mkdir -p "$OUT"
: > "$OUT/diagnostics.log"

yt-dlp \
  --flat-playlist \
  --dump-single-json \
  --no-warnings \
  "$PLAYLIST_URL" \
  > "$OUT/playlist.json" \
  2>> "$OUT/diagnostics.log"

python scripts/research-youtube-pages.py >> "$OUT/diagnostics.log" 2>&1
python scripts/research-selected-transcripts.py >> "$OUT/diagnostics.log" 2>&1

python - <<'PY'
import json
from pathlib import Path

out = Path('research-output')
data = json.loads((out / 'playlist.json').read_text(encoding='utf-8'))
entries = data.get('entries') or []
summary = json.loads((out / 'page-summary.json').read_text(encoding='utf-8'))
transcript_summary_path = out / 'selected-transcripts-summary.json'
transcript_summary = json.loads(transcript_summary_path.read_text(encoding='utf-8')) if transcript_summary_path.exists() else []
lines = [
    f"Плейлист: {data.get('title') or 'Без названия'}",
    f"Автор: {data.get('uploader') or data.get('channel') or 'Не определён'}",
    f"Количество видео: {len(entries)}",
    f"Получены описания: {sum(bool(item.get('description_chars')) for item in summary)}",
    f"Получены субтитры с YouTube: {sum(bool(item.get('subtitle_file')) for item in summary)}",
    f"Получены расшифровки ключевых роликов: {sum(bool(item.get('file')) for item in transcript_summary)} из {len(transcript_summary)}",
    '',
]
for index, item in enumerate(entries, 1):
    video_id = item.get('id') or ''
    title = item.get('title') or 'Без названия'
    duration = item.get('duration')
    duration_text = f"{int(duration)//60}:{int(duration)%60:02d}" if isinstance(duration, (int, float)) else '—'
    detail = summary[index - 1] if index - 1 < len(summary) else {}
    lines.append(
        f"{index:03d}. {title} | {duration_text} | "
        f"описание={detail.get('description_chars', 0)} | "
        f"субтитры={'да' if detail.get('subtitle_file') else 'нет'} | "
        f"https://www.youtube.com/watch?v={video_id}"
    )
(out / 'manifest.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
PY
