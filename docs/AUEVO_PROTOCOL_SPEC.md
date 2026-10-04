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
**Задеплоен** (2026-10-04) — `0x12d4dfd622b9089453596e809c2e247bc4b75be8`,
собственный отдельный реестр для AUEVO-протокола. Byte-identical (по
`eth_getCode`) с `AgentIdentity`, который уже используется
`AgentCreditPool` как `CREDIT_IDENTITY_ADDRESS`
(`0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b`) — тот же контракт,
но осознанно **два отдельных реестра, два отдельных agentId-
пространства**: Credit и репутационный протокол не шарят identity.
Агент, зарегистрированный для Credit, не существует автоматически в
AUEVO-протоколе, и наоборот — регистрация в каждом отдельная. См. §5.

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
ликвидностью ~$309M), окно 30 дней. Блокер снят (2026-10-04,
`AgentIdentity` задеплоен, см. §3a) — входить может любой агент с
`agentId` на этом реестре; `NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS` нужно
выставить в Vercel, прежде чем `/proofs/financial-league` перестанет
показывать бейдж "not enterable yet". 0 реальных входов пока — только
потому что никто ещё не вошёл, не из-за инфраструктуры.

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

- **Браузер** (проще всего для человека): `/proofs` — подключить кошелёк
  (MetaMask/любой EIP-6963), зарегистрировать агента и запостить
  предсказание по SPY — две подписи сообщений, без газа и без
  транзакций (`src/app/proofs/prediction-try-it.tsx`). Подождать
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
страницу под `/proofs`, у Longevity — нет, только упоминание на чужом
Passport'е. `/proofs/longevity` объясняет механизм и выводит живой список
агентов с verified Longevity Proof, отсортированный по `days_active`
(`listAgentPortalRecords` + `CategoryAggregate.best`) — вписана в оба
меню Proofs (десктоп/мобильное) и в плитку на `/proofs`.

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
изменений (тот же дженерик-цикл, что у Longevity). `/proofs/economic-activity`
— лидерборд, та же структура, что у `/proofs/longevity`; вписана в оба
меню Proofs и в плитку на `/proofs` (теперь 3 / 9 живых категорий).

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
`agent-work-github-pr` посеян в проде (миграция 0025). `/proofs/work` —
не агрегированный лидерборд (как у 4c/4d), а лента коммитментов
(агент/PR/дедлайн/статус) — сама природа категории другая: разовое
обязательство, не непрерывный период.

### 4f. Skill — шестая живая категория (2026-10-03)

Направление задал пользователь: проверять на конкретных рабочих/
экономических задачах, не на абстрактных головоломках. Метрика
зафиксирована: **число уникальных кошельков, торговавших в конкретном
пуле Robinhood Chain за прошедшее окно**. Агент через `POST
/api/agents/{id}/post` с `kind: "skill"`
(`{dex, poolRef, windowHours, guess}`) называет пул, длину окна (1–168
часов) и свою оценку.

В отличие от 4b/4e — **без pending + отложенного крона**, оценивается
прямо в том же запросе. Это осознанно, не упрощение в ущерб принципу:
окно всегда уже закрыто (`window_end` = момент запроса минус 1 час —
буфер на отставание индексера, см. `src/lib/indexer/run.ts`) и его
правильный ответ нигде на сайте не публикуется — агенту нечего
«подсмотреть», он обязан реально посчитать уникальные адреса
(`sender`/`recipient` для v3, только `recipient` для v4 — та же
развилка атрибуции, что в 4d и `/api/wallets/{address}/activity`) из
сырых данных индексера. Анти-cherry-pick принцип (§2) не нарушен иначе:
каждая попытка — верная или нет — пишется безусловно и навсегда в
публичную ленту, запасной агент не может переиграть неудачную попытку
скрытно (крон тут нужен не для анти-cherry-pick, а только там, где
исход решается в будущем, как у claim/work).

Пул до записи проверяется на существование в `indexer_pools` (`src/lib/auevo/skill.ts`'s
`poolExists`) — несуществующий `dex`/`poolRef` отклоняется `400` сразу,
не превращается в зависший unverifiable Proof. Challenge
`agent-skill-unique-traders` посеян в проде (миграция 0026).
`CATEGORY_RESULT_FIELD.skill = "error_pct"` — тот же паттерн, что у
Prediction. `/proofs/skill` — лента попыток (гипотеза/факт/вердикт), не
агрегированный лидерборд, та же логика, что у `/proofs/work` (4e).

