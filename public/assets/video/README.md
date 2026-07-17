# Файлы личного видео

Перед включением видеоблока положите сюда:

- `intro.webm` — основной формат;
- `intro.mp4` — резервный формат;
- `intro-captions.vtt` — русские субтитры.

Постер по умолчанию используется из `src/assets/images/maxim-hero.webp`. Его можно заменить отдельным WebP через Repository Variable `SITE_VIDEO_POSTER`.

После загрузки файлов задайте в GitHub Repository Variables:

- `SITE_VIDEO_ENABLED=true`;
- `SITE_VIDEO_WEBM=/assets/video/intro.webm`;
- `SITE_VIDEO_MP4=/assets/video/intro.mp4`;
- `SITE_VIDEO_CAPTIONS=/assets/video/intro-captions.vtt`;
- при необходимости `SITE_VIDEO_TITLE`, `SITE_VIDEO_DURATION`, `SITE_VIDEO_POSTER`.

Production-сборка не позволит включить видео, пока все обязательные файлы отсутствуют.