# Техническое задание: WB Bidder

## 1. Статус документа

| Поле | Значение |
|---|---|
| Назначение | Техническое задание на разработку сервиса автоматического управления ставками в кампаниях WB Продвижение |
| Версия | 1.0 |
| Статус | Готово к декомпозиции и оценке разработки |
| Дата актуализации сведений WB API | 27 июля 2026 года |
| Язык продукта и документации | Русский |
| Основной стек | TypeScript, NestJS, Prisma, PostgreSQL |

В документе используются нормативные слова:

- **MUST / ДОЛЖЕН** — обязательное требование;
- **MUST NOT / НЕ ДОЛЖЕН** — запрет;
- **SHOULD / СЛЕДУЕТ** — требование, от которого можно отступить только с документированным обоснованием;
- **MAY / МОЖЕТ** — допустимый вариант реализации.

Сведения о Wildberries, включая методы, лимиты, поля и статусы, должны быть повторно сверены с официальной документацией непосредственно перед началом реализации и перед каждым production-релизом. WB может изменять API независимо от релизов биддера.

## 2. Цель и контекст

Нужно разработать постоянно работающий backend-сервис, который:

1. получает состояние и статистику тысяч рекламных кампаний продавцов;
2. хранит нормализованный снимок данных в PostgreSQL;
3. детерминированно рассчитывает показатели эффективности без ML;
4. принимает объяснимое решение об изменении ставки;
5. ставит решение в надёжную очередь;
6. применяет изменение через WB API с учётом лимитов;
7. повторно читает состояние WB и подтверждает фактическое применение;
8. сохраняет полный аудит входных данных, расчёта, решения и результата.

Бизнес-цель — максимизировать ожидаемую прибыль продавца при соблюдении заданных ограничений риска, бюджета и допустимых ставок.

### 2.1. Важное ограничение бизнес-цели

Выручка не равна прибыли. Одних показов, кликов, заказов, расходов и рекламной выручки недостаточно для расчёта прибыли: необходимы как минимум себестоимость товара и переменные издержки.

Поэтому система ДОЛЖНА поддерживать для каждого артикула WB (`nmId`) модель unit economics:

- ожидаемая доля выкупа;
- цена или ожидаемая выручка с выкупленной единицы;
- себестоимость;
- комиссия WB;
- логистика и обратная логистика;
- налоги;
- другие переменные расходы;
- требуемая минимальная прибыль.

Если полная unit economics отсутствует, система НЕ ДОЛЖНА заявлять, что оптимизирует прибыль. Для такого объекта разрешён только явно выбранный fallback-режим `TARGET_ACOS` или `TARGET_ROAS`. По умолчанию объект без unit economics исключается из автоматического применения ставок.

## 3. Границы продукта

### 3.1. Входит в первую версию

- кампании WB Продвижение типа `9`;
- модели оплаты `cpm` и `cpc`, если конкретная операция поддерживается текущим WB API;
- кампании с типом ставки `manual` и `unified`;
- ставки карточек товаров по месту размещения;
- ставки поисковых кластеров для поддерживаемых WB API кампаний;
- синхронизация кампаний, ставок, минимальных ставок и статистики;
- расчёт метрик и правил без машинного обучения;
- очередь решений в PostgreSQL;
- идемпотентное применение и последующая сверка;
- управление политиками через внутренний REST API;
- три режима WB-интеграции: `mock`, `sandbox`, `prod`;
- отдельный NestJS mock-сервер;
- Docker Compose, логирование, аудит, health/readiness и Prometheus-метрики;
- автоматизированные unit, integration, contract и end-to-end тесты.

### 3.2. Не входит в первую версию

- создание, удаление, запуск, остановка и пополнение бюджета кампаний;
- автоматическое управление минус-фразами;
- управление составом карточек товаров в кампании;
- WB Медиа и календарь акций;
- ML, прогнозирование спроса, multi-armed bandit;
- пользовательский web-интерфейс;
- самостоятельное получение себестоимости из внешней ERP;
- изменение цен и скидок товара;
- попытка обойти или увеличить лимиты WB API.

Эти функции могут быть добавлены позднее отдельным изменением ТЗ.

## 4. Официальные источники WB API

