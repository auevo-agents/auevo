# Auevo RWA — ТЗ на перестройку

> Для Claude Code. Читай этот файл целиком перед работой. Работай по фазам, в конце каждой — сборка, тесты, короткий отчёт и коммит в ветку `rwa/<фаза>`.
> Перед написанием кода прочитай `AGENTS.md`: это Next.js 16, API отличается от привычного — сверяйся с `node_modules/next/dist/docs/`.

## 1. Цель

Перестроить Auevo из мемкоин-терминала в **маркетплейс + сканер токенизированных реальных активов (RWA)**: акции, ETF, золото, трежерис, private credit.

Два слоя:

1. **Витрина (как hyperdex.app)** — каталог всех RWA-токенов от всех эмитентов и сетей, страница актива, своп/бридж, корзины, пулы, ставки лендинга, эмитенты, эксплорер, портфель.
2. **Сканер (чего у HyperDex нет, наше преимущество)** — премия/дисконт к реальной цене акции, арбитраж между эмитентами, риск-скоринг контрактов эмитента, глубина ликвидности, smart money по акциям, новые листинги, алерты.

Стартовая сеть — **Robinhood Chain (4663)**, затем мультичейн через агрегатор.

## 2. Референс: как устроен HyperDex (исследовано 2026-09-26)

- **Swap & Bridge:** всё через прокси к LI.FI (`/api/lifi/v1/chains`, `/api/lifi/v1/tokens?chains=...`). 68 сетей. Маршруты: Relay, Across, Kyberswap, Jupiter, DFlow, Nordstern Finance. Маршруты помечены «Best Return» / «Fastest», квоты обновляются ~раз в минуту. Комиссия 0.50% с входного токена.
- **Assets:** 226 активов, 12 эмитентов. Категории: Stocks 179, ETFs 34, Commodities 7, Private Credit 3, Treasuries 3. Блоки: Most Traded (24h vol), Top Assets (mkt cap), Most Available (эмитенты × сети). Таблица с фильтром по эмитенту и категории, пагинация.
- **Страница актива** (`/assets/NVDA`): цена, график 1W/1M/3M/1Y, селектор «эмитент · сеть», своп-карточка (USDG → NVDA на Robinhood Chain), onchain mkt cap, 24h vol, список всех токенов тикера (bStocks/BNB, Coinbase/Base, Ondo/ETH/HyperEVM/Solana, Robinhood/Robinhood Chain, xStocks/BNB/ETH/HyperEVM/Solana), описание эмитентов, дисклеймер.
- **Суффиксы эмитентов:** Ondo `NVDAon`, xStocks `NVDAx`, Robinhood — просто `NVDA` (Robinhood Chain), Coinbase `NVDAc` (Base), bStocks `NVDAB` (BNB). Прочие: Tether XAUT, Paxos PAXG, Maple syrupUSDC/USDT, USD.AI sUSDai, Ethena USDtb, Theo thBILL, Backed bCSPX, Ondo USDY.
- **Baskets:**
  - *Index* — Reserve DTF, один ERC-20 на корзину, mint/redeem ончейн. 18 шт., TVL ~$22M. Квоты: Reserve mint, 2 агрегатора, CoW Swap, PancakeSwap X. Без комиссии HyperDex.
  - *Automated* — через Glider (`/data/glider-baskets.json`: id, slug, name, description, chainId, oneYearReturn, investors, rebalanceHours, holdings[{address, chainId, symbol, decimals, weight}]). Личный аккаунт на пользователя, ребаланс по расписанию, 0.5% за каждый своп.
  - *Strategy* — просто список акций с весами, нет токена: клиент делает N отдельных свопов (N подписей). Веса: target / equal / свои слайдеры. Продажа 25/50/100%.