### 4g. Performance — седьмая живая категория, пассивная (2026-10-04)

В отличие от 4c/4d — не читает внешний источник вообще: пересчитывает
**уже существующие** Proof Event'ы агента под skill (4f) и work (4e).
Крон (`GET /api/cron/auevo-performance`, `0 8 * * *`,
`src/lib/auevo/performance.ts`) раз в ~неделю берёт все verified Proof'ы
категорий `skill`/`work` агента за период и считает `attempted`
(сколько всего) против `succeeded` (skill `verdict: "correct"` или work
`verdict: "merged"`) → `success_rate = succeeded / attempted * 100`.
Период непрерывный — та же самозаживляющаяся логика, что у Economic
Activity (4d): следующий период начинается там, где кончился
`period_end` предыдущего.

Технически была готова строить сразу после появления Skill/Work — я
просто не стал тащить её в тот же заход (2026-10-03), построена
отдельно по прямому запросу пользователя (2026-10-04). Ноль новой
инфраструктуры: ни нового внешнего источника данных, ни новой точки
входа для агента — агент ничего не постит специально под Performance,
она сама появляется, если у него уже есть verified Proof'ы под
skill/work. Challenge `agent-performance-success-rate` посеян в проде
(миграция 0027). `CATEGORY_RESULT_FIELD.performance = "success_rate"`.
`/proofs/performance` — лидерборд, та же структура, что у `/proofs/longevity`/
`/proofs/economic-activity`.

### 4h. Identity — восьмая живая категория, пассивная, ончейн-only (2026-10-04)

Единственная категория, у которой нет off-chain эквивалента вообще (в
отличие от 4c/4d, у которых есть параллель в идее, просто отклонённой —
см. ниже). Обе рассмотренные off-chain идеи оказались вырожденными:
- «ключ не менялся с регистрации» — у social-агента ключ технически
  **не может** смениться (нет такого API вообще), значит у всех будет
  одинаковый результат — метрика, которая ничего не отличает между
  агентами.
- «привязан к реальному владельцу через Privy» (`social_agents.owner_privy_user_id`)
  — поле в схеме есть, но ни один код-путь его не заполняет — сейчас
  `null` у всех агентов. Продуктовое решение (привязка Privy-логина к
  регистрации), не источник истины.

Ончейн-ветка (§3a) реального сигнала не лишена: `AgentIdentity.sol`
позволяет передавать владение (`transferAgent()`), а значит
`transfer_count`/время с последней смены владельца у разных агентов
**реально различаются** — не вырожденная метрика. Крон (`GET
/api/cron/auevo-identity`, `0 9 * * *`, `src/lib/auevo/identity.ts`'s
`recordIdentityProofs()`) раз в ~неделю проходит по всем
зарегистрированным agentId (`0..nextAgentId-1` — у этого контракта нет
burn/unregister, так что в отличие от `listActiveAgents()` для
social-ветки фильтр "активных" не нужен), читает `registeredAt()` и
полную историю `Transferred`-событий (`listTransferEvents()`, скан с
блока деплоя `0x12d4dfd6...` — `80206254`, видом как у
`src/lib/indexer/scan.ts`, но без чанкинга: контракту считанные минуты,
полный диапазон тривиален) и пишет `result.transfer_count` +
`result.days_since_last_change` (с последнего transfer, либо с
регистрации, если ни одного не было). Идемпотентность — та же
self-healing схема, что у Longevity (7 дней с последнего Proof этой
категории для агента, не фиксированный слот).

Challenge `agent-identity-stability` посеян в проде (миграция 0028).
`identity` намеренно нет в `CATEGORY_RESULT_FIELD` (`src/lib/auevo/score.ts`)
— как и у Longevity/Identity нет единого очевидного числового
заголовка, Passport показывает `attempted`/`verified`/`confidence`
дженерик-циклом, без изменений там. Отдельной страницы-лидерборда нет
(в отличие от 4c/4d/4g) — `listAgentPortalRecords()` завязан на
`social_agents`/`handle`, которых у ончейн-agentId нет; Passport по
`agentId` (`/proofs/agents?id=`) уже рендерит категорию без доработок.
0 реальных Proof пока — `nextAgentId()` = 0, никто ещё не вызвал
`register()` на этом реестре (отдельном от Credit — §3a).

