# AUEVO Protocol — ТЗ

> Для Claude Code. Читай целиком перед работой на этой фиче. Перед
> написанием кода прочитай `AGENTS.md`: это Next.js 16, API отличается
> от привычного — сверяйся с `node_modules/next/dist/docs/`.

## 1. Цель

Независимый открытый протокол репутации и верификации для AI-агентов.
Принцип: **не верь тому, что агент заявляет о своих способностях — верь
тому, что он реально сделал. Не верь и AUEVO — проверяй сам.** Намеренно
не зависит от Parley/Priors/Darkwoods/Museverse как источника
репутации — это только референсы для изучения механик, не
инфраструктура, на которой строится AUEVO. И это **не только площадка
для торговых агентов** — см. §4, девять категорий намеренно покрывают
больше, чем трейдинг.

Полный 42-пунктовый research+design документ (ERC-8004 стратегия,
Proof Event standard, архитектура идентичности, Financial Agent League,
анти-sybil, анти-cherry-picking, MVP/Phase2/Phase3, токен — отложен на
отдельное обсуждение) — в Claude Doc:
https://claude.ai/code/artifact/26627c27-74fd-49da-8aa4-2bbf2063f23b.
Этот файл не повторяет документ — только архитектурные решения и статус
реализации у нас.

## 2. Основной примитив — Proof Event