- **Pools:** 199 пулов Uniswap v4 на Robinhood Chain и Base, пары акций к **USDG**. Ликвидность ~$9.7M, объём 24h ~$8.9K. Fee APR = дневные комиссии × 365 / ликвидность.
- **Lend:** обёртка над Kamino (Solana), рынки xStocks / STRCx / Sentora. Supply, Borrow, Multiply. Без комиссии.
- **Explorer:** лог всех своих свопов/бриджей со статусами Pending / Done / Partial / Refunded / Failed. Реальный объём у них мизерный (40 транзакций, ~$2.3K) — ниша пустая.
- **Private swaps** — НЕ делаем (регуляторный риск).

## 3. Текущее состояние репо (что есть)

- Одна сеть: Robinhood Chain 4663 (`src/lib/chains.ts`, `src/lib/wagmi.ts`), wagmi 3 + viem 2, свой connect-button.
- Свопы: Uniswap **V3** SwapRouter02 `exactInputSingle`, только один хоп (`src/lib/uniswap.ts`, `src/app/app/swap-panel.tsx`). **v4 нет, USDG нет → акции на Robinhood Chain сейчас купить нельзя. Это блокер №1.**
- Данные рынка: GeckoTerminal (`src/lib/geckoterminal.ts`, network `robinhood`).
- Индексер: V3 `PoolCreated` + `Swap` в Supabase (`src/lib/indexer/*`, `supabase/migrations/0001_indexer.sql`), крон раз в сутки (`vercel.json`).
- Аналитика кошельков (`wallet-pnl.ts`, `wallet-positions.ts`, `indexed-smart-money.ts`) — всё в WETH, предполагает пары к WETH.
- Токен-сканер `src/lib/token-security.ts` + `src/lib/evm/*` (bytecode, proxy, capabilities, holders, Blockscout, GoPlus, QuickIntel).
- `contracts/src/DcaVault.sol` + `TwapOracle.sol` — написан, тесты есть, **не задеплоен, не аудирован**.
- Лишнее для RWA: `/fees` + `/api/scan` + `bot-fees.ts` (Solana), `/trade` (Jupiter), `/app/launch`, `/app/otc`, constellation map. Главная `/` редиректит на `/fees`.

## 4. Принципы

- Некастодиально: пользователь подписывает всё сам, мы не держим средства.
- Ничего не выдумывать: адреса контрактов (Uniswap v4 PoolManager / V4Quoter / UniversalRouter / Permit2 / StateView на 4663, USDG, адреса стоков) брать из официальных источников (Uniswap `deployments/4663.md`, Blockscout, токен-листы эмитентов) и указывать источник комментарием, как уже сделано в `uniswap.ts`.
- RPC-ключи только на сервере (см. комментарий в `wagmi.ts`).
- Всё новое покрывать vitest-тестами там, где есть логика (котировки, премия, скоринг, PnL).
- Не ломать существующее: старые мемкоин-разделы убираем из навигации, но код удаляем только в фазе 0 и только то, что перечислено.
- Геоблок и дисклеймеры: токенизированные акции недоступны резидентам США и санкционных стран — баннер + блок торговли по гео (Vercel `x-vercel-ip-country`), дисклеймер на каждой странице актива, «не инвестиционный совет».

## 5. Модель данных (Supabase, новая миграция `0002_rwa.sql`)

- `rwa_issuers` — id, name, suffix, website, description, backing_note.
- `rwa_underlyings` — ticker (PK, напр. NVDA), name, category (`stock|etf|commodity|treasury|private_credit`), exchange, reference_source.
- `rwa_tokens` — chain_id, address, underlying_ticker, issuer_id, symbol, decimals, is_proxy, verified, first_seen_block, logo_url. PK (chain_id, address).
- `rwa_prices` — token ref, price_usd, reference_price_usd, premium_bps, liquidity_usd, volume_24h_usd, mkt_cap_usd, ts. (Храним снапшоты для графиков премии.)
- `rwa_risk` — token ref, admin_address, upgradeable, can_pause, can_blacklist/freeze, can_force_transfer/burn, mint_role_holders, score 0–100, checked_at, raw jsonb.
- `rwa_pools` — chain_id, pool_id/address, dex (`uniswap_v3|uniswap_v4`), token0, token1, fee, tick_spacing, hooks, liquidity_usd, volume_24h_usd.
- `baskets` — id, kind (`strategy|index|automated`), name, description, chain_id, holdings jsonb [{token, weight}], source (`auevo|reserve|glider`), one_year_return.
- `app_transfers` — наш эксплорер: user, src/dst chain+token+amount, route, tx hashes, status, usd_value, created_at.
- `alerts` — user (адрес), type (`premium|listing|whale|price`), params jsonb, channel (пока web/telegram-заглушка).
- Индексер: расширить `indexer_pools`/`indexer_swaps` полем `dex` и `pool_id bytes32` для v4.