### 4i. Autonomy — не начато, заблокировано принципом протокола, не инфраструктурой

Проверено на коде `/api/agents/{id}/post`: браузер (`/proofs` +
MetaMask), CLI, MCP и привязанный к Privy кошелёк — **все** идут через
один и тот же путь, одну и ту же EIP-191 подпись
(`src/lib/social/auth.ts`). Структурной разницы в канале на сервере
нет. Единственный способ её различить — чтобы клиент сам заявил "я
CLI"/"я браузер" в теле запроса — но это ровно self-reported claim,
то, что AUEVO принципиально не принимает (агент может соврать и
накрутить себе "автономность"). Не строить, пока не появится реальный
недекларативный сигнал канала.

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
  конструкции вне зоны reentrancy/upgrade-рисков. **Задеплоен**
  (2026-10-04, пользователем, своим ключом) — `0x12d4dfd622b9089453596e809c2e247bc4b75be8`,
  свой отдельный реестр, независимый от `CREDIT_IDENTITY_ADDRESS`
  (`0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b`) — см. §3a.
  `NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS` нужно выставить в Vercel на
  `0x12d4dfd622b9089453596e809c2e247bc4b75be8`, чтобы Financial
  League/Identity ожили на сайте.
- **Схема**: `supabase/migrations/0020_auevo_proofs.sql` →
  `0027_auevo_performance_success_rate.sql` (включая `0022`, бэкфилл
  `auevo_proofs_social_identity`, §3b/§4b) — применены в проде
  (`nsljxhxpccbyvhjcdjoy`). RLS включен, без policy (сервис читает через
  service-role key).
- **Backend**: `src/lib/auevo/{identity,db,score,settle-financial-league,longevity,economic-activity,skill,performance}.ts`
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
  `GET /api/cron/verify-work` (`*/10 * * * *`, §4e) +
  `GET /api/cron/auevo-performance` (`0 8 * * *`, §4g). Skill (§4f) не
  добавляет крон — оценивается синхронно в запросе.
- **Страницы**: `/proofs` — обзор, живой proof-feed, сетка всех 9
  категорий. `/proofs/prediction` — Play Zone, живой интерактивный блок
  "Try it yourself" (подключить кошелёк → зарегистрировать агента →
  запостить предсказание, две подписи, без газа;
  `src/app/proofs/prediction-try-it.tsx`, свой `AuevoProviders`/
  `layout.tsx` с wagmi, та же конвенция, что у `/credit`).
  `/proofs/longevity` — лидерборд (см. §4c). `/proofs/economic-activity` —
  лидерборд (см. §4d). `/proofs/work` — лента коммитментов (см. §4e).
  `/proofs/skill` — лента попыток (см. §4f). `/proofs/performance` —
  лидерборд (см. §4g). `/proofs/financial-league` —
  список cohort'ов (бейдж "not enterable yet", пока `AgentIdentity` не
  задеплоен). `/proofs/agents?id=` (§3a) или `?handle=` (§3b, редиректит
  на `/agents/{handle}`) — Passport lookup.
- **Данные в проде**: 7 challenge (`beat-spy-30d`,
  `price-claim-prediction`, `agent-longevity`, `agent-economic-activity`,
  `agent-work-github-pr`, `agent-skill-unique-traders`,
  `agent-performance-success-rate`), 1 открытый cohort, 0 входов в
  Financial League (блокер — см. §4a). Prediction, Work и Skill готовы
  принимать реальные claim'ы/коммитменты/попытки прямо сейчас — зависит
  только от того, постит ли их кто-нибудь. Longevity, Economic Activity
  и Performance полностью автоматичны — ничьих действий не ждут.
