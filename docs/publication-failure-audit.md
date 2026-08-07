# Аудит неудачных публикаций и защитный контур

Дата системного аудита: 2026-08-07.

Этот документ разбирает известные неудачные или ложно-красные публикационные циклы проекта PF-001…PF-015 и фиксирует правило: **историческая ошибка считается закрытой только тогда, когда её причина представлена машинным regression-контролем либо безопасным ограниченным recovery-маршрутом**.

Машинный источник: `config/publication-failure-regressions.json`. Блокирующие тесты: `scripts/publication-readiness-test.mjs`, `scripts/publication-sheet-gate-contract-test.mjs` и `scripts/browser-bootstrap-contract-test.mjs`. Живой обязательный контроль каждой новой статьи, правки сайта, SEO или инфраструктуры находится во вкладке `29_Публикационный_шлюз` канонической Google-таблицы.

## Граница доказательств

Аудит основан на истории репозитория, PR и commit messages, сохранённых retry/recovery записях, diagnostics artifacts и известных Actions run/log сообщениях. Для части старых GitHub Pages runs API текущего коннектора не предоставляет полный список исторических run с их job logs, поэтому там, где точный run id недоступен, в качестве первичного свидетельства используются сохранённый repository record и соответствующий исправляющий PR. Это отмечает предел доступной ретроспективы, а не заменяется предположениями.

## PF-001 — 31.07.2026: production продолжал отдавать предыдущий SHA

**Свидетельство:** `reports/deploy-retries/2026-07-31-case-service-card.md`, PR #96, commit `f85386c921a807cc617ec5a5c7b81ad075fe339a`.

После merge основной домен продолжал отдавать предыдущую версию. Явного сигнала падения Pages не было, поэтому для повторного push появился технический commit без изменения сайта.

**Неисправность:** production readiness определялась по факту завершения workflow, а не по доказательству конкретной версии на custom domain; штатного механизма обнаружить drift и повторить тот же workflow не было.

**Постоянная защита:** каждая production-сборка получает уникальный `deployments/<full-sha>.json`; post-deploy сначала проверяет именно этот immutable path, затем `build-info.json` и SHA meta главной страницы. Отдельный watchdog сравнивает `main` и production и при реальном drift вызывает штатный Pages workflow. Пустые retrigger-коммиты запрещены как recovery-механизм.

## PF-002 — 31.07.2026: исправление остановилось на контентном шлюзе уже в production path

**Свидетельство:** `reports/deploy-triggers/2026-07-31-remove-public-seo-note.md`, commit `f992539a75b84aa100a4b01f1159bf7252b7f1bd`.

Исходник статьи уже был исправлен, однако первичная публикация остановилась на контентном шлюзе. Для повторного запуска появился служебный файл.

**Неисправность:** дефект проекта, определимый до merge, был допущен до production workflow.

**Постоянная защита:** полный `npm run check` проходит в PR; deterministic `release-check.mjs` проходит до браузеров и повторяется при release. `publication-readiness` контролирует сам release-контур. Если падает project-code test, автоматический recovery запрещён: исправление делается в ветке и снова проходит PR.

## PF-003 — 01.08.2026: production не показал сборку в первом временном окне

**Свидетельство:** `reports/deployment-retries/2026-08-01-refund-imposed-service.md`, merge `3aebe121a4adf709ba598040f608ca6d03be7b3e`.

Полный PR-CI был успешным, но custom domain не начал отдавать новую сборку в первом 35-минутном цикле. Был создан технический retry commit.

**Неисправность:** Pages backend/propagation и факт production-ready были связаны с одним жёстким окном; не было eventual-consistency recovery без изменения Git.

**Постоянная защита:** официальный deploy-pages отделён от verification; exact SHA verification имеет расширенное окно; immutable marker исключает ложное совпадение кэша. Watchdog восстанавливает реальный drift без изменения исходников.

## PF-004 — 06.08.2026: GitHub-hosted runner не был получен