RLS: публичное чтение для каталоговых таблиц, запись только service role.

## 6. Структура разделов (роуты)

Витрина (публично):
- `/` — лендинг: «Every tokenized stock. Every issuer. Scanned.» Блоки: живые топы, сканер-превью (топ премий/дисконтов), корзины, эмитенты.
- `/app/assets` — каталог (фильтры эмитент/категория/сеть, сортировки, Most Traded / Top / Most Available) **+ колонки сканера: premium %, risk score, глубина $10K**.
- `/app/assets/[ticker]` — страница актива: график токена поверх графика реальной акции, матрица «эмитент × сеть» с ценой, премией, ликвидностью, риск-скором и кнопкой Trade у каждой строки; своп-карточка; холдеры; сделки; smart money по этому тикеру; описание эмитентов; дисклеймер.
- `/app/swap` — Swap (одна сеть) / Bridge (кросс-чейн), сравнение маршрутов Best Return / Fastest, трекинг статуса.
- `/app/baskets` — Strategy / Index / (Automated позже).
- `/app/pools` — список v4/v3 пулов с RWA, liquidity, volume, fee APR.
- `/app/lend` — ставки supply/borrow по RWA (read-only агрегатор, депозит — позже).
- `/app/issuers` — эмитенты с метриками.
- `/app/explorer` — наши транзакции.
- `/app/portfolio` — RWA-портфель кошелька в USD.

Сканер:
- `/app/scanner` — главный экран сканера, вкладки:
  - **Premium** — все токены, отсортированные по |премии| к реальной цене; фильтр «только в торговые часы».
  - **Arbitrage** — пары токенов одного тикера у разных эмитентов/сетей с максимальным спредом, с учётом глубины и оценки стоимости бриджа.
  - **Risk** — риск-скоринг контрактов.
  - **Liquidity** — сколько можно купить/продать на $1K/$10K/$100K при проскальзывании ≤1%.
  - **New** — новые RWA-токены и пулы (из индексера).
  - **Smart Money** — кошельки, накапливающие акции; крупные сделки.
- Алерты: подписка на премию > X, новый листинг тикера, крупная сделка.

Сайдбар (`src/app/app/sidebar.tsx`) — пересобрать под эти разделы. Старые мемкоин-разделы убрать из навигации.

## 7. Фазы

### Фаза 0 — чистка и каркас (0.5–1 день)
- Убрать из навигации `/fees`, `/trade`, `/app/launch`, `/app/otc`, constellation map. `/` больше не редиректит на `/fees` — временный лендинг.
- Solana-сканер комиссий переносим под `/legacy/fees` (не удаляем), в sitemap не включаем.
- Новый сайдбар со всеми разделами из п.6; пустые разделы — существующий `coming-soon.tsx`.
- Геобаннер + дисклеймер-компонент.
- ✅ Готово когда: `npm run build` и `npm test` зелёные, навигация новая, старые страницы не в меню.

### Фаза 1 — реестр активов и цены (2–4 дня)
- Миграция `0002_rwa.sql` (п.5).
- Сид эмитентов (12 из п.2) и базовых тикеров.
- Сборщик токенов `src/lib/rwa/registry.ts` + крон `/api/cron/rwa-registry`:
  - Robinhood Chain: собрать все сток-токены (токен-лист / Blockscout / пулы v4 к USDG). Известные примеры для проверки (сверить на Blockscout): NVDA `0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec`, TSM `0x58ffe4a942d3885baa22d7520691f611ef09e7aa`.
  - Остальные сети/эмитенты: LI.FI `GET https://li.quest/v1/tokens?chains=...` + сопоставление по суффиксам эмитентов (п.2) и allowlist. Сомнительные — `verified=false`, в UI не показывать.