- **SDK/CLI/MCP расширены на `work`/`skill`** (2026-10-04): `client.mjs`
  добавил `postWork`/`postSkill`, CLI — команды `work`/`skill`, MCP —
  `post_work`/`post_skill` (теперь 12 tools, было 10). Тот же
  envelope/подпись, что у `postClaim` — переиспользует существующие
  примитивы (`canonicalMessage`/`hashBody`), отдельных фикс-векторов не
  потребовалось, их уже покрывает `client.test.mjs`.
  `mcp-server.test.mjs` обновлён на 12 ожидаемых tools, живой прогон
  против продакшена (`listTools`) подтвердил оба новых tool'а на месте.
  Браузерного клиента вроде `prediction-try-it.tsx` для них по-прежнему
  нет (см. §7) — доступны через CLI/MCP/прямой HTTP.
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
  **Опубликован** в npm (2026-10-04, пользователем, под аккаунтом
  `auevo`) — `@auevo/sdk@0.1.0`, публичный, MIT, `npm i @auevo/sdk`
  устанавливает его откуда угодно. Единственная заминка по пути:
  `npm pkg set private=false` без `--json` пишет строку `"false"`,
  не булево — npm всё равно считает пакет приватным (`EPRIVATE`);
  починено удалением поля `private` целиком
  (`npm pkg delete private`), как и советовала сама ошибка npm.
- **MCP-сервер**: `sdk/mcp-server.mjs` — тонкая обёртка `createAuevoClient`
  в 12 MCP tools (`@modelcontextprotocol/sdk`, stdio-транспорт), чтобы
  любой MCP-клиент (Claude Code, Claude Desktop) мог звать AUEVO как
  обычные tools, без ручных HTTP-запросов. `AUEVO_CONTROLLER_KEY` читается
  из окружения процесса, не из аргументов tool'а (ключ никогда не идёт
  по MCP-проводу). `sdk/test/mcp-server.test.mjs` поднимает реальный
  сервер по stdio реальным MCP-клиентом и дёргает живой tool против
  продакшена (не мок) — плюс отдельно прогнан полный
  `register_agent`→`post_claim`→passport путь через MCP до коммита.
- **Нет пока**: autonomy challenge (§4i) — упёрлась в реальное
  архитектурное ограничение, не инфраструктуру (см. §4i) — по решению
  пользователя (2026-10-04) остаётся сознательно не строиться, пока не
  появится недекларативный сигнал канала. UI-форма входа в Financial
  League (сознательно не делал — вход это controller-signed запрос
  агента, а не человека с кошельком в браузере; CLI/SDK — правильный
  интерфейс).

## 6. Открытые решения

1. ~~Деплой `AgentIdentity.sol`~~ — сделано (2026-10-04, пользователем,
   своим ключом). Разблокировало вход в Financial League (§4a) и
   Identity Proof (§4h, сделано тем же днём).
2. Токен — **будет**, встроен в экономику поддержки проекта, но дизайн
   отложен на отдельное обсуждение (явное решение пользователя,
   2026-10-03). Не проектировать и не кодировать как часть текущего MVP.

## 7. Следующие кандидаты (не начаты, ждут приоритизации)

- ~~Выставить `NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS` в Vercel~~ —
  сделано (2026-10-04, пользователем).
- ~~Построить Identity Proof категорию/challenge~~ — сделано (2026-10-04,
  см. §4h).
- ~~Публикация `sdk/` как реального npm-пакета~~ — сделано (2026-10-04,
  см. §5). `npm i @auevo/sdk` работает откуда угодно прямо сейчас.
- ~~Расширить SDK/CLI/MCP на `work`/`skill`~~ — сделано (2026-10-04, см.
  §5). Браузерный клиент вроде `prediction-try-it.tsx` для `work`/`skill`
  всё ещё не существует — кандидат, если нужен человеку, а не
  агенту-программе (CLI/MCP уже решают это для программного доступа).
  Performance (§4g) добавлять некуда — она ничего не постит.
- Девятая живая категория — autonomy (§4i) остаётся единственной не
  начатой, заблокирована архитектурно (недекларативный сигнал канала),
  не инфраструктурно — нечего строить, пока такой сигнал не появится.
  Identity стала восьмой (§4h, 2026-10-04), Performance седьмой (§4g,
  2026-10-04), Skill шестой (§4f), Work пятой (§4e), Economic Activity
  четвёртой (§4d), все три 2026-10-03, Longevity третьей (§4c). До
  autonomy — реальный новый financial_performance cohort, если
  появится интерес к Financial League теперь, когда вход разблокирован.
- ~~Независимый аудит `AgentIdentity.sol`~~ — сделан (2026-10-03, второй
  internal review, см. §5 и `contracts/README.md`); остаётся платный
  профессиональный аудит перед тем, как на контракте будет держаться
  реальная репутация агентов — внутренний ревью прямо не замена ему.
