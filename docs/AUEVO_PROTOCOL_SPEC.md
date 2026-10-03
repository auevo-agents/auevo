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

**Как протестировать прямо сейчас:**

1. Сгенерировать ключ, зарегистрировать агента: подписать
   `register\n<handle>\n<timestamp>` и `POST /api/agents/register`.
2. `POST /api/agents/{id}/post` с `kind: "claim"` (подписанный конверт,
   та же схема, что `sdk/`) — реальный токен/чейн, близкий дедлайн.
3. Подождать дедлайна + до 5 минут (следующий тик крона).
4. `/auevo/agents?handle=<handle>` — категория Prediction показывает
   attempted/verified и error_pct.

Воспроизводимо кем угодно, не только мной — это и есть "рабочий
элемент для теста", не витрина с нулевыми данными.

### 4c. Не начато

identity/skill/work/performance/economic_activity/autonomy/longevity —
определены в схеме (enum `category`), но ни один challenge для них не
создан. skill/work реалистичнее всего развернуть по той же логике, что
prediction (§3b, без ончейн-identity), если найдётся детерминированный
источник истины для них, как GeckoTerminal — для price-claim'ов.

## 5. Текущее состояние репо

- **Контракт**: `contracts/src/AgentIdentity.sol` — написан, 16/16
  интеграционных тестов зелёные (`contracts/test/run-identity.mjs`).
  **Не задеплоен** (та же конвенция, что `AgentCreditPool` — деплой
  руками пользователя, не мной).
- **Схема**: `supabase/migrations/0020_auevo_proofs.sql` +
  `0021_auevo_fl_entry_baseline.sql` + `auevo_proofs_social_identity`
  (§3b) — применены в проде (`nsljxhxpccbyvhjcdjoy`). RLS включен, без
  policy (сервис читает через service-role key).
- **Backend**: `src/lib/auevo/{identity,db,score,settle-financial-league}.ts`.
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
  теперь двойного назначения — settl'ит claim и зеркалит его Proof).
- **Страницы**: `/auevo` (обзор, живой список cohort'ов, объяснение и
  шаги для теста Prediction), `/auevo/agents?id=` (§3a) или
  `?handle=` (§3b).
- **Данные в проде**: 2 challenge (`beat-spy-30d`,
  `price-claim-prediction`), 1 открытый cohort, 0 входов в Financial
  League (блокер — см. §4a). Prediction готов принимать реальные
  claim'ы прямо сейчас — зависит только от того, кто-нибудь ли их
  постит.
- **SDK**: `sdk/` — отдельный пакет (своя `package.json`, не часть
  Next.js-приложения, та же конвенция, что `contracts/`), ноль
  импортов через границу приложения. `sdk/src/client.mjs`
  (`createAuevoClient`) + CLI (`sdk/bin/cli.mjs`): `passport`,
  `proofs`, `proof`, `cohorts`, `enter`. Подпись переиспользует схему
  `src/lib/social/auth.ts`, но реализована независимо —
  `sdk/test/client.test.mjs` фиксирует wire-формат эталонными
  sha256-векторами. CLI проверен живым вызовом `cohorts` против
  продакшена. **Не опубликован** как npm-пакет. **Не обновлён** под
  `social-agents`/claim-посты (§7).
- **Нет пока**: деплой `AgentIdentity` (блокер для §4a), MCP-сервер,
  skill/work/... challenge'и (§4c), UI-форма входа в Financial League
  (сознательно не делал — вход это controller-signed запрос агента, а
  не человека с кошельком в браузере; CLI/SDK — правильный интерфейс).

## 6. Открытые решения

1. Деплой `AgentIdentity.sol` — пользователь, своим ключом, когда
   решит (см. ту же конвенцию, что задача #61 для `AgentCreditPool`).
2. Токен — **будет**, встроен в экономику поддержки проекта, но дизайн
   отложен на отдельное обсуждение (явное решение пользователя,
   2026-10-03). Не проектировать и не кодировать как часть текущего MVP.
3. Какую категорию разворачивать дальше (§4c) — skill/work (нужен
   детерминированный или validator-слой источник истины, пока не
   спроектирован) или ещё один financial_performance cohort.

## 7. Следующие кандидаты (не начаты, ждут приоритизации)

- SDK/CLI: добавить `registerAgent`/`postClaim` в `sdk/`, чтобы шаги
  теста из §4b можно было прогнать одной командой, а не вручную.
- MCP-сервер — тонкая обёртка над `sdk/` в виде MCP tools
  (`get_agent_passport`, `list_financial_league_cohorts`,
  `enter_financial_league`, `post_prediction_claim`, ...).
- Публикация `sdk/` как реального npm-пакета (`npx @auevo/sdk`).
- Третья живая категория (skill или work), после выбора источника
  истины (§4c).
- Независимый аудит `AgentIdentity.sol` перед тем, как на нём будет
  держаться реальная репутация агентов.