**Свидетельство:** `reports/deployment-retries/2026-08-06-c139-runner-retry.md`, commit `80570fa97fb7242d2c404dec4586bfafcca1c224`, серия runs #308–#311. Зафиксированные сообщения включали `The job was not acquired by Runner of type hosted even after multiple attempts`; project code не запускался.

**Неисправность:** внешняя инфраструктура GitHub не выдала runner. Это не ошибка CSS, статьи, теста или build.

**Постоянная защита:** runner закреплён на `ubuntu-22.04`. Recovery workflow имеет `actions: write`, но не имеет `pages: write`; он анализирует job steps и делает `rerun-failed-jobs` того же run/SHA только если все failed jobs setup-only и `run_attempt < 3`. Если выполнение дошло до кода проекта, автоматический retry блокируется.

## PF-005 — 06.08.2026: ложный post-deploy failure C-139

**Свидетельство:** PR #175, merge `da658fb6fdaecd354ceac20a2682db111c510f0a`.

Страница C-139 была успешно развёрнута и прошла основной live test, однако общий smoke требовал `message-guide`, который в C-139 был намеренно заменён тематическим intake.

**Неисправность:** тест проверял историческую реализацию, а не требуемое пользовательское поведение.

**Постоянная защита:** вариативные публикации имеют source-level contract до merge; контракт проверяет допустимые состояния и запрещённые регрессии. Инфраструктурные tests должны проверять инварианты, а не случайный текст/имя шага, если это не часть продукта.

## PF-006 — июль–август 2026: WebKit overflow выявлялся после merge

**Свидетельство:** PR #146, #176, #177; commit `15dddccb16f108cc9669549685a6d60e22d6a140`.

На 320 px в WebKit проявлялись переполнения длинных H2 и отдельных редакционных страниц. Deploy мог быть зелёным до post-deploy smoke, хотя дефект можно было воспроизвести заранее.

**Неисправность:** pre-merge browser coverage была уже, чем post-deploy coverage.

**Постоянная защита:** `npm run check` до merge обходит все публикации на контрольных движках и узких viewport; `test:cross-browser` и all-publications overflow regression обязательны. Запрещено лечить регрессию повышением tolerance или глобальным `overflow-x:hidden`.

## PF-007 — 06.08.2026: Pages deployment зависал в `deployment_queued`

**Свидетельство:** PR #178, merge `ca0bbe20f7bb75e0e204b3c9524392d66a7d495d`.

`actions/deploy-pages` создавал deployment, но GitHub Pages backend держал его в очереди дольше стандартного ожидания. Build и artifact были исправны, а action завершал ожидание по timeout.

**Неисправность:** backend queue ошибочно превращалась в повторную сборку/публикационный инцидент; lifecycle deploy не был достаточно изолирован.

**Постоянная защита:** используется один официальный `actions/deploy-pages@v5`, отдельный deploy job, ограниченный timeout и non-cancelling active deployment. Recovery не создаёт второй deployment-клиент.

## PF-008 — 06–07.08.2026: отмена активного deploy и конкурирующие deploy-механизмы

**Свидетельство:** PR #191, merge `0c53166d7bb0a803818d66fbe5359dde4b5bb21e`; `reports/deploy-recovery/force-pages-2026-08-07.md`.

Историческая схема допускала `cancel-in-progress:true`, отдельный fallback и собственный Pages REST client. Новый push мог пересечься с уже созданным server-side deployment, а fallback — создать второй writer в тот же backend.

**Неисправность:** одним production resource управляли несколько механизмов с разными очередями и polling.

**Постоянная защита:** единственный writer — `Deploy GitHub Pages` с `actions/deploy-pages@v5`; активный deploy не отменяется. Recovery/watchdog имеют только Actions-доступ и могут rerun/dispatch этот workflow, но не имеют Pages permissions и не содержат deploy actions.

## PF-009 — 06.08.2026: macOS fallback запускал Linux Chromium

**Свидетельство:** diagnostics: `browserType.launch: spawn ENOEXEC`, путь `.browser-bin/chromium`, `scripts/service-pages-interaction-test.mjs`.