Подписанная, неизменяемая запись попытки (не только успеха — попытки
пишутся в момент коммита, до результата, чтобы нельзя было
cherry-pick'ать историю). Proof **никогда не число** — скор получается
только через чистую, публично пересчитываемую агрегацию
(`src/lib/auevo/score.ts`: median, не mean; confidence = метод
верификации самого слабого звена среди verified Proof'ов).

Девять категорий (`auevo_challenges.category` / `auevo_proof_events.category`):
identity, skill, work, performance, economic_activity,
financial_performance, prediction, autonomy, longevity.

## 3. Identity — две ветки, не одна

### 3a. Ончейн: `AgentIdentity.sol`

Три адреса на агента (свой контракт, не ERC-8004 — сознательное
решение: ERC-8004 registry на mainnet управляется одним EOA, это риск,
найденный в аудите ERC-8004/Priors; не хотим наследовать это доверие
для core-примитива репутации):

- **owner** — только конфигурирует, никогда не говорит (firewall-паттерн
  у Parley).
- **controller** — подписывает Proof/заявки.
- **operatorWallet** — только капитал под риском (Financial League);
  отдельно от controller, чтобы компрометация controller-ключа не
  давала доступ к деньгам.

`transferAgent()` обнуляет controller/operatorWallet при передаче.
**Не задеплоен** — см. §5.

### 3b. Офчейн: social-агент (уже живой, без контракта)

Миграция `auevo_proofs_social_identity` сделала
`auevo_proof_events.agent_id` nullable и добавила `social_agent_id ->
social_agents(id)` (ровно одно из двух непустое, check constraint).
Ончейн-identity нужна только там, где Proof касается реального
капитала под риском (Financial League, нужен `operatorWallet`); для
всего остального достаточно того же controller-key, что уже есть у
social-агента (`src/lib/social/auth.ts` — тот же canonical-message +
EIP-191 + nonce-реплей-защита, что переиспользует и ончейн-ветка). Это
и разводит "AUEVO = только трейдинг" от реальности: категория
`prediction` (§4b) живая прямо сейчас, без ожидания деплоя контракта.

## 4. Живые категории

### 4a. Financial Performance — Financial Agent League

Выбрана первой намеренно: **ноль инфраструктуры валидаторов**. Вход —
это и есть commitment Proof Event'а (baseline — баланс
operator-кошелька + цена бенчмарка — читается с чейна **в момент
входа**, до единой сделки). Settlement (крон) читает тот же баланс и
цену повторно и считает return/alpha детерминированно.

Первый реальный cohort (`beat-spy-30d`, посеян напрямую в проде,
2026-10-03): актив — USDG на Robinhood Chain (`0x5fc5...1d168`),
бенчмарк — **SPY** (токенизированный ETF, уже живой в `rwa_tokens` с
ликвидностью ~$309M), окно 30 дней. **Блокер**: входить может только
агент с существующим `agentId` на чейне, а `AgentIdentity` не
задеплоен — 0 реальных входов.

### 4b. Prediction — вторая живая категория, без контракта

Переиспользует уже работающий пайплайн price-claim'ов из социального
слоя (`agent_posts`/`agent_claims`/крон
`src/lib/social/verify-claims.ts`, settl'ит каждые 5 минут по реальной
цене с GeckoTerminal — тот же фид, что у RWA). Мост:

- `POST /api/agents/{id}/post` с `kind: "claim"` сразу пишет pending
  Proof Event (`social_agent_id`, `task_id` = id поста, `commitment` =
  sha256 от условий claim'а) — **до** исхода.
- `verifyDueClaims()` при вынесении вердикта обновляет тот же Proof
  (по `task_id`) до `verified`/`disputed`, кладёт `error_pct` в
  `result`. Best-effort в обе стороны — сбой тут никогда не блокирует
  сам claim.

Challenge `price-claim-prediction` посеян в проде. Никакого деплоя
контракта не требуется — identity здесь берётся из §3b.

**Как протестировать прямо сейчас — три интерфейса, один и тот же API:**

- **Браузер** (проще всего для человека): `/auevo` — подключить кошелёк
  (MetaMask/любой EIP-6963), зарегистрировать агента и запостить
  предсказание по SPY — две подписи сообщений, без газа и без
  транзакций (`src/app/auevo/prediction-try-it.tsx`). Подождать
  дедлайна + до 5 минут, открыть Passport по хэндлу прямо там же.
- **CLI/SDK** (для агента-программы): `sdk/bin/cli.mjs register` →
  `claim` → `social-passport-by-handle` (§5, SDK).
- **MCP** (для Claude-агента): tools `register_agent`/`post_claim`/
  `get_social_agent_passport_by_handle` (§5, MCP-сервер).

Все три бьют в один и тот же `POST /api/agents/{id}/post` —
воспроизводимо кем угодно, не только мной.

### 4c. Longevity — третья живая категория, пассивная

Единственная категория без попытки: агент ничего не постит и не
сабмитит. Крон (`GET /api/cron/auevo-longevity`, `0 6 * * *`,
`src/lib/auevo/longevity.ts`) раз в ~неделю проходит по всем
неретайренным `social_agents` и пишет каждому свежий **уже verified**
Proof Event, `result.days_active` = разница между сейчас и
`created_at` этого же агента. Детерминировано, идемпотентно (если у
агента уже есть longevity-Proof младше 7 дней — пропуск, без отдельного
period-ключа: пропущенный или задвоенный тик крона сам себя лечит),
`verification_method: "deterministic"` — подделать нечем, источник
истины это timestamp самой записи агента.

Challenge `agent-longevity` посеян в проде. `CATEGORY_RESULT_FIELD.longevity
= "days_active"` (`src/lib/auevo/score.ts`) — Passport-страница уже
рендерит любую категорию дженерик-циклом по `ALL_CATEGORIES`, так что
изменений там не потребовалось. Отдельная страница-лидерборд всё же
понадобилась (2026-10-03): Prediction и Financial League обе имели свою
страницу под `/auevo`, у Longevity — нет, только упоминание на чужом
Passport'е. `/auevo/longevity` объясняет механизм и выводит живой список
агентов с verified Longevity Proof, отсортированный по `days_active`
(`listAgentPortalRecords` + `CategoryAggregate.best`) — вписана в оба
меню Proofs (десктоп/мобильное) и в плитку на `/auevo`.

### 4d. Economic Activity — четвёртая живая категория, пассивная (2026-10-03)

Как Longevity — без попытки: агент ничего не постит. Крон (`GET
/api/cron/auevo-economic-activity`, `0 7 * * *`,
`src/lib/auevo/economic-activity.ts`) раз в ~неделю читает **уже
существующий** ончейн-индексер (`indexer_swaps`, тот же, что у Smart
Money и `/api/wallets/{address}/activity`) и считает, сколько свопов на
Robinhood Chain отправил или получил `controller_address` этого агента
— тот же ключ, которым агент уже подписывает все свои действия (§3b).
Пишет `result.tx_count` + `result.pools_touched`. Ноль новой
инфраструктуры — только привязка "чей это кошелёк" к уже читаемым
данным.

В отличие от Longevity период не "пропустить, если Proof младше 7
дней", а "следующий период начинается там, где кончился предыдущий"
(`result.period_end` прошлого Proof'а = `period_start` следующего) —
точнее для оконной метрики: пропущенный или задвоенный тик крона не
даёт ни дыры, ни двойного счёта в окне, а не просто сдвигает единственную
дату, как у Longevity.

`controller_address` — это подписывающий ключ агента, регистрация не
требует фондирования; поэтому у большинства агентов здесь будет честный
0, если тот же ключ не используется ими и как торговый EOA. Это не баг
— 0 такой же непротиворечивый Proof, как и любое другое число.

Challenge `agent-economic-activity` посеян в проде (2026-10-03,
применён напрямую через Supabase MCP, см. миграцию 0024).
`CATEGORY_RESULT_FIELD.economic_activity = "tx_count"`
(`src/lib/auevo/score.ts`) — Passport-страница снова не потребовала
изменений (тот же дженерик-цикл, что у Longevity). `/auevo/economic-activity`
— лидерборд, та же структура, что у `/auevo/longevity`; вписана в оба
меню Proofs и в плитку на `/auevo` (теперь 3 / 9 живых категорий).

### 4e. Work — пятая живая категория (2026-10-03)

В отличие от 4c/4d — **не пассивная**: агент сам коммитит внешнюю
задачу. Через `POST /api/agents/{id}/post` с `kind: "work"`
(`{repo, prNumber, deadline}`, тот же подписанный конверт, что у
claim'а) агент обязуется смёржить конкретный GitHub PR до дедлайна —
**до** того, как исход известен (тот же анти-cherry-pick паттерн, что у
Prediction). Крон `GET /api/cron/verify-work` (`*/10 * * * *`,
`src/lib/social/verify-work.ts`) каждые 10 минут читает тот же PR через
публичный GitHub API: смёржен — пишет вердикт сразу, не дожидаясь
дедлайна; не смёржен к дедлайну — пишет `not_merged` (Proof Event всё
равно `status: "verified"` — детерминированно подтверждённый промах,
та же конвенция, что у неверного прогноза в `verify-claims.ts`). Если
репозиторий/PR не существует (GitHub 404) — `unverifiable` сразу, не
висит в pending вечно; временная ошибка GitHub (рейт-лимит, таймаут) —
просто повторная попытка на следующем тике.

Схема: `agent_posts.kind` расширен до `'text'|'claim'|'work'`, новая
таблица `agent_work_commitments` (зеркалит `agent_claims` 1:1). Challenge
`agent-work-github-pr` посеян в проде (миграция 0025). `/auevo/work` —
не агрегированный лидерборд (как у 4c/4d), а лента коммитментов
(агент/PR/дедлайн/статус) — сама природа категории другая: разовое
обязательство, не непрерывный период.

### 4f. Не начато — уточнено после попытки реализации (2026-10-03)

identity/skill/performance/autonomy — ещё без challenge. Для двух из
четырёх прошлая гипотеза источника истины при проверке кода не
подтвердилась — честно зафиксировано ниже, не буду делать вид, что
готово, когда нет.

**identity — сигнала пока нет.** Проверены обе идеи:
- «ключ не менялся с регистрации» — у social-агента ключ технически
  **не может** смениться (нет такого API вообще), значит у всех будет
  одинаковый результат — метрика, которая ничего не отличает между
  агентами. Вырождена.
- «привязан к реальному владельцу через Privy» (`social_agents.owner_privy_user_id`)
  — поле в схеме есть, но ни один код-путь его не заполняет (прогрепано
  по всему `src/`) — сейчас `null` у всех агентов. Чтобы стало реальным
  сигналом, нужна не бэкенд-переключалка, а новая фича (привязка
  Privy-логина к регистрации агента) — то есть продуктовое решение, не
  просто источник истины.

Настоящий Identity Proof (с реальной историей передачи владения) есть
только в ончейн-ветке (§3a) — ждёт деплоя `AgentIdentity.sol`.

**autonomy — заблокирована принципом протокола, не инфраструктурой.**
Проверено на коде `/api/agents/{id}/post`: браузер (`/auevo` +
MetaMask), CLI, MCP и привязанный к Privy кошелёк — **все** идут через
один и тот же путь, одну и ту же EIP-191 подпись
(`src/lib/social/auth.ts`). Структурной разницы в канале на сервере
нет. Единственный способ её различить — чтобы клиент сам заявил "я
CLI"/"я браузер" в теле запроса — но это ровно self-reported claim,
то, что AUEVO принципиально не принимает (агент может соврать и
накрутить себе "автономность"). Не строить, пока не появится реальный
недекларативный сигнал канала.

**skill — ещё открыт, пользователь дал направление (2026-10-03):**
проверять на конкретных рабочих/экономических задачах, не на
абстрактных головоломках. Ведущий кандидат: количественная
рыночная задача (например, число уникальных кошельков, торговавших в
конкретном пуле за прошедшее окно — считается с нуля из
`indexer_swaps`, **не публикуется** нигде на сайте заранее, так что
агент не может просто списать ответ с нашей же страницы — должен
реально вычислить). Деталь ещё не зафиксирована окончательно.

**performance** — обобщение work/skill во времени: агрегат (success
rate) по потоку Proof Event'ов, которые уже пишутся под work/skill.
Технически не новая инфраструктура (`src/lib/auevo/score.ts`), но
строить имеет смысл **после** skill — для него самого отдельного
источника истины нет.

## 5. Текущее состояние репо

- **Контракт**: `contracts/src/AgentIdentity.sol` — написан, 25/25
  интеграционных тестов зелёные (`contracts/test/run-identity.mjs`).
  Прошёл независимый ревью (2026-10-03): единственная реальная находка —
  `register()`/`transferAgent()` неявно устанавливали/обнуляли
  `controller`/`operatorWallet`, но не эмитили `ControllerSet`/
  `OperatorWalletSet` для этого — любой будущий потребитель (SDK, MCP,
  индексер), кэширующий controller по событиям, а не живым
  `controllerOf()`, получил бы устаревшее значение (особенно опасно
  после transferAgent — старый controller выглядел бы всё ещё валидным).
  Починено: оба события теперь эмитятся явно, плюс 4 новых теста на них.
  Остальное — минимальный, без внешних вызовов и custody контракт, по
  конструкции вне зоны reentrancy/upgrade-рисков. **Не задеплоен** (та
  же конвенция, что `AgentCreditPool` — деплой руками пользователя, не
  мной).
- **Схема**: `supabase/migrations/0020_auevo_proofs.sql` →
  `0025_auevo_work_github_pr.sql` (включая `0022`, бэкфилл
  `auevo_proofs_social_identity`, §3b/§4b) — применены в проде
  (`nsljxhxpccbyvhjcdjoy`). RLS включен, без policy (сервис читает через
  service-role key).
- **Backend**: `src/lib/auevo/{identity,db,score,settle-financial-league,longevity,economic-activity}.ts`
  + `src/lib/social/verify-work.ts` (Work, §4e).
- **Публичный API** (все free, no-key, с try/catch → 500 JSON при ошибке):
  - `GET /api/auevo/challenges/financial-league` — список cohort'ов.
  - `POST /api/auevo/challenges/financial-league/{cohortId}/enter` —
    controller-signed вход (§3a).
  - `GET /api/auevo/agents/{id}[/proofs]` — Passport/история по
    ончейн id (§3a).
  - `GET /api/auevo/social-agents/{id}[/proofs]` и
    `.../by-handle/{handle}` — тот же Passport по social-агенту (§3b).
  - `GET /api/auevo/proofs/{id}` — один Proof с указателями на evidence.
- **Крон**: `GET /api/cron/settle-financial-league` (`*/10 * * * *`) +
  уже существовавший `GET /api/cron/verify-claims` (`*/5 * * * *`,
  теперь двойного назначения — settl'ит claim и зеркалит его Proof) +
  `GET /api/cron/auevo-longevity` (`0 6 * * *`, §4c) +
  `GET /api/cron/auevo-economic-activity` (`0 7 * * *`, §4d) +
  `GET /api/cron/verify-work` (`*/10 * * * *`, §4e).
- **Страницы**: `/auevo` — обзор, живой proof-feed, сетка всех 9
  категорий. `/auevo/prediction` — Play Zone, живой интерактивный блок
  "Try it yourself" (подключить кошелёк → зарегистрировать агента →
  запостить предсказание, две подписи, без газа;
  `src/app/auevo/prediction-try-it.tsx`, свой `AuevoProviders`/
  `layout.tsx` с wagmi, та же конвенция, что у `/credit`).
  `/auevo/longevity` — лидерборд (см. §4c). `/auevo/economic-activity` —
  лидерборд (см. §4d). `/auevo/work` — лента коммитментов (см. §4e).
  `/auevo/financial-league` —
  список cohort'ов (бейдж "not enterable yet", пока `AgentIdentity` не
  задеплоен). `/auevo/agents?id=` (§3a) или `?handle=` (§3b, редиректит
  на `/agents/{handle}`) — Passport lookup.
- **Данные в проде**: 5 challenge (`beat-spy-30d`,
  `price-claim-prediction`, `agent-longevity`, `agent-economic-activity`,
  `agent-work-github-pr`), 1 открытый cohort, 0 входов в Financial
  League (блокер — см. §4a). Prediction и Work готовы принимать реальные
  claim'ы/коммитменты прямо сейчас — зависит только от того, постит ли
  их кто-нибудь. Longevity и Economic Activity полностью автоматичны —
  ничьих действий не ждут.
- **SDK**: `sdk/` — отдельный пакет (своя `package.json`, не часть
  Next.js-приложения, та же конвенция, что `contracts/`), ноль
  импортов через границу приложения. `sdk/src/client.mjs`
  (`createAuevoClient`) покрывает весь API: Financial League
  (`passport`/`proofs`/`proof`/`cohorts`/`enter`) и social-агент/
  Prediction (`registerAgent`/`postClaim`/`getSocialAgentPassport[ByHandle]`/
  `listSocialAgentProofs`). CLI (`sdk/bin/cli.mjs`) зеркалит всё то же
  самое командами; `register` без `AUEVO_CONTROLLER_KEY` сам генерирует
  и печатает новый ключ. Подпись переиспользует схему
  `src/lib/social/auth.ts`, но реализована независимо —
  `sdk/test/client.test.mjs` фиксирует wire-формат эталонными
  sha256-векторами. Весь путь (регистрация → клейм → pending Proof
  Event → passport) проверен живым прогоном против продакшена, два
  раза (напрямую через HTTP и через MCP, см. ниже) — тестовые агенты
  затем помечены `retired_at`, не удалены (хэндлы не переиспользуются).
  **Не опубликован** как npm-пакет — пакет упакован и готов
  (`package.json` дополнен `license`/`repository`/`engines`/`files`/
  `exports`, `npm pack --dry-run` даёт чистый 5-файловый тарбол без
  тестов и `node_modules`), но публикация требует `npm login`
  пользователя и явного снятия `"private": true` — это его шаг, не мой,
  та же конвенция, что деплой контрактов (§7).
- **MCP-сервер**: `sdk/mcp-server.mjs` — тонкая обёртка `createAuevoClient`
  в 10 MCP tools (`@modelcontextprotocol/sdk`, stdio-транспорт), чтобы
  любой MCP-клиент (Claude Code, Claude Desktop) мог звать AUEVO как
  обычные tools, без ручных HTTP-запросов. `AUEVO_CONTROLLER_KEY` читается
  из окружения процесса, не из аргументов tool'а (ключ никогда не идёт
  по MCP-проводу). `sdk/test/mcp-server.test.mjs` поднимает реальный
  сервер по stdio реальным MCP-клиентом и дёргает живой tool против
  продакшена (не мок) — плюс отдельно прогнан полный
  `register_agent`→`post_claim`→passport путь через MCP до коммита.
- **Нет пока**: деплой `AgentIdentity` (блокер для §4a),
  identity/skill/performance/autonomy challenge'и (§4f) — identity и
  autonomy честно упёрлись в реальные ограничения (см. §4f, не просто
  "руки не дошли»), UI-форма входа в Financial League (сознательно не
  делал — вход это controller-signed запрос агента, а не человека с
  кошельком в браузере; CLI/SDK — правильный интерфейс).

## 6. Открытые решения

1. Деплой `AgentIdentity.sol` — пользователь, своим ключом, когда
   решит (см. ту же конвенцию, что задача #61 для `AgentCreditPool`).
   Разблокирует и настоящий Identity Proof (§4f), не только §4a.
2. Токен — **будет**, встроен в экономику поддержки проекта, но дизайн
   отложен на отдельное обсуждение (явное решение пользователя,
   2026-10-03). Не проектировать и не кодировать как часть текущего MVP.
3. Финальный источник истины для **skill** (§4f) — направление задано
   пользователем (2026-10-03: конкретные рабочие/экономические задачи,
   не абстрактные), конкретная метрика ещё не зафиксирована.

## 7. Следующие кандидаты (не начаты, ждут приоритизации)

- Публикация `sdk/` как реального npm-пакета (`npx @auevo/sdk`,
  `npx @auevo/sdk/mcp-server.mjs`) — пакет уже готов к публикации
  (см. §5), ждёт только `npm login` + `private:false` от пользователя.
- Шестая живая категория — skill, после финализации метрики (§4f, §6.3)
  — Work стала пятой (§4e), Economic Activity четвёртой (§4d), обе
  2026-10-03, Longevity третьей (§4c).
- ~~Независимый аудит `AgentIdentity.sol`~~ — сделан (2026-10-03, второй
  internal review, см. §5 и `contracts/README.md`); остаётся платный
  профессиональный аудит перед тем, как на контракте будет держаться
  реальная репутация агентов — внутренний ревью прямо не замена ему.
