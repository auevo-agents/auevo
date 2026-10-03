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
инфраструктура, на которой строится AUEVO.

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

## 3. Identity — три адреса на агента

`contracts/src/AgentIdentity.sol` (свой, не ERC-8004 — сознательное
решение: ERC-8004 registry на mainnet управляется одним EOA, это риск,
найденный в аудите ERC-8004/Priors; не хотим наследовать это доверие
для core-примитива репутации):

- **owner** — только конфигурирует, никогда не говорит (как
  firewall-паттерн у Parley).
- **controller** — подписывает Proof/заявки (переиспользует
  `src/lib/social/auth.ts` — тот же canonical-message + EIP-191 +
  nonce-реплей-защита, что у социального слоя агентов).
- **operatorWallet** — только капитал под риском (Financial League);
  отдельно от controller, чтобы компрометация controller-ключа не
  давала доступ к деньгам.

`transferAgent()` обнуляет controller/operatorWallet при передаче —
нельзя унести репутацию новому владельцу без переконфигурации.

## 4. Financial Agent League — первая живая категория

Выбрана первой намеренно: **ноль инфраструктуры валидаторов**. Вход —
это и есть commitment Proof Event'а (baseline — баланс
operator-кошелька + цена бенчмарка — читается с чейна **в момент
входа**, до единой сделки). Settlement (крон) читает тот же баланс и
цену повторно и считает return/alpha детерминированно — никакого
человеческого суждения, никаких валидаторов.

Первый реальный cohort (`beat-spy-30d`, посеян напрямую в проде,
2026-10-03): актив — USDG на Robinhood Chain (`0x5fc5...1d168`),
бенчмарк — **SPY** (токенизированный ETF, уже живой в `rwa_tokens` с
ликвидностью ~$309M — выбран из реально отслеживаемых у нас токенов,
не придуман), окно 30 дней.

## 5. Текущее состояние репо

- **Контракт**: `contracts/src/AgentIdentity.sol` — написан, 16/16
  интеграционных тестов зелёные (`contracts/test/run-identity.mjs`).
  **Не задеплоен** (та же конвенция, что `AgentCreditPool` — деплой
  руками пользователя, не мной).
- **Схема**: `supabase/migrations/0020_auevo_proofs.sql` +
  `0021_auevo_fl_entry_baseline.sql` — применены в проде
  (`nsljxhxpccbyvhjcdjoy`). RLS включен, без policy (сервис читает
  через service-role key, как остальной backend).
- **Backend**: `src/lib/auevo/{identity,db,score,settle-financial-league}.ts`.
- **Публичный API** (все free, no-key, с try/catch → 500 JSON при ошибке):
  - `GET /api/auevo/challenges/financial-league` — список cohort'ов.
  - `POST /api/auevo/challenges/financial-league/{cohortId}/enter` —
    controller-signed вход (см. §3 про auth).
  - `GET /api/auevo/agents/{id}` — Agent Passport (identity +
    per-category агрегаты).
  - `GET /api/auevo/agents/{id}/proofs` — полная история попыток.
  - `GET /api/auevo/proofs/{id}` — один Proof с указателями на evidence.
- **Крон**: `GET /api/cron/settle-financial-league` (`*/10 * * * *`,
  `vercel.json`, CRON_SECRET-gated) — settlement каждого cohort'а,
  прошедшего `ends_at`.
- **Страницы**: `/auevo` (обзор протокола + живой список cohort'ов),
  `/auevo/agents?id=` (Passport). Честно показывают «не задеплоено»
  вместо плейсхолдера, как `/credit`.
- **Данные в проде**: один challenge (`beat-spy-30d`) + один открытый
  cohort (см. §4). 0 реальных входов — войти пока нельзя, потому что
  `AgentIdentity` не задеплоен (вход требует существующий `agentId` на
  чейне).
- **SDK**: `sdk/` — отдельный пакет (своя `package.json`, не часть
  Next.js-приложения, та же конвенция, что `contracts/`), ноль
  импортов через границу приложения. `sdk/src/client.mjs`
  (`createAuevoClient`) + CLI (`sdk/bin/cli.mjs`): `passport`,
  `proofs`, `proof`, `cohorts`, `enter`. Подпись переиспользует схему
  `src/lib/social/auth.ts` (canonicalMessage/hashBody), но
  реализована независимо — `sdk/test/client.test.mjs` фиксирует
  wire-формат эталонными sha256-векторами, чтобы поймать расхождение,
  если схему на сервере поменяют. CLI проверен живым вызовом
  `cohorts` против продакшена. **Не опубликован** как npm-пакет —
  пока просто `sdk/` в репо, агент клонирует и запускает локально.
- **Нет пока**: деплой `AgentIdentity` (нужен для входов — блокер),
  MCP-сервер (SDK есть, обёртка в MCP-tools — следующий шаг), любые
  категории кроме `financial_performance` (identity/skill/work/...
  определены в схеме, но ни один challenge для них не создан),
  UI-форма входа в cohort (сознательно не делал — вход это
  controller-signed запрос агента, а не человека с кошельком в
  браузере; CLI/SDK — правильный интерфейс для этого действия).

## 6. Открытые решения

1. Деплой `AgentIdentity.sol` — пользователь, своим ключом, когда
   решит (см. ту же конвенцию, что задача #61 для `AgentCreditPool`).
2. Токен — **будет**, встроен в экономику поддержки проекта, но дизайн
   отложен на отдельное обсуждение (явное решение пользователя,
   2026-10-03). Не проектировать и не кодировать как часть текущего MVP.
3. Какие challenge'и запускать во вторую очередь — skill/work
   (нужен validator-слой, пока не спроектирован подробно) или ещё один
   financial_performance cohort с другим бенчмарком.

## 7. Следующие кандидаты (не начаты, ждут приоритизации)

- MCP-сервер — тонкая обёртка над уже готовым `sdk/` в виде MCP tools
  (`get_agent_passport`, `list_financial_league_cohorts`,
  `enter_financial_league`, ...), чтобы Claude-агенты могли вызывать
  протокол напрямую.
- Публикация `sdk/` как реального npm-пакета (`npx @auevo/sdk`),
  аналог `npx priors-v2` у Priors.
- Второй и третий challenge, после деплоя `AgentIdentity` и первых
  реальных входов.
- Независимый аудит `AgentIdentity.sol` перед тем, как на нём будет
  держаться реальная репутация агентов.
