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

### 4e. Не начато — варианты источника истины (2026-10-03, предложено, не выбрано)

identity/skill/work/performance/autonomy — определены в схеме (enum
`category`), но ни один challenge для них не создан. Ниже — конкретные
варианты детерминированного (или validator-backed, там где без этого
не обойтись) источника истины для каждой, с привязкой к тому, что уже
есть в репо. Это **не решение**, а материал для §6.3 — какую строить
следующей и как, выбирает пользователь.

**identity** — "verifiable agent provenance" уже частично решена
архитектурно (§3), просто никогда не оформлена как отдельная категория
Proof. Источник истины — не что-то новое, а сама история владения
ключом: on-chain `AgentIdentity` события (`ControllerSet`/
`OperatorWalletSet`/`transferAgent`, §5) или — для social-агента — то,
что один и тот же `controller_address` подписывает все действия агента
с момента регистрации без смены. Proof Event раз в период = "N
подписанных действий, 0 несанкционированных смен ключа" либо "смена
ключа произошла, вот `transferAgent`-событие". Деривация полностью из
данных, которые уже пишутся — ближе всего к Longevity по простоте
(пассивная, крон).

**skill** — нужен детерминированно проверяемый тест с известным
правильным ответом, а не чужое мнение о качестве. Варианты: (а)
фиксированный бенчмарк с ключом ответа (формат как у `prediction`, но
условие — не цена, а заранее закоммиченный хэш правильного решения,
раскрываемый после дедлайна); (б) задача, решение которой само
верифицируется программой (код проходит тест-сьют, SQL-запрос даёт
точный результат на фиксированном датасете). Validator-backed (другие
агенты голосуют) — последний вариант, слабее и противоречит принципу
"не верь заявлению" тем же способом, каким ERC-8004 reputation registry
не годится (см. §3a).

**work** — похоже на skill, но про реально выполненную внешнюю задачу,
не про тест. Источник истины — API стороннего сервиса, который сам
подтверждает завершение: GitHub API (`PR merged` = детерминированный
факт, не мнение), получение бounty/эскроу-транзакции на чейне (receipt
= Proof), статус задачи в баунти-платформе через её публичный API.
Ключевое отличие от skill: here правильность не оценивается, фиксация —
просто "задача была выполнена, вот внешняя запись об этом".

**performance** — обобщение work/skill во времени: не разовое "сделал
задачу", а агрегат (success rate, время выполнения) по потоку
одинаково устроенных микро-задач. Технически — не новая инфраструктура,
а `src/lib/auevo/score.ts`-агрегация над Proof Event'ами, которые уже
пишутся под skill/work; имеет смысл строить **после** skill/work, не
раньше — для него самого нет отдельного источника истины.

**autonomy** — доля действий агента без участия человека. Приблизительный,
но уже доступный сигнал: канал, которым было инициировано действие —
`/auevo` в браузере (подпись руками через MetaMask, человек в контуре)
против CLI/MCP (`sdk/bin/cli.mjs`, `sdk/mcp-server.mjs` — ключ живёт в
окружении процесса, подпись программная, человек не участвует в момент
действия). Это не идеальный сигнал (человек может запускать CLI вручную
на каждое действие), но единственный, что уже различим без новой
телеметрии; более точный вариант потребовал бы явно логировать канал
происхождения запроса, которого сейчас нет ни у одного Proof Event.

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
  `0024_auevo_economic_activity_challenge.sql` (включая `0022`, бэкфилл
  `auevo_proofs_social_identity`, §3b/§4b) — применены в проде
  (`nsljxhxpccbyvhjcdjoy`). RLS включен, без policy (сервис читает через
  service-role key).
- **Backend**: `src/lib/auevo/{identity,db,score,settle-financial-league,longevity,economic-activity}.ts`.
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
  `GET /api/cron/auevo-economic-activity` (`0 7 * * *`, §4d).
- **Страницы**: `/auevo` — обзор, живой proof-feed, сетка всех 9
  категорий. `/auevo/prediction` — Play Zone, живой интерактивный блок
  "Try it yourself" (подключить кошелёк → зарегистрировать агента →
  запостить предсказание, две подписи, без газа;
  `src/app/auevo/prediction-try-it.tsx`, свой `AuevoProviders`/
  `layout.tsx` с wagmi, та же конвенция, что у `/credit`).
  `/auevo/longevity` — лидерборд (см. §4c). `/auevo/economic-activity` —
  лидерборд (см. §4d). `/auevo/financial-league` —
  список cohort'ов (бейдж "not enterable yet", пока `AgentIdentity` не
  задеплоен). `/auevo/agents?id=` (§3a) или `?handle=` (§3b, редиректит
  на `/agents/{handle}`) — Passport lookup.
- **Данные в проде**: 4 challenge (`beat-spy-30d`,
  `price-claim-prediction`, `agent-longevity`, `agent-economic-activity`),
  1 открытый cohort, 0 входов в Financial League (блокер — см. §4a).
  Prediction готов принимать реальные claim'ы прямо сейчас — зависит
  только от того, постит ли их кто-нибудь. Longevity и Economic
  Activity полностью автоматичны — ничьих действий не ждут.
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
  identity/skill/work/performance/autonomy challenge'и (§4e), UI-форма
  входа в Financial League (сознательно не делал — вход это
  controller-signed запрос агента, а не человека с кошельком в
  браузере; CLI/SDK — правильный интерфейс).

## 6. Открытые решения

1. Деплой `AgentIdentity.sol` — пользователь, своим ключом, когда
   решит (см. ту же конвенцию, что задача #61 для `AgentCreditPool`).
2. Токен — **будет**, встроен в экономику поддержки проекта, но дизайн
   отложен на отдельное обсуждение (явное решение пользователя,
   2026-10-03). Не проектировать и не кодировать как часть текущего MVP.
3. Какую категорию разворачивать дальше из оставшихся пяти (§4e) —
   skill/work реалистичнее всего по готовности источника истины, или
   ещё один financial_performance cohort.

## 7. Следующие кандидаты (не начаты, ждут приоритизации)

- Публикация `sdk/` как реального npm-пакета (`npx @auevo/sdk`,
  `npx @auevo/sdk/mcp-server.mjs`) — пакет уже готов к публикации
  (см. §5), ждёт только `npm login` + `private:false` от пользователя.
- Пятая живая категория (skill или work реалистичнее всего), после
  выбора источника истины (§4e) — Economic Activity стала четвёртой
  (§4d, 2026-10-03), Longevity третьей (§4c).
- ~~Независимый аудит `AgentIdentity.sol`~~ — сделан (2026-10-03, второй
  internal review, см. §5 и `contracts/README.md`); остаётся платный
  профессиональный аудит перед тем, как на контракте будет держаться
  реальная репутация агентов — внутренний ревью прямо не замена ему.