Основной источник — [документация API «Маркетинг и продвижение»](https://dev.wildberries.ru/ru/openapi/promotion).

Дополнительные обязательные источники:

- [общая информация WB API, авторизация, ошибки и rate limits](https://dev.wildberries.ru/ru/openapi/api-information);
- [песочница WB API](https://dev.wildberries.ru/sandbox);
- [ограничения тестового контура](https://dev.wildberries.ru/knowledge-base/articles/019d49a1-24e3-7642-801f-e1f18c5fe708);
- [журнал изменений WB API](https://dev.wildberries.ru/release-notes);

### 4.1. Подтверждённые особенности

По официальной документации на дату актуализации:

- production base URL продвижения: `https://advert-api.wildberries.ru`;
- sandbox base URL продвижения: `https://advert-api-sandbox.wildberries.ru`;
- токен должен иметь категорию «Продвижение»;
- актуальная кампания с единой или ручной ставкой имеет тип `9`;
- `bid_type` принимает `manual` или `unified`;
- `payment_type` принимает `cpm` или `cpc`;
- ставки актуальных методов передаются в копейках;
- информация WB синхронизируется не мгновенно: в документации указаны ориентиры до 3 минут для данных, до 1 минуты для статусов и до 30 секунд для ставок;
- статистика sandbox формируется на искусственных данных и имеет ограничения тестового контура;
- `429 Too Many Requests` требует ожидания по заголовкам WB.

### 4.2. Используемые методы

| Назначение | Метод | Ограничения запроса | Документированный лимит |
|---|---|---|---|
| Списки кампаний | `GET /adv/v1/promotion/count` | все кампании аккаунта, сгруппированные по типу и статусу | 5 запросов/с, интервал 200 мс, burst 5 |
| Подробности кампаний | `GET /api/advert/v2/adverts` | до 50 ID; фильтры `statuses`, `payment_type` | 5 запросов/с, интервал 200 мс, burst 5 |
| Минимальные ставки | `POST /api/advert/v1/bids/min` | 1–100 `nmId`, вид оплаты и размещения | 20 запросов/мин, интервал 3 с, burst 5 |
| Изменение ставки карточки | `PATCH /api/advert/v1/bids` | до 50 элементов; сумма в копейках | 5 запросов/с, интервал 200 мс, burst 5 |
| Текущие ставки кластеров | `POST /adv/v0/normquery/get-bids` | до 100 пар `advert_id` + `nm_id` | 5 запросов/с, интервал 200 мс, burst 10 |
| Изменение ставок кластеров | `POST /adv/v0/normquery/bids` | до 100 ставок; только поддерживаемые кампании | 2 запроса/с, интервал 500 мс, burst 4 |
| Статистика кампаний | `GET /adv/v3/fullstats` | до 50 ID, период до 31 дня, статусы `7`, `9`, `11` | 3 запроса/мин, интервал 20 с, burst 1 |
| Дневная статистика кластеров | `POST /adv/v1/normquery/stats` | до 100 пар, период дат | 10 запросов/мин, интервал 6 с, burst 20 |
| Бюджет кампании | `GET /adv/v1/budget` | один ID кампании | 4 запроса/с, интервал 250 мс, burst 4 |
| Проверка доступности | `GET /ping` | base URL выбранного режима | согласно общей документации |

Точные схемы запросов и ответов не должны копироваться вручную из этого ТЗ. При реализации адаптера они ДОЛЖНЫ быть зафиксированы contract fixtures и сверены с актуальной OpenAPI-документацией.

Устаревшие `GET /adv/v1/promotion/adverts`, `GET /adv/v0/auction/adverts`, `PATCH /adv/v0/bids`, `PATCH /adv/v0/auction/bids` и `POST /adv/v2/fullstats` НЕ ДОЛЖНЫ использоваться.

### 4.3. Семантика мест размещения

- `combined` применяется к кампании с единой ставкой;
- `search` и `recommendations` применяются к кампании с ручной ставкой;
- в методе минимальных ставок значение может называться `recommendation`, а в методе изменения ставки — `recommendations`; адаптер ДОЛЖЕН скрывать это различие за внутренним enum;
- ставки кластеров допустимы только для комбинаций, поддерживаемых соответствующим методом WB; несовместимая кампания должна быть помечена `UNSUPPORTED`, а не отправлена в API.

Статистика кластеров может возвращаться и для `cpc`, но набор полей отличается: показатели, основанные на показах (`views`, `ctr`, `cpm`), могут отсутствовать. Runtime schema и Decision Engine ДОЛЖНЫ считать такие поля опциональными. Метод установки ставки конкретного поискового кластера используется только для ручной ставки и `cpm`, как указано в документации метода.

### 4.4. Денежные единицы и поля статистики

Ставки актуальных bid endpoints передаются в копейках. Это не означает, что все денежные поля всех ответов WB также выражены в копейках: статистические суммы и бюджеты могут иметь другую документированную единицу и десятичный формат.

Адаптер ДОЛЖЕН иметь явную таблицу единиц на уровне `endpoint + field` и конвертировать значение во внутренние minor units через точную decimal-арифметику. Запрещено применять единое слепое умножение ко всем денежным полям.

Минимальная нормализация статистики:

| Поле WB | Внутренняя семантика |
|---|---|
| `views` | показы |
| `clicks` | клики |
| `atbs` | добавления в корзину |
| `orders` | количество заказов/конверсий в семантике WB, не выкупы |
| `shks` | количество заказанных единиц, если поле доступно |
| `sum` или `spend` | расход на продвижение после точной конвертации единиц |
| `sum_price` | атрибутированная сумма заказов, не гарантированная net revenue |
| `canceled` | отмены, если поле доступно |

`orderedUnits` для profit-формулы берётся из `shks`. Если `shks` отсутствует, fallback на `orders` разрешён только с флагом качества `ORDER_COUNT_AS_UNIT_FALLBACK` и отражается в explanation.

## 5. Архитектурные принципы

1. **Модульный монолит.** Первая версия поставляется одним NestJS-приложением bidder и отдельным NestJS-приложением mock server.
2. **PostgreSQL как источник истины.** Очередь, блокировки, снимки и аудит хранятся в одной БД.
3. **Разделение чтения, решения и записи.** Decision Engine не обращается к WB API.
4. **At-least-once + reconciliation.** Сеть не позволяет гарантировать exactly-once; система обеспечивает эффективную идемпотентность через ключ решения и чтение фактического состояния.
5. **Детерминированность.** Одинаковые входные данные, версия политики и конфигурация дают одинаковое решение.
6. **Fail closed.** При устаревших, неполных или противоречивых данных ставка не изменяется.
7. **Объяснимость.** Каждое решение содержит формулы, значения входов, сработавшие ограничения и причину.
8. **Деньги — целые числа.** Ставки и денежные суммы хранятся как `BigInt` в минимальной единице валюты; для ставок WB — копейки. `float` для денег запрещён.
9. **UTC внутри системы.** В БД и API сервиса используется UTC; локальная зона применяется только для календарных политик продавца.

## 6. Компоненты

```text
Scheduler
  ├── Data Sync Worker ──> WB API ──> PostgreSQL snapshots
  └── Decision Engine ──────────────> decision_queue
                                           │
Executor Engine <───────────────────────────┘
  ├── rate limiter
  ├── WB API write
  └── verification read ──> audit/result

Internal REST API ──> policies, unit economics, pause/resume, audit
Observability ──────> logs, /health/live, /health/ready, /metrics
```

### 6.1. NestJS-модули bidder

- `ConfigModule`;
- `DatabaseModule`;
- `WbApiModule`;
- `RateLimitModule`;
- `SchedulerModule`;
- `DataSyncModule`;
- `MetricsCalculationModule`;
- `DecisionModule`;
- `DecisionQueueModule`;
- `ExecutorModule`;
- `ReconciliationModule`;
- `PolicyModule`;
- `UnitEconomicsModule`;
- `AuditModule`;
- `ObservabilityModule`;
- `AdminApiModule`.

Запрещены циклические зависимости модулей. Интеграция с WB должна зависеть от интерфейсов доменного слоя, а не наоборот.

## 7. Полный цикл обработки

### 7.1. Шаг 1. Выбор кампаний

Data Sync Worker ДОЛЖЕН:

1. выбирать активных продавцов с включённой автоматизацией;
2. получать список кампаний;
3. обрабатывать кампании в статусах `9` и `11`, а завершённые `7` — только для дозагрузки статистики;
4. исключать удалённые, отменённые, неподдерживаемые и явно отключённые кампании;
5. разбивать ID на пакеты согласно лимиту метода;
6. обеспечивать fairness: один крупный продавец не должен блокировать остальных;
7. хранить cursor/checkpoint каждой стадии отдельно по продавцу.

### 7.2. Шаг 2. Получение данных

Для каждой кампании синхронизируются:

- метаданные, статус, `bid_type`, `payment_type`;
- карточки и текущие ставки по размещениям;
- минимальные ставки;
- текущие ставки кластеров, если применимо;
- статистика кампаний;
- статистика кластеров, если применимо;
- бюджет кампании, если включён бюджетный guardrail.

Каждая запись данных ДОЛЖНА иметь:

- `sellerId`;
- время бизнес-периода;
- `sourceUpdatedAt`, если оно дано WB;
- `fetchedAt`;
- версию схемы адаптера;
- checksum нормализованного payload;
- идентификатор sync run.

Повторная загрузка одного периода должна быть идемпотентной: используется `upsert` по естественному составному ключу.

### 7.3. Шаг 3. Расчёт метрик

Метрики рассчитываются только из PostgreSQL и сохраняются как версионированный snapshot:

- показы;
- клики;
- CTR;
- CPC;
- CPM;
- добавления в корзину;
- заказы;
- заказанные товары;
- отмены, если поле доступно;
- расход;
- атрибутированная выручка;
- CR click-to-order;
- ACOS;
- ROAS;
- ожидаемая валовая прибыль;
- ожидаемая прибыль после рекламы;
- доля рекламных расходов в доступной марже;
- полнота и свежесть данных.

### 7.4. Шаг 4. Решение

Decision Engine ДОЛЖЕН:

1. получить согласованный snapshot данных и активную версию политики;
2. проверить допуски и свежесть;
3. рассчитать целевую ставку;
4. применить floor, cap, hysteresis, cooldown и ограничение скорости изменения;
5. сформировать `NO_CHANGE`, `INCREASE`, `DECREASE` или `BLOCKED`;
6. сохранить объяснение независимо от наличия изменения.

### 7.5. Шаг 5. Постановка в очередь

Решение с изменением ДОЛЖНО быть вставлено в очередь в той же транзакции, что и его audit record. Публикация во внешний broker в первой версии не требуется.

### 7.6. Шаг 6. Отправка в WB

Executor Engine ДОЛЖЕН:

- забрать решение с lease;
- перечитать актуальность политики и отсутствие более нового решения;
- применить endpoint-specific rate limit;
- сгруппировать совместимые решения в пакет;
- отправить запрос;
- сохранить request metadata и ответ без токена;
- перейти к проверке результата.

### 7.7. Шаг 7. Проверка результата

HTTP `2xx` означает только приём запроса, но не подтверждает окончательное состояние.

Executor ДОЛЖЕН:

1. подождать настраиваемую задержку не меньше ожидаемого окна синхронизации ставки WB;
2. прочитать фактическую ставку актуальным read-методом;
3. сравнить ставку, объект и место размещения;
4. пометить решение `APPLIED`, только если значения совпали;
5. повторять проверку с backoff до предельного окна;
6. при несовпадении пометить retryable failure либо отправить в terminal failure;
7. не отправлять запись повторно, пока неизвестен результат предыдущей отправки; сначала выполнить reconciliation.

## 8. Модель данных PostgreSQL

Имена приведены как нормативная логическая модель. Физическая Prisma-схема может уточнить названия без изменения семантики.

### 8.1. Основные сущности

#### `SellerAccount`

- `id UUID PK`;
- `externalName`;
- `mode MOCK | SANDBOX | PROD`;
- `tokenSecretRef` — ссылка на секрет, не открытый токен;
- `timezone`;
- `currency`;
- `automationEnabled`;
- `createdAt`, `updatedAt`;
- `version` для optimistic locking.

#### `Campaign`

- `id UUID PK`;
- `sellerId FK`;
- `wbCampaignId BIGINT`;
- `type`;
- `status`;
- `bidType MANUAL | UNIFIED | UNKNOWN`;
- `paymentType CPM | CPC | UNKNOWN`;
- `name`;
- `wbChangedAt`;
- `lastSyncedAt`;
- `supported`;
- `unsupportedReason`;
- unique `(sellerId, wbCampaignId)`;
- index `(sellerId, status, supported)`.

#### `CampaignTarget`

Один управляемый объект ставки:

- `id UUID PK`;
- `campaignId FK`;
- `nmId BIGINT`;
- `placement COMBINED | SEARCH | RECOMMENDATIONS`;
- `normQuery TEXT NULL`;
- `currentBidKopecks BIGINT`;
- `minimumBidKopecks BIGINT`;
- `lastConfirmedAt`;
- unique `(campaignId, nmId, placement, normQueryNormalized)`.

Пустой `normQuery` необходимо нормализовать отдельным non-null ключом, так как PostgreSQL допускает несколько `NULL` в unique constraint.

#### `CampaignStatDaily`

- `sellerId`, `wbCampaignId`, `nmId`, `date`;
- опционально `placement` и `normQueryNormalized`;
- исходные счётчики;
- `spendMinor`, `attributedRevenueMinor`;
- `currency`;
- `fetchedAt`, `sourceVersion`, `syncRunId`;
- составной unique по измерениям дня;
- партиционирование по `date` SHOULD применяться при подтверждённом объёме.

#### `UnitEconomics`

- `sellerId`, `nmId`;
- `effectiveFrom`, `effectiveTo`;
- `expectedBuyoutRatePpm`;
- `cogsMinor`;
- `commissionRatePpm`;
- `logisticsMinor`;
- `returnLogisticsMinor`;
- `taxRatePpm`;
- `otherVariableCostMinor`;
- `desiredProfitRatePpm`;
- `source MANUAL | IMPORT`;
- `version`;
- запрет пересекающихся периодов для одной пары `(sellerId, nmId)`.

Коэффициенты хранятся в parts-per-million (`ppm`), где `1_000_000 = 100%`.

#### `BiddingPolicy`

- область: seller, campaign или target;
- приоритет: target > campaign > seller default;
- `mode PROFIT | TARGET_ACOS | TARGET_ROAS | OBSERVE_ONLY`;
- окна статистики;
- minimum sample thresholds;
- `targetAcosPpm` или `targetRoasPpm`;
- min/max bid;
- max increase/decrease per cycle;
- max daily change;
- hysteresis;
- cooldown;
- budget guardrails;
- freshness threshold;
- `enabled`;
- `version`, `validFrom`, `validTo`.

Изменение политики создаёт новую неизменяемую версию.

#### `MetricSnapshot`

- ссылка на target и статистический период;
- все рассчитанные метрики;
- completeness flags;
- input checksum;
- algorithm version;
- `calculatedAt`;
- immutable после создания.

#### `BidDecision`

- `id UUID`;
- target;
- `action`;
- `currentBidKopecks`;
- `proposedBidKopecks`;
- `boundedBidKopecks`;
- `reasonCode`;
- `explanation JSONB`;
- `metricSnapshotId`;
- `policyVersion`;
- `algorithmVersion`;
- `idempotencyKey`;
- `createdAt`;
- unique `idempotencyKey`.

#### `DecisionQueueItem`

- `decisionId`;
- `status`;
- `priority`;
- `availableAt`;
- `leaseOwner`, `leaseUntil`;
- `attemptCount`, `verificationAttemptCount`;
- `lastErrorClass`, `lastErrorCode`;
- `lastHttpStatus`;
- `sentAt`, `verifiedAt`;
- index `(status, availableAt, priority)`.

#### `WbApiCall`

- seller, endpoint key, method;
- correlation ID, WB request ID;
- attempt;
- request time, latency;
- HTTP status;
- rate-limit response headers;
- redacted request/response digest;
- error class;
- связь с sync run или decision.

#### `AuditEvent`

- actor (`SCHEDULER`, `ADMIN`, `EXECUTOR`, `SYSTEM`);
- action;
- entity type/id;
- before/after JSONB с redaction;
- correlation/causation ID;
- timestamp;
- append-only.

#### `SchedulerRun`

- job type;
- seller/shard;
- start/end;
- status;
- counters;
- checkpoint;
- error summary.

### 8.2. Миграции

- Все изменения БД выполняются Prisma Migrate.
- Production migration НЕ ДОЛЖНА автоматически удалять столбцы или данные.
- Большие индексы создаются безопасным для production способом.
- Миграции проверяются на чистой и на заполненной тестовой БД.
- Денежные преобразования должны иметь отдельные тесты границ `BigInt`.

## 9. Алгоритм Decision Engine

### 9.1. Версионирование

Алгоритм имеет строковую версию, например `rules-v1`. Решение ДОЛЖНО сохранять:

- версию алгоритма;
- версию политики;
- checksum входных данных;
- весь набор промежуточных значений;
- сработавшие guardrails.

### 9.2. Окна данных

Политика задаёт:

- `primaryWindowDays`, default 7;
- `baselineWindowDays`, default 28;
- `conversionLagDays`, default 2;
- `minClicks`, default 20;
- `minOrders`, default 3;
- `minSpendMinor`;
- `maxDataAgeMinutes`.

Последние `conversionLagDays` не используются для негативного вывода о конверсии, если атрибуция заказов может запаздывать. Они могут использоваться для защиты бюджета и выявления аномального расхода.

### 9.3. Формулы

Все деления должны явно обрабатывать нулевой знаменатель.

```text
CTR = clicks / views
CR = orders / clicks
CPC = spend / clicks
CPM = spend * 1000 / views
ACOS = spend / attributedRevenue
ROAS = attributedRevenue / spend

expectedBoughtUnits = orderedUnits * expectedBuyoutRate
expectedReturnedUnits = orderedUnits - expectedBoughtUnits
expectedNetRevenue =
  attributedRevenue * expectedBuyoutRate

expectedVariableCosts =
  expectedBoughtUnits * (cogs + logistics + otherPerUnit)
  + expectedNetRevenue * (commissionRate + taxRate)
  + expectedReturnedUnits * returnLogistics

contributionBeforeAds =
  expectedNetRevenue - expectedVariableCosts

expectedProfit =
  contributionBeforeAds - spend

availableAdShare =
  max(0, contributionBeforeAds / expectedNetRevenue - desiredProfitRate)
```

Если конкретное поле WB описывает заказы, а не выкупы, название внутреннего поля ДОЛЖНО сохранять эту семантику. Запрещено автоматически называть `orders` продажами.

### 9.4. Целевой ACOS для режима прибыли

При наличии unit economics:

```text
breakEvenAcos = contributionBeforeAds / expectedNetRevenue
targetAcos = max(0, breakEvenAcos - desiredProfitRate)
```

`desiredProfitRate` задаётся относительно ожидаемой net revenue. Валидация запрещает отрицательные коэффициенты и `targetAcos > breakEvenAcos`.

### 9.5. Базовый регулятор ставки

Для объекта с достаточной статистикой:

```text
efficiencyRatio = targetAcos / actualAcos
boundedRatio = clamp(
  efficiencyRatio,
  1 - maxDecreasePerCycle,
  1 + maxIncreasePerCycle
)
rawBid = currentBid * boundedRatio
```

Правила:

- если `actualAcos == 0` из-за нулевого расхода, ставка не повышается по этой формуле;
- если есть расход, но нет выручки, применяется отдельное правило zero-conversion;
- если отношение попадает в hysteresis-band, результат `NO_CHANGE`;
- округление ставки выполняется в копейках предсказуемым способом и тестируется;
- итоговая ставка ограничивается `max(policyMin, wbMinimumBid)` и `policyMaxBid`;
- если WB minimum выше policy maximum, применение блокируется с `MIN_ABOVE_POLICY_MAX`.

### 9.6. Правило zero-conversion

Если после исключения conversion lag:

- `orders == 0`;
- `clicks >= minClicks` или `spend >= zeroConversionSpendThreshold`;

ставка снижается на `zeroConversionDecreasePpm`, но не ниже допустимого floor.

Если floor уже достигнут, решение `NO_CHANGE_AT_FLOOR`. Автоматическое удаление кластера или остановка кампании не выполняется.

### 9.7. Правило недостатка трафика

Ставку МОЖНО увеличить только если одновременно:

- статистика свежая;
- объект имеет показы меньше заданного порога;
- текущая ставка не ниже минимальной WB;
- budget guardrail разрешает рост;
- объект не имеет достаточных данных, указывающих на убыточность;
- политика явно включает `explorationEnabled`;
- рост не превышает `explorationStep` и дневной cap.

По умолчанию `explorationEnabled=false`.

### 9.8. Hysteresis, cooldown и ограничения

- изменение меньше `minAbsoluteChangeKopecks` или `minRelativeChangePpm` не применяется;
- после подтверждённого изменения объект не меняется в течение `cooldownMinutes`;
- суммарное изменение от первой подтверждённой ставки текущих суток ограничено `maxDailyIncreasePpm` и `maxDailyDecreasePpm`;
- policy min/max применяются после расчёта, но до округления к допустимой ставке;
- внезапное изменение unit economics или policy version снимает cooldown только при явном флаге администратора;
- защитное снижение при превышении бюджета MAY игнорировать обычный cooldown, но не идемпотентность.

### 9.9. Budget guardrail

Decision Engine блокирует повышение и разрешает только снижение, если:

- остаток бюджета неизвестен или устарел сверх допустимого порога;
- расход за сутки превысил `dailySpendLimit`;
- ожидаемый расход до конца суток превышает limit;
- кампания близка к исчерпанию бюджета;
- обнаружен расходовой spike относительно baseline.

Первая версия не пополняет и не меняет бюджет кампании.

### 9.10. Причины решения

Минимальный enum:

- `PROFITABLE_INCREASE`;
- `TARGET_BAND_NO_CHANGE`;
- `UNPROFITABLE_DECREASE`;
- `ZERO_CONVERSION_DECREASE`;
- `INSUFFICIENT_DATA`;
- `STALE_DATA`;
- `MISSING_UNIT_ECONOMICS`;
- `BUDGET_GUARDRAIL`;
- `COOLDOWN`;
- `BELOW_MIN_CHANGE`;
- `AT_FLOOR`;
- `AT_CAP`;
- `MIN_ABOVE_POLICY_MAX`;
- `UNSUPPORTED_CAMPAIGN`;
- `OBSERVE_ONLY`;
- `MANUAL_PAUSE`;
- `DATA_INCONSISTENCY`.

## 10. Очередь и идемпотентность

### 10.1. Состояния

```text
QUEUED
  ├──> LEASED ──> SENT ──> VERIFY_WAIT ──> APPLIED
  │       │          │            ├──────> RETRY_WAIT ──> LEASED
  │       │          │            └──────> FAILED
  │       └──────────> RETRY_WAIT
  ├──> SUPERSEDED
  └──> CANCELLED
```

Переходы выполняются только разрешёнными методами доменного сервиса и в транзакции. Terminal states: `APPLIED`, `FAILED`, `SUPERSEDED`, `CANCELLED`.

### 10.2. Idempotency key

Ключ строится из:

```text
sellerId
wbCampaignId
nmId
placement
normalizedNormQuery
targetBidKopecks
inputSnapshotChecksum
policyVersion
algorithmVersion
```

Повторное вычисление тех же входов не создаёт вторую очередь.

### 10.3. Конкуренция

- Claim выполняется через `SELECT ... FOR UPDATE SKIP LOCKED`.
- Lease имеет TTL и heartbeat.
- Для одного target одновременно допускается только одно non-terminal решение.
- Более новое решение может пометить ещё не отправленное старое как `SUPERSEDED`.
- После `SENT` supersede запрещён до reconciliation.
- Порядок между разными продавцами справедливый, между изменениями одного target — последовательный.

### 10.4. Неопределённый результат записи

При timeout/connection reset после отправки Executor НЕ ДОЛЖЕН сразу повторять PATCH/POST. Он переводит элемент в `VERIFY_WAIT`, читает фактическую ставку и:

- завершает `APPLIED`, если ставка совпала;
- повторяет отправку, если достоверно подтверждена старая ставка;
- продолжает reconciliation, если read API недоступен;
- завершает `FAILED`, когда исчерпан лимит времени/попыток.

## 11. Scheduler и масштабирование

### 11.1. Независимые задания

Обязательные jobs:

| Job | Назначение | Переменная |
|---|---|---|
| Data sync | Кампании, ставки, minimum bids и статистика в БД | `DATA_SYNC_CRON`, default `0 */30 * * * *` |
| Decision | Расчёт решений только из БД | `DECISION_CRON`, default `15 */30 * * * *` |
| Campaign apply | Получение и применение решений из очереди через WB API | `CAMPAIGN_APPLY_CRON`, default `*/10 * * * * *` |
| Verification | Проверка отправленных решений | `VERIFICATION_POLL_INTERVAL_MS` |
| Reconciliation | Восстановление зависших lease и неизвестных результатов | `RECONCILIATION_CRON` |

`DATA_SYNC_CRON`, `DECISION_CRON` и `CAMPAIGN_APPLY_CRON` конфигурируются независимо. Таким образом, частота обновления данных в БД не связана с частотой применения настроек через WB API. По умолчанию тяжёлые jobs не должны стартовать в одну секунду, чтобы избегать пиков. Если предыдущий run того же seller/job ещё активен, новый запуск не создаёт параллельный дубликат.

### 11.2. Блокировки jobs

- Для scheduler используется PostgreSQL advisory lock или таблица lease.
- На один seller + job одновременно работает не более одного worker.
- Несколько реплик bidder поддерживаются без дублирования job.
- Пропущенный запуск не порождает неограниченную очередь старых запусков.
- Каждый run имеет deadline и checkpoint.

### 11.3. Тысячи кампаний

- Все WB-запросы пакетируются по фактическим ограничениям endpoint.
- Кампании обрабатываются страницами/порциями без загрузки всего набора в память.
- Планировщик использует round-robin по продавцам.
- Статистика синхронизируется инкрементально с небольшим overlap для поздних изменений.
- Данные за overlap upsert-ятся.
- Для backfill создаётся отдельный низкоприоритетный job.
- Горизонтальное масштабирование ограничивается общим rate limiter продавца, а не числом pod.

## 12. WB API client и rate limiting

### 12.1. Режимы

| Режим | Default base URL | Токен | Разрешение записи |
|---|---|---|---|
| `mock` | `http://wb-mock:3001` | тестовая строка | да |
| `sandbox` | `https://advert-api-sandbox.wildberries.ru` | тестовый токен WB | да |
| `prod` | `https://advert-api.wildberries.ru` | production-токен категории «Продвижение» | только при отдельном флаге |

URL каждого режима переопределяется env:

- `WB_API_MOCK_BASE_URL`;
- `WB_API_SANDBOX_BASE_URL`;
- `WB_API_PROD_BASE_URL`.

Также обязательны:

- `WB_API_MODE=mock|sandbox|prod`;
- `WB_API_TOKEN`;
- `WB_API_WRITE_ENABLED=false` по умолчанию;
- `WB_API_TIMEOUT_MS`;
- `WB_API_CONNECT_TIMEOUT_MS`.

Production startup должен завершаться ошибкой, если `WB_API_MODE=prod`, но отсутствует корректная комбинация токена, secret provider и явного `WB_API_WRITE_ENABLED=true`.

### 12.2. Rate limiter

Нужны два уровня token bucket:

1. общий safety cap на seller account;
2. отдельный bucket на endpoint key.

Обязательные env:

- `WB_API_GLOBAL_RATE_LIMIT_REQUESTS`, default `5`;
- `WB_API_GLOBAL_RATE_LIMIT_INTERVAL_MS`, default `1000`;
- `WB_API_GLOBAL_RATE_LIMIT_BURST`, default `5`;
- `WB_API_RATE_LIMITS_JSON` — переопределение endpoint buckets;
- `WB_API_MAX_IN_FLIGHT`, default `5`.

Встроенный профиль endpoint limits должен соответствовать таблице раздела 4.2. Более строгий из общего и endpoint-specific limit всегда побеждает. Профиль sandbox по умолчанию совпадает с документированным профилем продвижения; пользователь может задать более строгие значения.

Limiter ДОЛЖЕН быть распределённым на уровне seller account. Допустим PostgreSQL-based limiter; in-memory limiter разрешён только при одной реплике и в `mock`.

### 12.3. Адаптация по заголовкам

Клиент сохраняет и учитывает:

- `X-Ratelimit-Remaining`;
- `X-Ratelimit-Retry`;
- `X-Ratelimit-Reset`;
- `X-Ratelimit-Limit`;
- `Retry-After`, если присутствует.

После `429`:

- новые запросы этого bucket замораживаются минимум на указанное WB время;
- применяется full-jitter;
- `429` не расходует обычный retry без задержки;
- повтор до разрешённого времени запрещён;
- метрика и структурированный log обязательны.

### 12.4. Ошибки и retries

| Класс | Поведение |
|---|---|
| `400`, `403`, `422` | terminal для конкретного payload; без слепого retry |
| `401` | остановить seller integration, alert; токен не логировать |
| `404` | сверить endpoint/profile; terminal либо resync сущности |
| `409` | классифицировать по телу; повторять только документированно временные случаи |
| `429` | retry по заголовкам |
| `5xx` | exponential backoff + full jitter |
| timeout до отправки | retryable |
| timeout после возможной отправки | сначала reconciliation |

Retry policy задаётся отдельно для read, write и verify. Бесконечные retries запрещены.

### 12.5. Circuit breaker

- отдельный breaker на seller + endpoint group;
- `401/403` открывают auth breaker;
- серия `5xx/timeouts` открывает availability breaker;
- half-open probe не должен нарушать rate limit;
- Decision Engine продолжает считать решения, но просроченные решения не отправляются после восстановления.

## 13. Data Sync Worker

### 13.1. Стадии

1. `DISCOVER_CAMPAIGNS`;
2. `SYNC_CAMPAIGN_DETAILS`;
3. `SYNC_CURRENT_BIDS`;
4. `SYNC_MIN_BIDS`;
5. `SYNC_CAMPAIGN_STATS`;
6. `SYNC_CLUSTER_STATS`;
7. `SYNC_BUDGETS`;
8. `FINALIZE`.

Частичный сбой одной стадии не должен удалять ранее корректные данные. Completeness snapshot отражает успешные и неуспешные стадии.

### 13.2. Freshness

Decision Engine использует только snapshot, у которого:

- завершены обязательные стадии;
- `fetchedAt` не старше policy threshold;
- период статистики непрерывен либо пробел явно допустим;
- currency совпадает с unit economics;
- текущая ставка подтверждена после последнего отправленного решения.

### 13.3. Аномалии данных

При отрицательных счётчиках, расходе без валюты, уменьшении кумулятивного счётчика или невозможной комбинации campaign/bid/payment type:

- исходный payload сохраняется в redacted diagnostic storage;
- snapshot отмечается `INVALID`;
- решение не применяется;
- увеличивается metric;
- создаётся audit event.

## 14. Executor Engine

### 14.1. Пакетирование

В один запрос объединяются только решения с одинаковыми:

- seller;
- endpoint;
- payment/bid type;
- совместимым payload;
- приоритетом и временем доступности.

Размер batch не превышает лимита endpoint. Частичный ответ разбирается по элементам, если API предоставляет такую детализацию.

### 14.2. Приоритет

Рекомендуемый порядок:

1. защитное снижение при перерасходе;
2. обычное снижение;
3. обычное повышение;
4. exploration.

Приоритет не отменяет fairness между seller accounts.

### 14.3. Перед отправкой

Executor повторно проверяет:

- автоматизация не выключена;
- решение не superseded;
- политика всё ещё действительна;
- current confirmed bid совпадает с исходной ставкой решения;
- min bid не изменился;
- decision age не превышает `MAX_DECISION_AGE_MINUTES`;
- нет ручного изменения после создания решения.

При расхождении выполняется resync и перерасчёт, а старое решение отменяется.

## 15. Mock-сервер WB API

### 15.1. Общие требования

Mock — отдельное приложение TypeScript/NestJS. Оно не использует PostgreSQL и не зависит от bidder.

Состояние:

- seed fixtures — захардкоженные сценарии;
- статистика — детерминированная генерация по seed;
- кампании и ставки — изменяемые in-memory структуры;
- перезапуск сбрасывает состояние;
- системное время абстрагировано интерфейсом Clock.

### 15.2. Реализуемый API

Mock ДОЛЖЕН реализовать совместимое подмножество всех методов таблицы 4.2, включая:

- пути и HTTP methods;
- обязательные query/body fields;
- основные response fields;
- денежные единицы;
- batch limits;
- статусы кампаний;
- rate-limit headers;
- стандартные `400`, `401`, `403`, `429`, `5xx`;
- задержку видимости изменённой ставки.

### 15.3. Управление сценариями

Только в mock доступны служебные endpoints под `/__mock`:

- `POST /__mock/reset`;
- `POST /__mock/seed/:scenario`;
- `POST /__mock/faults`;
- `POST /__mock/time/advance`;
- `GET /__mock/state`;
- `GET /__mock/requests`.

Сценарии:

- profitable campaign;
- unprofitable campaign;
- zero conversions;
- insufficient data;
- stale statistics;
- manual and unified bid;
- CPM and CPC;
- minimum bid above policy maximum;
- 429 with headers;
- transient 5xx;
- timeout before/after mutation;
- delayed consistency;
- auth failure;
- malformed response;
- partial batch failure;
- manual external bid change.

Mock должен быть детерминированным: один seed и одна последовательность команд дают одинаковый результат.

### 15.4. Rate limit mock

Mock применяет token bucket и возвращает документированные headers. Через `/__mock/faults` можно:

- уменьшить лимит;
- принудительно вернуть `429`;
- задать `X-Ratelimit-Retry/Reset/Limit`;
- проверить, что bidder не повторяет запрос раньше срока.

## 16. Docker и локальные окружения

Обязательны три независимых compose-файла:

### 16.1. `docker-compose.yml`

- `bidder`;
- `postgres`;
- healthchecks;
- named volume для PostgreSQL;
- migration step перед запуском bidder;
- mock отсутствует.

### 16.2. `docker-compose.mock.yml`

- `bidder` в `WB_API_MODE=mock`;
- `postgres`;
- `wb-mock`;
- healthchecks и dependency conditions;
- полный локальный e2e-контур.

### 16.3. `docker-compose.mock-only.yml`

- только `wb-mock`;
- опубликованный порт;
- без PostgreSQL и bidder;
- используется сторонними клиентами и contract tests.

Каждый compose ДОЛЖЕН запускаться одной документированной командой и иметь отдельный smoke test. Docker images работают не от root, используют multi-stage build, имеют pinned major runtime image и корректно обрабатывают `SIGTERM`.

## 17. Внутренний REST API bidder

API version prefix: `/api/v1`.

Минимальные группы:

- seller accounts: создать/изменить метаданные и secret reference;
- policies: CRUD с неизменяемыми версиями;
- unit economics: CRUD/import с валидацией периодов;
- campaign automation: включить, выключить, observe-only;
- manual resync/recalculate без обхода блокировок;
- decisions: список, детали, explanation;
- queue failures: просмотр и безопасный retry terminal item;
- audit events: фильтрация по seller/campaign/target/correlation ID.

Токен WB никогда не возвращается API. Все mutating endpoints должны быть аутентифицированы, авторизованы и создавать audit event. Конкретный корпоративный identity provider выбирается до production; до этого API слушает только localhost/private network и защищается service token.

## 18. Конфигурация

Конфигурация валидируется при старте через типизированную схему. Неизвестные критичные значения и несовместимые флаги вызывают startup failure.

Кроме перечисленных ранее обязательны:

- `DATABASE_URL`;
- `PORT`;
- `LOG_LEVEL`;
- `LOG_FORMAT=json`;
- `DATA_SYNC_CRON`;
- `DECISION_CRON`;
- `CAMPAIGN_APPLY_CRON`;
- `VERIFICATION_POLL_INTERVAL_MS`;
- `RECONCILIATION_CRON`;
- `BID_VERIFICATION_INITIAL_DELAY_MS`, default не меньше 30 секунд;
- `BID_VERIFICATION_TIMEOUT_MS`;
- `MAX_DECISION_AGE_MINUTES`;
- `SCHEDULER_ENABLED`;
- `METRICS_ENABLED`;
- `ADMIN_API_SERVICE_TOKEN` либо secret reference;
- `ENCRYPTION_KEY_REF`, если token хранится приложением.

`.env.example` содержит безопасные значения без секретов. Для каждого env в русской документации указываются тип, default, допустимый диапазон, секретность и влияние изменения.

## 19. Логирование и аудит

### 19.1. Структурированные логи

Production logs — JSON в stdout/stderr. Обязательные поля:

- timestamp UTC;
- level;
- service, version, environment;
- message, event code;
- correlation ID, causation ID;
- seller ID, campaign ID, target ID, decision ID;
- scheduler run ID;
- endpoint key, attempt, latency, HTTP status;
- result/reason code.

Запрещено логировать:

- WB token;
- Authorization header;
- service token;
- connection string с паролем;
- полные секретные payload.

### 19.2. Бизнес-аудит

Для решения сохраняются:

- исходная и целевая ставка;
- метрики и окно;
- unit economics version;
- policy и algorithm version;
- причины;
- все применённые ограничения;
- API attempts;
- фактически прочитанная ставка;
- actor ручного вмешательства.

Audit events append-only. Изменение или удаление audit record прикладным API запрещено.

## 20. Наблюдаемость

### 20.1. Endpoints

- `GET /health/live` — event loop и процесс живы; без тяжёлых внешних проверок;
- `GET /health/ready` — БД доступна, миграции применены, конфигурация валидна; для prod также проверяется состояние интеграции без выполнения write;
- `GET /metrics` — Prometheus text format.

Не следует использовать `/metrics` как единственный health endpoint.

### 20.2. Метрики

Минимальный набор:

- `bidder_scheduler_runs_total{job,status}`;
- `bidder_scheduler_run_duration_seconds`;
- `bidder_sync_campaigns_total{status}`;
- `bidder_sync_lag_seconds`;
- `bidder_decisions_total{action,reason}`;
- `bidder_decision_duration_seconds`;
- `bidder_queue_items{status}`;
- `bidder_queue_oldest_age_seconds`;
- `bidder_executor_attempts_total{endpoint,result}`;
- `bidder_verification_total{result}`;
- `bidder_wb_requests_total{endpoint,status_class}`;
- `bidder_wb_request_duration_seconds{endpoint}`;
- `bidder_wb_rate_limit_wait_seconds{endpoint}`;
- `bidder_wb_429_total{endpoint}`;
- `bidder_circuit_breaker_state{group}`;
- `bidder_data_invalid_total{reason}`;
- `bidder_audit_write_failures_total`.

Нельзя помещать seller/campaign/nm/query в Prometheus labels из-за высокой кардинальности. Для этого используются logs и audit query.

### 20.3. Алерты

Документация должна предложить:

- sync lag выше допустимого;
- очередь растёт или oldest age превышен;
- terminal failure;
- серия `401/403`;
- высокий процент `429/5xx`;
- verification mismatch;
- нет успешного scheduler run;
- DB pool saturation;
- audit write failure;
- неожиданный рост расходов.

## 21. Безопасность

- Секреты не хранятся в git, env examples, логах и audit payload.
- Предпочтительно хранить WB token во внешнем secret manager; допустимо зашифрованное хранение в БД с ключом вне БД.
- Токен расшифровывается только перед запросом и не кешируется дольше необходимого.
- Разные seller accounts изолируются во всех запросах к БД.
- Admin API использует authentication + authorization.
- Production write требует отдельного feature flag и подтверждённого режима.
- Sandbox token нельзя использовать с production URL и наоборот.
- HTTP redirect на другой host для запросов с Authorization запрещён.
- TLS certificate validation запрещено отключать вне тестов.
- Dependency и container vulnerability scanning входят в CI.
- Retention исходных payload ограничен; секретные и персональные данные redacted.

## 22. Нефункциональные требования

### 22.1. Производительность

- Система должна поддерживать минимум 10 000 кампаний и 100 000 targets на один deployment.
- Обработка не должна предполагать размещение всех targets в памяти.
- Внутренний расчёт одного snapshot без I/O должен иметь p95 не хуже 20 мс на целевом CI runner; окончательный benchmark фиксируется до релиза.
- Ограничивающим фактором sync является WB API; backlog и прогноз времени завершения наблюдаемы.

### 22.2. Надёжность

- Перезапуск процесса не теряет решения.
- Ни одно решение не считается применённым без verify read.
- Повторный scheduler run не дублирует статистику и очередь.
- Потеря WB API не блокирует Admin API и чтение аудита.
- Потеря БД переводит readiness в failed; изменения в WB не отправляются.
- Graceful shutdown прекращает claim, завершает/освобождает lease и закрывает соединения.

### 22.3. Точность

- Все деньги хранятся в minor units.
- Все rate/ratio хранятся как integer ppm или Decimal с явно заданной точностью.
- Каждый расчёт имеет golden tests.
- Timezone boundary, leap day и DST покрываются тестами там, где влияют на сутки продавца.

### 22.4. Сопровождаемость

- TypeScript `strict=true`;
- отсутствие `any`, кроме изолированной boundary-десериализации с немедленной валидацией;
- входы WB проверяются runtime schemas;
- domain logic не зависит от NestJS decorators;
- публичные контракты versioned;
- все deprecated WB методы централизованы в compatibility registry и запрещены lint/contract тестом.

## 23. Требования к JSDoc

JSDoc обязателен для:

- каждого класса, interface, type, enum;
- каждой функции и каждого метода, включая private;
- каждого DTO и существенного поля;
- callback с нетривиальным контрактом;
- экспортируемых констант и конфигурационных профилей.

Каждый callable JSDoc содержит:

- назначение;
- `@param` для каждого параметра, единицы и допустимые диапазоны;
- `@returns`, включая единицы и promise semantics;
- `@throws` для ожидаемых ошибок;
- side effects и идемпотентность;
- ссылку `@see` на конкретный раздел официальной WB API документации для adapter methods;
- пример для сложного публичного контракта.

JSDoc НЕ ДОЛЖЕН пересказывать очевидный код или содержать неподтверждённые обещания. Проверка выполняется ESLint с `eslint-plugin-jsdoc`; отсутствие обязательной документации блокирует CI.

## 24. Документация проекта

Все проектные документы — на русском языке. Минимальный комплект реализации:

- `README.md` — назначение и быстрый старт;
- `docs/architecture.md`;
- `docs/configuration.md`;
- `docs/wb-api-integration.md`;
- `docs/bidding-algorithm.md`;
- `docs/data-model.md`;
- `docs/mock-server.md`;
- `docs/testing.md`;
- `docs/observability.md`;
- `docs/security.md`;
- `docs/runbook.md`;
- `docs/adr/*.md` для значимых решений.

Документация должна содержать Mermaid-диаграммы компонентов, последовательности sync/decision/execution, state machine очереди и ER-модель. Ссылки на WB API должны быть кликабельными и регулярно проверяться.

## 25. Стратегия тестирования

Принцип «необходимое и достаточное» означает, что тесты доказывают критические инварианты, а не просто достигают процента покрытия.

### 25.1. Unit tests

Обязательны для:

- всех формул и нулевых знаменателей;
- денежных округлений;
- profit/ACOS/ROAS modes;
- выборки окон и conversion lag;
- zero-conversion;
- floor/cap/hysteresis/cooldown/daily cap;
- разрешения policy precedence;
- idempotency key;
- state machine;
- error classification;
- retry/backoff/jitter с fake timers;
- batch builder;
- redaction;
- config validation.

Для Decision Engine используются table-driven и property-based tests:

- ставка никогда не ниже WB minimum;
- ставка никогда не выше policy maximum;
- при равных входах результат идентичен;
- рост/снижение не превышает cap;
- невалидные или stale данные никогда не создают write;
- деньги не теряют копейки из-за float.

### 25.2. Integration tests

На реальном PostgreSQL:

- Prisma migrations;
- upsert статистики;
- транзакция decision + queue;
- unique idempotency key;
- `SKIP LOCKED` с несколькими workers;
- lease expiry/recovery;
- supersede rules;
- advisory scheduler lock;
- audit append-only;
- isolation seller accounts.

### 25.3. Contract tests

Для каждого WB endpoint:

- request schema;
- response schema;
- batch boundaries;
- money units;
- enum mappings;
- rate-limit headers;
- ошибки;
- fixtures из официальной документации без секретов.

Один и тот же набор consumer contract tests запускается против mock и, где безопасно, sandbox. Production contract tests выполняют только read methods.

### 25.4. End-to-end tests

Через `docker-compose.mock.yml`:

1. успешный полный цикл;
2. прибыльное повышение;
3. убыточное снижение;
4. отсутствие изменения;
5. zero conversion;
6. stale/invalid data;
7. duplicate scheduler run;
8. рестарт bidder после queue claim;
9. timeout после WB mutation и reconciliation без двойного изменения;
10. delayed visibility;
11. `429` и соблюдение retry headers;
12. transient `5xx`;
13. ручное изменение ставки;
14. superseded decision;
15. observe-only;
16. выключение automation;
17. sandbox/prod write safety flags.

### 25.5. Негативные и нагрузочные тесты

- 10 000 кампаний / 100 000 targets;
- burst очереди;
- медленный WB;
- исчерпание DB pool;
- malformed payload;
- clock skew;
- истёкший токен;
- race двух executor replicas;
- graceful shutdown.

### 25.6. Coverage gates

- Decision, queue, executor, rate limiter, money и config: не менее 90% branches и 95% lines/statements;
- остальные domain/application modules: не менее 85% branches и 90% lines;
- generated Prisma client, bootstrap wiring и декларативные migrations исключаются с обоснованием;
- глобальный процент не заменяет обязательные сценарии;
- mutation testing SHOULD применяться к формулам и guardrails; целевой mutation score не ниже 80%.

Любой `istanbul ignore` требует комментария с причиной. Snapshot-only tests для бизнес-логики запрещены.

## 26. CI/CD quality gates

Pull request блокируется, если не прошли:

- install с locked dependencies;
- TypeScript compile;
- ESLint + JSDoc rules;
- format check;
- unit tests + thresholds;
- integration tests PostgreSQL;
- mock contract tests;
- e2e smoke;
- Prisma migration validation;
- dependency/security scan;
- Docker image build;
- Compose config validation;
- secret scan;
- Markdown links/lint;
- проверка отсутствия deprecated WB endpoints.

Production deployment SHOULD включать:

1. migration job;
2. запуск в `OBSERVE_ONLY`;
3. readiness;
4. canary seller accounts;
5. ограниченный write enable;
6. мониторинг verify mismatch и расходов;
7. постепенное расширение.

## 27. Критерии приёмки

### AC-01. Запуск

Все три compose-сценария поднимаются документированными командами и проходят healthchecks.

### AC-02. Режимы

`mock`, `sandbox`, `prod` выбирают корректные default URLs; URL можно переопределить; production write не включается неявно.

### AC-03. Data Sync

Повторная синхронизация одного периода не создаёт дубликатов, сохраняет freshness/completeness и соблюдает batch/rate limits.

### AC-04. Decision Engine

Для фиксированного fixture возвращает детерминированное решение с полным объяснением; к WB API не обращается.

### AC-05. Прибыль

Режим `PROFIT` не работает без unit economics. Формулы учитывают ожидаемый выкуп и переменные затраты. Fallback назван ACOS/ROAS, а не прибылью.

### AC-06. Guardrails

Невозможно применить ставку ниже WB minimum, выше policy maximum, сверх cycle/daily cap или при stale/invalid данных.

### AC-07. Очередь

Решение и очередь создаются атомарно; повторный расчёт не дублирует item; несколько workers не забирают один item одновременно.

### AC-08. Неопределённая запись

При timeout после mutation система сначала сверяет WB и не выполняет слепой повтор.

### AC-09. Проверка результата

Решение получает `APPLIED` только после чтения совпадающей фактической ставки.

### AC-10. Rate limit

Соблюдаются глобальный и endpoint limits. После mock `429` следующий запрос не выполняется раньше `X-Ratelimit-Retry`.

### AC-11. Аудит

По decision ID восстанавливаются inputs, formulas, policy, reason, attempts и фактический результат; секретов нет.

### AC-12. Наблюдаемость

Live, ready и metrics endpoints работают; ключевые stages имеют metrics; labels не содержат высококардинальные ID.

### AC-13. Mock

Mock реализует согласованное подмножество WB API, детерминированные сценарии, delayed consistency, fault injection и rate-limit headers.

### AC-14. Тесты

Все критические инварианты из раздела 25 покрыты; coverage gates проходят; e2e доказывает полный цикл.

### AC-15. JSDoc и документация

Lint подтверждает обязательный JSDoc; комплект русскоязычных документов создан и соответствует поведению.

### AC-16. Масштаб

Нагрузочный сценарий 10 000 кампаний / 100 000 targets завершается без потери данных, нарушения лимитов и неограниченного роста памяти.

## 28. Матрица трассировки исходных требований

| № | Исходное требование | Разделы | Критерии |
|---|---|---|---|
| 1 | TypeScript, NestJS, Prisma, PostgreSQL | 1, 5, 6, 8 | AC-01 |
| 2 | Необходимое и достаточное автотестирование | 25, 26 | AC-14 |
| 3 | JSDoc для всего кода и параметров | 23, 26 | AC-15 |
| 4 | Подробная документация на русском | 24 | AC-15 |
| 5 | Bidder + PostgreSQL через Compose | 16.1 | AC-01 |
| 6 | NestJS mock и отдельные Compose | 15, 16.2, 16.3 | AC-01, AC-13 |
| 7 | mock/sandbox/prod и default URL | 12.1 | AC-02 |
| 8 | Логирование и аудит | 19 | AC-11 |
| 9 | Endpoint наблюдаемости | 20 | AC-12 |
| 10 | Раздельные scheduler частоты | 11.1, 18 | AC-03 |
| 11 | Env rate limit с defaults WB | 4.2, 12.2, 12.3 | AC-10 |
| 12 | Постоянно работающий scheduler service | 5, 11 | AC-01, AC-03 |
| 13 | Семь шагов цикла | 7 | AC-03–AC-09 |
| 14 | Data Sync, Decision, queue, Executor | 6, 7, 13, 14 | AC-03–AC-09 |

## 29. Этапы реализации

### Этап 0. Контракты и каркас

- monorepo/workspace;
- bidder и mock apps;
- strict TypeScript, lint/JSDoc;
- config;
- Prisma/PostgreSQL;
- CI и compose skeleton.

### Этап 1. WB adapter и mock

- runtime schemas;
- read endpoints;
- rate limiter;
- request audit/redaction;
- mock scenarios и contract tests.

### Этап 2. Data Sync

- schema/migrations;
- scheduler locks;
- incremental sync;
- freshness/completeness;
- integration/load tests.

### Этап 3. Decision Engine

- unit economics;
- policy versioning;
- metrics;
- deterministic rules;
- explanation и property-based tests;
- observe-only.

### Этап 4. Queue и Executor

- transactional queue;
- lease/concurrency;
- WB writes;
- verification/reconciliation;
- failure injection e2e.

### Этап 5. Production readiness

- Admin API auth;
- observability/runbook;
- security/load testing;
- sandbox soak;
- canary prod observe-only;
- controlled write enable.

Каждый этап завершается demo, проверяемыми acceptance criteria и обновлением документации.

## 30. Риски и обязательные решения до production

| Риск/вопрос | Требуемое действие |
|---|---|
| WB меняет методы и лимиты | Версионировать endpoint profile, проверять release notes, contract tests |
| Статистика и ставка видимы с задержкой | Conversion lag, delayed verification, reconciliation |
| Рекламные заказы не равны выкупам | Unit economics с buyout rate; не называть orders продажами |
| Нет себестоимости | Блокировать PROFIT или явно использовать ACOS/ROAS |
| Ручное изменение конфликтует с bidder | Pre-send compare, audit, cancel + recalculate |
| Две реплики превышают общий лимит | Distributed limiter по seller |
| HTTP success без фактического изменения | Read-after-write verification |
| Timeout после записи | Verify-before-retry |
| Слишком много метрик labels | IDs только в logs/audit |
| Production включён случайно | Fail-closed flags, secret/type checks, canary |

До production владелец продукта ДОЛЖЕН утвердить:

1. источник и точность unit economics;
2. attribution window и conversion lag;
3. допустимые default policy values;
4. лимиты дневного расхода;
5. retention статистики и аудита;
6. identity provider Admin API;
7. число seller accounts и целевой sync SLA;
8. допустимость автоматического повышения ставок;
9. процедуру аварийного глобального отключения writes.

## 31. Definition of Done разработки

Система считается готовой, только когда:

1. выполнены AC-01–AC-16;
2. нет известных нарушений денежных единиц и WB rate limits;
3. все критические тесты и CI gates зелёные;
4. sandbox soak завершён без необъяснённых расхождений;
5. runbook проверен на сценариях WB outage, DB outage, 429 storm и stuck queue;
6. документация на русском актуальна;
7. секреты отсутствуют в репозитории и логах;
8. production по умолчанию остаётся write-disabled;
9. rollback и global kill switch проверены;
10. решение о включении production writes зафиксировано владельцем продукта.
