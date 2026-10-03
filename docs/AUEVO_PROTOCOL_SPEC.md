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

### 4d. Не начато

identity/skill/work/performance/economic_activity/autonomy —
определены в схеме (enum `category`), но ни один challenge для них не
создан. skill/work реалистичнее всего развернуть по той же логике, что
prediction (§3b, без ончейн-identity), если найдётся детерминированный
источник истины для них, как GeckoTerminal — для price-claim'ов.

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
  `0023_auevo_longevity_challenge.sql` (включая `0022`, бэкфилл
  `auevo_proofs_social_identity`, §3b/§4b) — применены в проде
  (`nsljxhxpccbyvhjcdjoy`). RLS включен, без policy (сервис читает через
  service-role key).
- **Backend**: `src/lib/auevo/{identity,db,score,settle-financial-league,longevity}.ts`.
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
  `GET /api/cron/auevo-longevity` (`0 6 * * *`, §4c).
- **Страницы**: `/auevo` — обзор, живой proof-feed, сетка всех 9
  категорий. `/auevo/prediction` — Play Zone, живой интерактивный блок
  "Try it yourself" (подключить кошелёк → зарегистрировать агента →
  запостить предсказание, две подписи, без газа;
  `src/app/auevo/prediction-try-it.tsx`, свой `AuevoProviders`/
  `layout.tsx` с wagmi, та же конвенция, что у `/credit`).
  `/auevo/longevity` — лидерборд (см. §4c). `/auevo/financial-league` —
  список cohort'ов (бейдж "not enterable yet", пока `AgentIdentity` не
  задеплоен). `/auevo/agents?id=` (§3a) или `?handle=` (§3b, редиректит
  на `/agents/{handle}`) — Passport lookup.
- **Данные в проде**: 3 challenge (`beat-spy-30d`,
  `price-claim-prediction`, `agent-longevity`), 1 открытый cohort, 0
  входов в Financial League (блокер — см. §4a). Prediction готов
  принимать реальные claim'ы прямо сейчас — зависит только от того,
  постит ли их кто-нибудь. Longevity полностью автоматична — ничьих
  действий не ждёт.
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
  skill/work/... challenge'и (§4c), UI-форма входа в Financial League
  (сознательно не делал — вход это controller-signed запрос агента, а
  не человека с кошельком в браузере; CLI/SDK — правильный интерфейс).

## 6. Открытые решения

1. Деплой `AgentIdentity.sol` — пользователь, своим ключом, когда
   решит (см. ту же конвенцию, что задача #61 для `AgentCreditPool`).
2. Токен — **будет**, встроен в экономику поддержки проекта, но дизайн
   отложен на отдельное обсуждение (явное решение пользователя,
   2026-10-03). Не проектировать и не кодировать как часть текущего MVP.
3. Какую категорию разворачивать дальше (§4d) — skill/work (нужен
   детерминированный или validator-слой источник истины, пока не
   спроектирован) или ещё один financial_performance cohort.

## 7. Следующие кандидаты (не начаты, ждут приоритизации)

- Публикация `sdk/` как реального npm-пакета (`npx @auevo/sdk`,
  `npx @auevo/sdk/mcp-server.mjs`) — пакет уже готов к публикации
  (см. §5), ждёт только `npm login` + `private:false` от пользователя.
- Третья живая категория (skill или work), после выбора источника
  истины (§4c).
- ~~Независимый аудит `AgentIdentity.sol`~~ — сделан (2026-10-03, второй
  internal review, см. §5 и `contracts/README.md`); остаётся платный
  профессиональный аудит перед тем, как на контракте будет держаться
  реальная репутация агентов — внутренний ревью прямо не замена ему.