**Неисправность:** Linux binary использовался на macOS.

**Постоянная защита:** Linux-specific executable используется только на Linux; browser contract запрещает unconditional Linux executablePath. Отдельный browser-heavy deployment fallback удалён, поэтому cross-platform browser test больше не является recovery-путём Pages.

## PF-010 — 07.08.2026: сайт опубликован, но post-deploy снова ставил браузеры

**Свидетельство:** PR #191 и #192; merge #192 `3578f227e8d144d1075490bb4c5a7745ca620d58`.

После успешного Pages deployment отдельный verification повторно скачивал браузеры и мог стать красным из-за apt/CDN/Playwright, хотя production уже был обновлён.

**Неисправность:** mutable browser dependencies после deployment смешивали состояние сайта и диагностики.

**Постоянная защита:** browser-heavy проверки выполняются только до merge. Post-deploy не делает `npm ci`, не содержит Playwright и проверяет exact SHA, HTTP surface, publication manifest/public copy и IndexNow.

## PF-011 — 07.08.2026: IndexNow ожидал локальный `dist` в отдельном post-deploy workflow

**Свидетельство:** PR #192; `scripts/submit-indexnow.mjs`.

После правильной изоляции post-deploy локальная сборка исчезла, но старый IndexNow код ожидал `dist/sitemap.xml`.

**Неисправность:** скрытая cross-workflow filesystem dependency.

**Постоянная защита:** post-deploy передаёт production sitemap; script читает уже проверенный production origin. Syntax всех post-deploy scripts проверяется до merge.

## PF-012 — 2026: старые контрактные тесты создавали ложные красные CI

**Свидетельство:** PR #105 и последовательные исправления PR #192.

Контракты были привязаны к имени diagnostic artifact, exact форме IndexNow command, старому browser smoke и regex по форматированию YAML.

**Неисправность:** защита архитектуры фиксировала incidental implementation details.

**Постоянная защита:** новые контракты проверяют свойства: permissions, единственность writer, порядок шагов, наличие exact-SHA gate, отсутствие браузеров post-deploy, bounded recovery. Где важен порядок, он проверяется смысловыми инвариантами, а не косметической формой YAML.

## PF-013 — 07.08.2026: CI скачивал полную историю и сотни refs

**Свидетельство:** PR #194, merge `b0b6af3969725dce8482589930167bfaf8bebd29`.

`fetch-depth:0` использовался ради `BASE_SHA..HEAD`, хотя репозиторий содержит большое количество исторических refs. Это раздувало checkout/log/network и увеличивало инфраструктурную поверхность сбоя.

**Неисправность:** лишняя Git history dependency.

**Постоянная защита:** PR CI и Pages build используют `fetch-depth:1` и точечно fetch только требуемый base SHA. Post-deploy также checkout-ит exact deployed SHA с depth 1.

## PF-014 — 07.08.2026: первая версия табличного шлюза создала stage deadlock

**Свидетельство:** PR #196, живая вкладка `29_Публикационный_шлюз`, `scripts/publication-sheet-gate-contract-test.mjs`.

Первая формула нового табличного gate одновременно требовала и pre-merge, и post-deploy доказательства. В результате exact production SHA, который физически появляется только после merge и deploy, становился условием самого merge.

**Неисправность:** два разных состояния жизненного цикла — разрешение на merge и доказательство завершённой production-публикации — были ошибочно объединены в один итоговый статус.

**Постоянная защита:** staged model фиксирована машинным контрактом. `B2` отвечает только за pre-merge блокеры и допускает merge лишь при `MERGE РАЗРЕШЕН`; `L2` отдельно подтверждает финал только при `ПУБЛИКАЦИЯ ЗАВЕРШЕНА` после exact production SHA, HTTP/public-copy и IndexNow. Контракт запрещает использовать один status cell для двух стадий.

## PF-015 — 07.08.2026: browser dependency bootstrap ложно упал на жёстком 6-минутном окне