- Референсная цена базовой акции `src/lib/rwa/reference-price.ts`: сначала Chainlink/Pyth фиды где есть, иначе внешнее API котировок (ключ в env, абстракция провайдера, кэш). Если источника нет — premium = null, не выдумывать.
- Утилита торговой сессии NYSE (`src/lib/rwa/market-hours.ts`): открыто/закрыто/pre/post, праздники, тесты.
- Крон цен/ликвидности каждые 5 мин (GeckoTerminal для пулов + референс) → `rwa_prices`.
- ✅ Готово когда: в таблице есть все токены Robinhood Chain + крупные эмитенты на ETH/BNB/Base/Solana, у каждого цена и (где возможно) премия; тесты на сопоставление тикеров и market-hours.

### Фаза 2 — торговля на Robinhood Chain через Uniswap v4 (3–5 дней) — БЛОКЕР, приоритет №1
- `src/lib/uniswap-v4.ts`: адреса v4 на 4663 из официального деплоя; поиск пулов (PoolKey: currency0/1, fee, tickSpacing, hooks) через индексер/StateView; котировки через V4Quoter.
- Исполнение через UniversalRouter + Permit2 (approve Permit2 один раз, подпись permit, команда V4_SWAP). Поддержать мультихоп ETH → USDG → STOCK и STOCK → USDG.
- SwapPanel: выбирает лучший из v3 и v4 маршрутов; показывает min received, price impact, комиссию, предупреждение вне торговых часов.
- Платформенная комиссия (env `AUEVO_FEE_BPS`, по умолчанию 30 bps, адрес `AUEVO_FEE_RECIPIENT`) — взимается с входного токена отдельной командой роутера (PAY_PORTION/transfer), прозрачно видна в квоте.
- Запись каждой сделки в `app_transfers`.
- ✅ Готово когда: на форке/мейннете с малой суммой проходит покупка и продажа NVDA за USDG и за ETH; unit-тесты на кодирование команд и расчёт minOut.

### Фаза 3 — витрина: Assets, страница актива, Issuers (3–5 дней)
- `/app/assets`, `/app/assets/[ticker]`, `/app/issuers` по п.6.
- Графики — существующий lightweight-charts; наложение референсной цены второй линией.
- Кнопка Trade в матрице эмитентов: для Robinhood Chain — наш SwapPanel, для остальных — Bridge-флоу из фазы 4 (до её готовности — внешняя ссылка/disabled).
- ✅ Готово когда: каталог и страница NVDA показывают все токены тикера с ценами и премией, покупка на Robinhood Chain работает со страницы.

### Фаза 4 — Swap & Bridge через LI.FI (3–4 дня)
- Серверный прокси `/api/lifi/*` (ключ и integrator на сервере), `integrator=auevo`, `fee` = `AUEVO_FEE_BPS`.
- Мультичейн wagmi: Ethereum, Base, BNB, Arbitrum, HyperEVM + Robinhood Chain; Solana — через LI.FI с Solana-кошельком (можно отложить в конец фазы).
- UI как у HyperDex: список маршрутов с метками Best Return / Fastest, автообновление квоты ~60с, оверлей шагов (approve → send → bridge → receive) со ссылками на эксплореры, статусы через LI.FI `/status`.
- `/app/explorer` на основе `app_transfers`.
- ✅ Готово когда: бридж USDC Base → USDG Robinhood Chain и покупка NVDAx на Solana/NVDAon на BNB работают из UI, статус отслеживается до конца.

### Фаза 5 — сканер (4–6 дней)
- **Risk-скоринг** `src/lib/rwa/risk.ts` на базе `evm/proxy.ts`, `evm/capabilities.ts`, `evm/bytecode.ts`: админ прокси (EIP-1967), роли (AccessControl `hasRole`, owner), селекторы pause/blacklist/freeze/forceTransfer/burnFrom/mint, кто держит MINTER_ROLE. Формула прозрачная, веса в конфиге, в UI — расшифровка «почему такой скор». Это НЕ «скам-скор», а «насколько эмитент может вмешаться в ваш токен».
- **Liquidity depth**: для каждого токена квота на $1K/$10K/$100K → price impact.
- **Premium / Arbitrage**: таблицы из `rwa_prices`, спред между токенами одного тикера за вычетом оценки стоимости маршрута LI.FI.
- **New listings**: индексер ловит новые v4 пулы с USDG и новые токены из реестра.
- `/app/scanner` со вкладками из п.6 + колонки сканера в `/app/assets`.
- ✅ Готово когда: все вкладки работают на живых данных, у каждого скора есть объяснение, тесты на скоринг и арбитражный расчёт.

### Фаза 6 — индексер v4 и smart money по акциям (3–5 дней)
- Индексер: события `Initialize` и `Swap` v4 PoolManager (один контракт) на 4663, поле `dex`, `pool_id`.
- Обобщить котируемую ногу: WETH → любая из {USDG, USDC, WETH}, PnL и позиции в USD (`wallet-pnl.ts`, `wallet-positions.ts`, `indexed-smart-money.ts`) — без поломки текущих тестов, новые тесты.
- Атрибуция трейдера: для v4 через UniversalRouter recipient/tx.from (проверить, как сейчас сделано в `indexed-smart-money.ts`).
- Крон индексера — каждые 5 мин (Vercel cron или внешний).
- Smart Money вкладка + блок на странице актива; `/app/portfolio` в USD.
- ✅ Готово когда: лидерборд по акциям и портфель кошелька в USD считаются из индексера.

### Фаза 7 — корзины (4–7 дней)
- **Strategy baskets** (свои, `source=auevo`): JSON/таблица корзин (темы: Mag7, AI chips, энергетика, investor trackers — веса брать из публичных 13F только с указанием источника/даты). Веса target / equal / custom слайдеры. **Покупка одной транзакцией** через UniversalRouter (несколько V4_SWAP в одном execute) — главное улучшение против HyperDex (у них N подписей). Продажа 25/50/100%. Если одна нога без маршрута — исключить её и перераспределить.
- **Index baskets**: интеграция Reserve DTF (чтение состава, NAV, mint/redeem или покупка через агрегатор) на сетях, где они есть. Показать NAV vs рыночная цена — ещё одна сканер-метрика.
- **DCA**: адаптировать `DcaVault` под USDG + v4 (или UniversalRouter), recurring buy акции/корзины. **Деплой в мейннет только после внешнего аудита** — до этого только testnet/форк и UI за фичефлагом.
- Automated (ребалансируемые аккаунты) — не делаем в этой итерации.
- ✅ Готово когда: покупка корзины из 5–10 акций одной подписью работает на Robinhood Chain.

### Фаза 8 — пулы, лендинг, алерты (по мере сил)
- `/app/pools`: список RWA-пулов v3/v4 с liquidity/volume/fee APR (формула HyperDex). Добавление ликвидности v4 — позже.
- `/app/lend`: read-only таблица ставок (Kamino xStocks рынки через их публичный API + лендинги на Robinhood Chain, если появятся). Депозиты — позже.
- Алерты: веб-уведомления + Telegram-бот (премия > X, новый листинг, крупная сделка по тикеру).

## 8. Env (добавить в `.env.example`)

```
LIFI_API_KEY=
AUEVO_FEE_BPS=30
AUEVO_FEE_RECIPIENT=
REFERENCE_PRICE_PROVIDER=      # chainlink|pyth|<api>
REFERENCE_PRICE_API_KEY=
RPC_ETHEREUM= RPC_BASE= RPC_BSC= RPC_ARBITRUM= RPC_HYPEREVM=
SOLANA_RPC_URL=
```

## 9. Чего не делать

- Private swaps / миксеры.
- Свои лендинг-контракты и свои automated-vault'ы.
- Деплой DcaVault в мейннет без аудита.
- Хардкод адресов без источника.
- Показ `verified=false` токенов в витрине.