**Свидетельство:** PR #196, CI #764 / run `31182943727`, job `92880492884`, `scripts/browser-bootstrap-contract-test.mjs`.

Точный head сначала успешно прошёл весь deterministic release-path, включая publication-readiness и PF-014 staged gate. Затем `npx playwright install-deps chromium firefox webkit` корректно начал загружать системные пакеты с Azure Ubuntu mirror, но зеркало резко замедлилось. GitHub остановил шаг ровно по историческому `timeout-minutes: 6`, до запуска browser tests и project browser code.

**Неисправность:** обязательный pre-merge browser bootstrap зависел от внешнего APT mirror без явной bounded retry/timeout policy и имел слишком короткое фиксированное окно. Обычная сетевая деградация превращалась в ложный CI failure, хотя ослаблять или переносить browser проверки после deploy нельзя.

**Постоянная защита:** `ci.yml` сохраняет pinned `ubuntu-22.04`, задаёт APT `Acquire::Retries "5"`, HTTP/HTTPS timeout 60 секунд, отдельное 12-минутное окно системных зависимостей и 10-минутное окно browser binaries при общем bounded job timeout 40 минут. `scripts/browser-bootstrap-contract-test.mjs` не позволяет вернуть старые 6 минут, убрать retries или исключить Chromium/Firefox/WebKit. Полный browser-backed `npm run check` всё равно обязателен до merge.

Следующий ранее неизвестный класс начинается с PF-016.

# Обязательная модель новой публикации

Новая правка больше не должна превращаться в эксперимент над production. Бот обязан работать по конечному автомату:

`live sheet gate → branch → publication readiness → deterministic + browser-bootstrap regressions → full PR CI → B2 MERGE РАЗРЕШЕН → merge → one official Pages deploy → exact SHA marker → production HTTP/public-copy regression → IndexNow → L2 ПУБЛИКАЦИЯ ЗАВЕРШЕНА → release log`.

Если этап падает, ошибка классифицируется:

- **project/content/browser test failure** — автоматический retry запрещён; исправление в ветке;
- **setup-only hosted runner failure** — ограниченные автоматические повторы failed jobs того же run/SHA;
- **PF-015 pre-merge browser bootstrap infrastructure failure** — merge запрещён; не ослаблять browser coverage, сохранить bounded APT retries/timeouts и реалистичные окна, затем повторить полный CI на текущем exact head без технического retry-коммита;
- **Pages/backend failure после запуска project code** — не маскировать retry-коммитом; штатный workflow может быть повторно вызван только безопасным recovery-маршрутом;
- **post-deploy verification failure** — production уже мог быть опубликован; сначала сравнить exact marker/SHA, затем чинить конкретную verification-причину;
- **Metrica/API telemetry failure** — диагностическая, не должна менять факт опубликованного exact SHA;
- **новый неизвестный класс** — поставить `Да — не закрыт`, присвоить PF-016+, доказать root cause, добавить machine regression/recovery и повторить весь gate.

# Критерий завершённой публикации

Публикация считается завершённой только если:

1. живой табличный шлюз заполнен фактическими доказательствами;
2. точный head SHA прошёл обязательный PR CI;
3. B2 показывает `MERGE РАЗРЕШЕН`;
4. в `main` попал именно проверенный head;
5. официальный Pages workflow создал deployment без альтернативного writer;
6. `https://yuristshevchuk.com/deployments/<SHA>.json` существует и содержит тот же SHA;
7. `build-info.json` и `<meta name="site-build-sha">` совпадают с SHA;
8. production HTTP и public-copy regression всех публикаций прошли;
9. IndexNow завершён корректно;
10. L2 показывает `ПУБЛИКАЦИЯ ЗАВЕРШЕНА` и релиз записан в `ЖУРНАЛ РЕЛИЗОВ`.

Ни зелёный merge, ни успешный build, ни наличие нового commit в `main`, ни один только pre-merge статус B2 сами по себе не означают, что production обновлён.
