# Техническое задание: WB Bidder

## 1. Статус документа

| Поле | Значение |
|---|---|
| Назначение | Техническое задание на разработку сервиса автоматического управления ставками в кампаниях WB Продвижение |
| Версия | 1.2 |
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

1. получает состояние и статистику тысяч рекламных кампаний одного продавца;
2. хранит нормализованный снимок данных в PostgreSQL;
3. детерминированно рассчитывает показатели эффективности без ML;
4. принимает объяснимое решение об изменении ставки;
5. ставит решение в надёжную очередь;
6. применяет изменение через WB API с учётом лимитов;
7. повторно читает состояние WB и подтверждает фактическое применение;
8. сохраняет полный аудит входных данных, расчёта, решения и результата.

Бизнес-цель — максимизировать ожидаемую прибыль продавца при соблюдении заданных ограничений риска, бюджета и допустимых ставок.

Один deployment обслуживает ровно один WB seller account. Все кампании, targets, статистика, политики и product economics внутри deployment относятся к этому аккаунту. Поддержка нескольких seller accounts в одном deployment не требуется.

### 2.1. Важное ограничение бизнес-цели

Выручка не равна прибыли. Одних показов, кликов, заказов, рекламных расходов и атрибутированной выручки недостаточно, чтобы определить, какое изменение ставки увеличит прибыль.

Единственная цель автоматического управления ставками в первой версии — максимизация ожидаемой маржинальной прибыли после рекламы. Оптимизация по заданному ACOS, ROAS, числу заказов или выручке как самостоятельная цель в первую версию НЕ ВХОДИТ. ACOS и ROAS рассчитываются только как диагностические показатели.

Для каждого артикула WB (`nmId`) продавец ДОЛЖЕН предоставить `expectedContributionBeforeAdsMinor` — ожидаемый денежный вклад одной заказанной единицы до рекламных расходов. Значение уже учитывает в агрегированном виде:

- вероятность выкупа, отмены и возврата;
- ожидаемую фактически получаемую выручку;
- закупочную или производственную себестоимость;
- комиссию WB;
- прямую и обратную логистику;
- налоги;
- прочие ожидаемые удельные переменные расходы, которые в пределах расчётного окна предполагаются пропорциональными количеству заказанных единиц.

Постоянные расходы, не зависящие от дополнительного заказа и рекламной ставки, в этот показатель не включаются. Значение задаётся в minor units константы `ACCOUNT_CURRENCY` на одну единицу, может быть положительным, нулевым или отрицательным и имеет период действия.

Для окна статистики:

```text
expectedContributionBeforeAdsTotal =
  expectedOrderedUnits * expectedContributionBeforeAdsMinor

expectedProfit =
  expectedContributionBeforeAdsTotal - expectedAdvertisingSpend
```

Если действующее значение `expectedContributionBeforeAdsMinor` отсутствует или невалидно, объект получает решение `BLOCKED` с причиной `MISSING_PRODUCT_ECONOMICS` либо `INVALID_PRODUCT_ECONOMICS`. Ставка этого объекта не изменяется. Автоматический переход к другой цели оптимизации запрещён.

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
- один WB seller account на deployment;
- единая неизменяемая в runtime валюта аккаунта, заданная константой `ACCOUNT_CURRENCY`;
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
- самостоятельное чтение product economics из внешней ERP; ERP или оператор могут передавать агрегированное значение через внутренний API;
- изменение цен и скидок товара;
- попытка обойти или увеличить лимиты WB API;
- несколько WB seller accounts в одном deployment;
- выбор валюты через API, хранение валюты в бизнес-записях и конвертация валют.

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

`orderedUnits` для profit-формулы берётся из `shks`. Если `shks` отсутствует, fallback на `orders` разрешён только с флагом качества `ORDER_COUNT_AS_UNIT_FALLBACK` и отражается в explanation. Предоставленный продавцом `expectedContributionBeforeAdsMinor` должен иметь ту же семантику единицы, которая применяется к `orderedUnits`.

## 5. Архитектурные принципы

1. **Модульный монолит.** Первая версия поставляется одним NestJS-приложением bidder и отдельным NestJS-приложением mock server.
2. **PostgreSQL как источник истины.** Очередь, блокировки, снимки и аудит хранятся в одной БД.
3. **Разделение чтения, решения и записи.** Decision Engine не обращается к WB API.
4. **At-least-once + reconciliation.** Сеть не позволяет гарантировать exactly-once; система обеспечивает эффективную идемпотентность через ключ решения и чтение фактического состояния.
5. **Детерминированность.** Одинаковые входные данные, версия политики и конфигурация дают одинаковое решение.
6. **Fail closed.** При устаревших, неполных или противоречивых данных ставка не изменяется.
7. **Объяснимость.** Каждое решение содержит формулы, значения входов, сработавшие ограничения и причину.
8. **Деньги — целые числа.** Ставки и денежные суммы хранятся как `BigInt` в minor units константы `ACCOUNT_CURRENCY`; для ставок WB — копейки. `float` для денег запрещён.
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

Internal REST API ──> policies, product economics, pause/resume, audit
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
- `ProductEconomicsModule`;
- `AuditModule`;
- `ObservabilityModule`;
- `AdminApiModule`.

Запрещены циклические зависимости модулей. Интеграция с WB должна зависеть от интерфейсов доменного слоя, а не наоборот.

## 7. Полный цикл обработки

### 7.1. Шаг 1. Выбор кампаний

Data Sync Worker ДОЛЖЕН:

1. проверить, что автоматизация аккаунта включена;
2. получать список кампаний единственного настроенного WB-аккаунта;
3. обрабатывать кампании в статусах `9` и `11`, а завершённые `7` — только для дозагрузки статистики;
4. исключать удалённые, отменённые, неподдерживаемые и явно отключённые кампании;
5. разбивать ID на пакеты согласно лимиту метода;
6. хранить cursor/checkpoint каждой стадии обработки.

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

- время бизнес-периода;
- `sourceUpdatedAt`, если оно дано WB;
- `fetchedAt`;
- версию схемы адаптера;
- checksum нормализованного payload;
- идентификатор sync run.

Повторная загрузка одного периода должна быть идемпотентной: используется `upsert` по естественному составному ключу.

Между последовательными статистическими snapshots система формирует interval deltas и связывает их с подтверждённой ставкой target. Интервал, внутри которого ставка изменялась либо была неизвестна, не используется для оценки bid response.

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
- ожидаемый вклад до рекламы;
- ожидаемая прибыль после рекламы для текущей ставки;
- оценки заказанных единиц, расхода и прибыли candidate bids;
- полнота и свежесть данных.

### 7.4. Шаг 4. Решение

Decision Engine ДОЛЖЕН:

1. получить согласованный snapshot данных и активную версию политики;
2. разрешить действующую версию `ProductEconomics` для `nmId`;
3. проверить полноту, допуски и свежесть;
4. построить допустимые candidate bids и оценить ожидаемую прибыль каждого;
5. выбрать ставку с максимальной ожидаемой прибылью;
6. применить floor, cap, hysteresis, cooldown и ограничение скорости изменения;
7. сформировать `NO_CHANGE`, `INCREASE`, `DECREASE` или `BLOCKED`;
8. сохранить объяснение независимо от наличия изменения.

### 7.5. Шаг 5. Постановка в очередь

Решение с изменением ДОЛЖНО быть вставлено в очередь в той же транзакции, что и его audit record. Публикация во внешний broker в первой версии не требуется.

### 7.6. Шаг 6. Отправка в WB

Executor Engine ДОЛЖЕН:

- забрать решение с lease;
- перечитать актуальность политики и отсутствие более нового решения;
- применить endpoint-specific rate limit;
- сгруппировать совместимые решения в пакет;
- создать durable `WbWriteAttempt` непосредственно перед исходящим write-запросом;
- отправить запрос;
- сохранить transport result и redacted metadata в `WbWriteAttempt`;
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

Параметры единственного WB-аккаунта (`mode`, token secret reference, timezone, `ACCOUNT_CURRENCY`, automation/write flags) задаются типизированной конфигурацией deployment и не моделируются как изменяемая коллекция seller accounts в PostgreSQL.

#### `Campaign`

- `id UUID PK`;
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
- unique `wbCampaignId`;
- index `(status, supported)`.

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

- `wbCampaignId`, `nmId`, `date`;
- опционально `placement` и `normQueryNormalized`;
- исходные счётчики;
- `spendMinor`, `attributedRevenueMinor`;
- `fetchedAt`, `sourceVersion`, `syncRunId`;
- составной unique по измерениям дня;
- партиционирование по `date` СЛЕДУЕТ применять при подтверждённом объёме.

#### `BidPerformanceObservation`

Один нормализованный интервал, в течение которого target имел одну подтверждённую ставку:

- `targetId`;
- `confirmedBidKopecks`;
- `periodStart`, `periodEnd`;
- `orderedUnitsDelta`, `ordersDelta`, `spendDeltaMinor`, `attributedRevenueDeltaMinor`;
- `exposureMinutes`;
- ссылки на начальный и конечный statistical snapshot;
- `qualityFlags`;
- `inputChecksum`, `createdAt`;
- unique `(targetId, periodStart, periodEnd, confirmedBidKopecks)`.

Observation создаётся только из неотрицательных согласованных deltas. Интервал с изменением ставки, разрывом статистики, reset счётчика или неподтверждённым bid получает quality flag и исключается из profit estimator. Эти наблюдения являются источником `minBidObservations` из раздела 9.

#### `ProductEconomics`

- `id UUID PK`;
- `nmId`;
- `effectiveFrom`, `effectiveTo NULL`;
- `expectedContributionBeforeAdsMinor BIGINT`;
- `source MANUAL | IMPORT`;
- `sourceUpdatedAt NULL`;
- `sourceReference NULL`;
- `version BIGINT`;
- `mutationKey`;
- `inputChecksum`;
- `createdAt`, `createdByActor`;
- unique `(nmId, version)`;
- unique `mutationKey`;
- запрет пересекающихся периодов для одного `nmId`.

`expectedContributionBeforeAdsMinor` хранится как signed `BIGINT`: отрицательное значение является допустимым экономическим сигналом, а не ошибкой данных. Версии неизменяемы. Исправление создаёт новую версию; использованная версия сохраняется в каждом snapshot и решении.

#### `ProductEconomicsImport`

- `id UUID PK`;
- `status QUEUED | PROCESSING | COMPLETED | COMPLETED_WITH_ERRORS | FAILED`;
- `dryRun`;
- `idempotencyScope`, `idempotencyKey`, `requestChecksum`;
- `totalItems`, `processedItems`, `validatedItems`, `succeededItems`, `failedItems`;
- `leaseOwner`, `leaseUntil`, `attemptCount`, `lastError`;
- `createdAt`, `startedAt`, `finishedAt`;
- `createdByActor`, `correlationId`;
- unique `(idempotencyScope, idempotencyKey)`.

#### `ProductEconomicsImportItem`

- `importId`;
- `rowId`;
- `nmId`;
- нормализованные входные поля и checksum строки;
- `status PENDING | PROCESSING | VALIDATED | SUCCEEDED | FAILED`;
- `errorCode`, `errorDetail`;
- `expectedCurrentVersion`, `actualCurrentVersion`, `createdVersion`;
- unique `(importId, rowId)`;
- unique `(importId, nmId)`.

Исходный токен авторизации не хранится. Payload и тексты ошибок проходят общую redaction policy.

#### `BiddingPolicy`

- область: deployment default, campaign или target;
- приоритет: target > campaign > deployment default;
- `executionMode APPLY | OBSERVE_ONLY`;
- окна статистики;
- minimum sample thresholds;
- `candidateBidStepKopecks`, `minBidObservations`;
- `minExpectedProfitImprovementMinor`;
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
- `productEconomicsId`, `productEconomicsVersion`;
- `expectedContributionBeforeAdsMinor`;
- все рассчитанные метрики;
- оценки и profit score рассмотренных candidate bids;
- completeness flags;
- `inputSnapshotChecksum`;
- algorithm version;
- `calculatedAt`;
- immutable после создания.

#### `BidDecision`

- `id UUID PK`, значение UUIDv7 генерируется приложением;
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
- `decisionInputChecksum`;
- `createdAt`;
- unique `decisionInputChecksum`.

#### `DecisionQueueItem`

- `decisionId`, unique;
- `status`;
- `priority`;
- `availableAt`;
- `leaseOwner`, `leaseUntil`;
- `attemptCount`, `verificationAttemptCount`;
- `lastErrorClass`, `lastErrorCode`;
- `lastHttpStatus`;
- `sentAt`, `verifiedAt`;
- index `(status, availableAt, priority)`.

#### `WbWriteAttempt`

- `id UUID PK`;
- `decisionId FK`;
- endpoint key, method;
- correlation ID, WB request ID;
- `attemptNumber`;
- `status PREPARED | ACCEPTED | REJECTED | UNKNOWN`;
- `preparedAt`, `completedAt`, latency;
- HTTP status;
- rate-limit response headers;
- redacted request/response digest;
- error class и error code;
- `reconciliationStatus NOT_REQUIRED | PENDING | CONFIRMED | MISMATCH`, `reconciledAt`;
- unique `(decisionId, attemptNumber)`;
- index `(status, preparedAt)`.

В PostgreSQL сохраняется одна запись на каждую попытку исходящего write-запроса к WB. Запись создаётся до отправки и дополняется transport result после ответа. HTTP `2xx` даёт статус `ACCEPTED`, но окончательное применение подтверждается только reconciliation. Timeout или разрыв соединения после возможной отправки даёт `UNKNOWN`; повторный write запрещён до завершения reconciliation.

Read-запросы не создают `WbWriteAttempt`. Их вызовы отражаются в structured logs и Prometheus-метриках, агрегаты выполнения — в `SchedulerRun`, а нормализованные бизнес-результаты — в соответствующих snapshots. Полные request/response payload не сохраняются в `WbWriteAttempt`; диагностический payload для аномалий следует отдельной ограниченной retention policy из раздела 13.3.

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
- `inputSnapshotChecksum` и `decisionInputChecksum`;
- весь набор промежуточных значений;
- сработавшие guardrails.

`inputSnapshotChecksum` однозначно идентифицирует нормализованный снимок данных, из которого рассчитан `MetricSnapshot`. Для `input-snapshot-v1` в canonical payload ДОЛЖНЫ входить все фактически использованные при расчёте значения:

- естественный ключ target: `wbCampaignId`, `nmId`, `placement`, `normalizedNormQuery`;
- границы статистических периодов, нормализованные значения использованных исходных записей и их source checksum;
- выбранные `BidPerformanceObservation` с их естественными ключами, подтверждёнными ставками, интервалами, deltas, `exposureMinutes`, `qualityFlags` и `inputChecksum`;
- текущая подтверждённая ставка, minimum bid WB и состояние подтверждения;
- `productEconomicsVersion` и `expectedContributionBeforeAdsMinor`;
- состояние бюджета, полнота, свежесть и иные входные flags, если они влияют на рассчитанные метрики.

Рассчитанные метрики и candidate results в `inputSnapshotChecksum` не входят: это результаты преобразования входного снимка. Никакое прочитанное или вычисленное до построения `MetricSnapshot` значение, влияющее на его содержимое, не может оставаться за пределами canonical payload.

`decisionInputChecksum` однозначно идентифицирует полный набор входов конкретного запуска Decision Engine. Для `bid-decision-v1` в canonical payload ДОЛЖНЫ входить:

- `inputSnapshotChecksum`;
- версия и полный разрешённый набор параметров действующей политики;
- `algorithmVersion`;
- единый `decisionAt` в UTC, зафиксированный в начале расчёта и повторно используемый при retry;
- фактически использованные состояния cooldown, дневных ограничений, budget guardrail и остальных ограничений, если они ещё не представлены в `inputSnapshotChecksum`.

Оба checksum вычисляются по одной формуле:

```text
lowerHex(SHA-256(UTF8(scope + "\n" + RFC8785(payload))))
```

Для `inputSnapshotChecksum` значение `scope` равно `input-snapshot-v1`, для `decisionInputChecksum` — `bid-decision-v1`. Результат — 64 lowercase hex-символа. Перед канонизацией применяются следующие правила:

- `BIGINT`, денежные значения и идентификаторы сериализуются десятичными строками без ведущих нулей;
- даты сериализуются в RFC 3339 UTC с миллисекундами и суффиксом `Z`;
- отсутствующее nullable-поле представляется явным `null`;
- неупорядоченные коллекции сортируются по естественному ключу, а значимый порядок сохраняется;
- имена и значения enum используются в нормативном регистре;
- UUID записей, `calculatedAt`, `syncRunId`, correlation ID и другие технические metadata исключаются, если они не влияют на результат;
- любое время или metadata, фактически использованное для freshness, cooldown, календарного или budget-расчёта, включается как соответствующий нормализованный вход.

Версия схемы является частью `scope`. Изменение состава или правил канонизации требует новой версии схемы и golden fixtures. Система ДОЛЖНА сохранять версию схемы и ссылки на immutable-входы, достаточные для повторного построения canonical payload; сам payload не должен попадать в логи или audit без применения общей redaction и retention policy.

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

expectedContributionBeforeAdsTotal =
  expectedOrderedUnits * expectedContributionBeforeAdsMinor

expectedProfit =
  expectedContributionBeforeAdsTotal - expectedAdvertisingSpend
```

`expectedContributionBeforeAdsMinor` уже содержит ожидание выкупа, возврата, полученной выручки и всех переменных расходов. Decision Engine НЕ ДОЛЖЕН повторно применять к нему buyout rate, комиссию, налог или логистику.

Если конкретное поле WB описывает заказы, а не выкупы, название внутреннего поля ДОЛЖНО сохранять эту семантику. Запрещено автоматически называть `orders` продажами. ACOS и ROAS сохраняются в snapshot и explanation, но не являются целями выбора ставки.

### 9.4. Оценка прибыли допустимых ставок

Decision Engine строит конечное множество `candidateBids` из:

- текущей подтверждённой ставки;
- `max(policyMin, wbMinimumBid)`;
- `policyMaxBid`;
- исторически наблюдавшихся подтверждённых ставок объекта;
- соседних ставок `currentBid ± candidateBidStepKopecks`, не выходящих за floor/cap;
- exploration candidate, только если он разрешён разделом 9.7.

Для каждой ставки детерминированный versioned estimator рассчитывает по наблюдениям того же target:

```text
expectedOrderedUnits(candidateBid)
expectedAdvertisingSpend(candidateBid)

expectedProfit(candidateBid) =
  expectedOrderedUnits(candidateBid)
  * expectedContributionBeforeAdsMinor
  - expectedAdvertisingSpend(candidateBid)
```

Оценка строится только по периодам, в которых фактическая ставка была подтверждена после последнего изменения. Наблюдения группируются по ставке и нормализуются на одинаковую длительность окна. Кандидат без `minBidObservations` и минимального объёма данных исключается, если это не отдельно разрешённый exploration candidate.

Источником оценки являются `BidPerformanceObservation`, а не произвольное сопоставление дневной статистики с последней известной ставкой.

Алгоритм первой версии не использует ML. Конкретный способ сглаживания соседних bid buckets, поправки на сезонность и формирования доверительной консервативной оценки ДОЛЖЕН иметь отдельную версию и golden tests. При одинаковых входах он обязан возвращать одинаковые оценки.

### 9.5. Выбор ставки с максимальной ожидаемой прибылью

До выбора `bestBid` применяются все предусмотренные спецификацией блокирующие проверки, требования к полноте данных и правила допуска кандидатов из разделов 9.2–9.4. Если только текущая ставка обеспечена достаточными обычными наблюдениями и exploration candidate не разрешён условиями раздела 9.7, результат `NO_CHANGE` с причиной `INSUFFICIENT_BID_RESPONSE_DATA`; дальнейший выбор причины по ожидаемой прибыли не выполняется. Разрешённый exploration candidate является предусмотренным разделом 9.4 исключением из требований к `minBidObservations` и минимальному объёму данных, обходит этот ранний результат и передаётся на оценку вместе с текущей ставкой.

Среди допустимых и обеспеченных данными кандидатов выбирается:

```text
bestBid = argmax(expectedProfit(candidateBid))
```

Правила разрешения равенства:

- сначала текущая ставка;
- затем меньшая ставка;
- затем меньшее абсолютное изменение.

После выбора `bestBid` причина определяется в следующем порядке:

1. Если `bestBid` равен текущей ставке, в том числе потому, что текущая ставка выиграла по правилам разрешения равенства, результат — `NO_CHANGE` с причиной `MAX_PROFIT_CURRENT_BID`. Порог улучшения для этого случая не проверяется.
2. Если `bestBid` отличается от текущей ставки, его ожидаемая прибыль выше ожидаемой прибыли текущей ставки. Если абсолютное улучшение меньше `minExpectedProfitImprovementMinor`, результат — `NO_CHANGE` с причиной `NO_PROFIT_IMPROVEMENT`.
3. Если абсолютное улучшение альтернативного кандидата достигает `minExpectedProfitImprovementMinor`, кандидат переходит к применимому сценарию повышения или снижения и последующим bounds и guardrails.

Абсолютный порог используется потому, что относительное улучшение неоднозначно при нулевой или отрицательной текущей прибыли.

Правила:

- нулевое или отрицательное `expectedContributionBeforeAdsMinor` является валидным входом, запрещает повышение и выбирает допустимый floor с причиной `NEGATIVE_CONTRIBUTION_BEFORE_ADS`, если текущая ставка выше floor;
- если есть расход, но нет заказов, применяется отдельное правило zero-conversion;
- округление ставки выполняется в копейках предсказуемым способом и тестируется;
- итоговая ставка ограничивается `max(policyMin, wbMinimumBid)` и `policyMaxBid`;
- ограничения скорости изменения могут заменить `bestBid` ближайшим допустимым кандидатом только после повторного расчёта его ожидаемой прибыли;
- если WB minimum выше policy maximum, применение блокируется с `MIN_ABOVE_POLICY_MAX`.

### 9.6. Правило zero-conversion

Если после исключения conversion lag:

- `orders == 0`;
- `clicks >= minClicks` или `spend >= zeroConversionSpendThreshold`;

ставка снижается на `zeroConversionDecreasePpm`, но не ниже допустимого floor.

Защитная пониженная ставка добавляется как candidate bid и проходит обычные ограничения раздела 9.5. Для неё используется консервативная оценка с нулём ожидаемых заказов; повышение в zero-conversion сценарии запрещено. Если floor уже достигнут, решение `NO_CHANGE` с причиной `AT_FLOOR`. Автоматическое удаление кластера или остановка кампании не выполняется.

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

Exploration является ограниченным способом получить данные для последующей максимизации прибыли, а не отдельной целью оптимизации. В explanation сохраняются ожидаемая стоимость эксперимента, его предел и причина недостатка bid-response данных.

### 9.8. Hysteresis, cooldown и ограничения

- изменение меньше `minAbsoluteChangeKopecks` или `minRelativeChangePpm` не применяется;
- после подтверждённого изменения объект не меняется в течение `cooldownMinutes`;
- суммарное изменение от первой подтверждённой ставки текущих суток ограничено `maxDailyIncreasePpm` и `maxDailyDecreasePpm`;
- policy min/max применяются после расчёта, но до округления к допустимой ставке;
- внезапное изменение product economics или policy version снимает cooldown только при явном флаге администратора;
- защитное снижение при превышении бюджета МОЖЕТ игнорировать обычный cooldown, но не идемпотентность.

### 9.9. Budget guardrail

Decision Engine блокирует повышение и разрешает только снижение, если:

- остаток бюджета неизвестен или устарел сверх допустимого порога;
- расход за сутки превысил `dailySpendLimit`;
- ожидаемый расход до конца суток превышает limit;
- кампания близка к исчерпанию бюджета;
- обнаружен расходовой spike относительно baseline.

Первая версия не пополняет и не меняет бюджет кампании.

### 9.10. Причины решения

Минимальный enum и семантика его значений:

| Reason code | `BidDecision.action` / результат | Условие и смысл |
|---|---|---|
| `PROFITABLE_INCREASE` | `INCREASE` | Обеспеченный данными допустимый кандидат выше текущей ставки имеет максимальную ожидаемую прибыль, улучшение достигает `minExpectedProfitImprovementMinor`, а ограничения роста разрешают изменение. |
| `MAX_PROFIT_CURRENT_BID` | `NO_CHANGE` | Текущая ставка является argmax среди обеспеченных данными допустимых кандидатов с учётом правил разрешения равенства, причём достаточно наблюдений есть минимум для одной альтернативной ставки; другой кандидат с большей ожидаемой прибылью не найден. Ограничения изменения не являются причиной сохранения ставки. |
| `NO_PROFIT_IMPROVEMENT` | `NO_CHANGE` | Лучший альтернативный обеспеченный данными кандидат имеет ожидаемую прибыль выше текущей, но абсолютное улучшение меньше `minExpectedProfitImprovementMinor`. |
| `UNPROFITABLE_DECREASE` | `DECREASE` | Обеспеченный данными допустимый кандидат ниже текущей ставки максимизирует ожидаемую прибыль и даёт требуемое улучшение в обычном сценарии убыточности, не относящемся к zero-conversion или неположительному вкладу до рекламы. |
| `ZERO_CONVERSION_DECREASE` | `DECREASE` | После исключения conversion lag заказов нет, а порог кликов или расходов достигнут; текущая ставка выше допустимого floor, а прошедший оценку и ограничения защитный пониженный кандидат не ниже floor и может быть равен ему. |
| `INSUFFICIENT_DATA` | `NO_CHANGE` | Свежий согласованный snapshot не достигает общих minimum sample thresholds для надёжной оценки даже текущего сценария; это не специальный случай нехватки наблюдений по альтернативным ставкам. Разрешённое правилами exploration может вместо этого сформировать отдельное решение. |
| `INSUFFICIENT_BID_RESPONSE_DATA` | `NO_CHANGE` или exploration `INCREASE` | Текущая ставка обеспечена достаточными данными, но для сравнения нет другого кандидата с требуемыми `minBidObservations` и объёмом данных; причина описывает именно недостаток истории отклика на разные ставки. Повышение допустимо только при одновременном выполнении всех условий exploration из раздела 9.7, а его стоимость, предел и причина сохраняются в explanation. |
| `STALE_DATA` | `BLOCKED`; ставка не изменяется | Необходимая для оценки ставки статистика или другой основной вход расчёта старше разрешённого `maxDataAgeMinutes` либо соответствующего freshness threshold, поэтому решение, способное создать write, запрещено. Устаревшие бюджетные данные обрабатываются отдельным budget guardrail. |
| `MISSING_PRODUCT_ECONOMICS` | `BLOCKED`; ставка не изменяется | Для `nmId` отсутствует действующая версия `ProductEconomics` с `expectedContributionBeforeAdsMinor`; переход к другой цели оптимизации запрещён. |
| `INVALID_PRODUCT_ECONOMICS` | `BLOCKED`; ставка не изменяется | Действующая версия `ProductEconomics` найдена, но её обязательные значения или период действия не проходят валидацию; переход к другой цели оптимизации запрещён. |
| `NEGATIVE_CONTRIBUTION_BEFORE_ADS` | `DECREASE` | `expectedContributionBeforeAdsMinor` равен нулю или отрицателен: повышение запрещается, а текущая ставка выше floor и снижается до допустимого floor. Если снижение уже невозможно из-за нижней границы, используется причина границы. |
| `BUDGET_GUARDRAIL` | `NO_CHANGE` или защитный `DECREASE`; никогда `INCREASE` | Бюджет неизвестен или устарел, limit превышен или прогнозируется его превышение, бюджет близок к исчерпанию либо обнаружен расходовой spike. Guardrail отклоняет повышение; допускается только прошедшее остальные ограничения защитное снижение, которое при превышении бюджета может игнорировать обычный cooldown. |
| `COOLDOWN` | `NO_CHANGE` | Рассчитанное повышение или снижение прошло порог значимости, но после последней подтверждённой смены ставки ещё не истёк `cooldownMinutes`; специальное защитное снижение бюджета может иметь установленное разделом 9.8 исключение. |
| `BELOW_MIN_CHANGE` | `NO_CHANGE` | Выбранное изменение после применения границ, ограничения скорости и округления меньше `minAbsoluteChangeKopecks` или `minRelativeChangePpm`; это не cooldown и не достижение floor/cap. |
| `AT_FLOOR` | `NO_CHANGE` | Правило требует снижения, в том числе при zero-conversion, но текущая ставка уже равна `max(policyMin, wbMinimumBid)`. Причина относится только к предотвращённому снижению. |
| `AT_CAP` | `NO_CHANGE` | Прибыльный или exploration-сценарий требует повышения, но текущая ставка уже равна `policyMaxBid`. Причина относится только к предотвращённому повышению; успешное повышение, ограниченное значением cap, сохраняет причину повышения. |
| `MIN_ABOVE_POLICY_MAX` | `BLOCKED`; ставка не изменяется | Актуальная минимальная ставка WB выше `policyMaxBid`, поэтому множество применимых ставок пусто и write запрещён. |
| `UNSUPPORTED_CAMPAIGN` | `BLOCKED`; ставка не изменяется | Тип, статус, модель оплаты, тип ставки, размещение или их комбинация не поддерживают требуемую операцию WB API; запрос на изменение не формируется. |
| `OBSERVE_ONLY` | `NO_CHANGE`; только explanation | Активная политика имеет `executionMode=OBSERVE_ONLY`: расчёт кандидатов и рекомендуемого изменения сохраняется для наблюдения, но применимое изменение и queue item для WB write не создаются. |
| `MANUAL_PAUSE` | `BLOCKED`; ставка не изменяется | Автоматизация аккаунта, кампании или target явно приостановлена оператором либо отключена активной политикой; автоматическое возобновление и WB write запрещены. |
| `DATA_INCONSISTENCY` | `BLOCKED`; ставка не изменяется | Входы одного расчёта не образуют согласованный snapshot, например расходятся target, подтверждённая ставка, окна, версии политики или product economics; расчёт нельзя безопасно применить до следующей успешной синхронизации. |

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

### 10.2. Идентификатор решения и идемпотентность

`BidDecision.id` является UUIDv7 и используется как технический идентификатор решения в очереди, audit, логах и `WbWriteAttempt`. Случайность UUID не используется для дедупликации.

Семантическую идемпотентность обеспечивает единственный `decisionInputChecksum`, определённый в разделе 9.1. Транзакция создания решения и очереди использует unique constraint `BidDecision.decisionInputChecksum`:

- если значения checksum ещё нет, создаются новый `BidDecision` и не более одного связанного `DecisionQueueItem`;
- если checksum уже существует, используется существующий `BidDecision`, а второй `DecisionQueueItem` не создаётся;
- если одинаковому checksum соответствует отличающийся результат решения, операция завершается ошибкой `DATA_INCONSISTENCY` как нарушение детерминированности.

`targetBidKopecks` не входит в fingerprint как отдельное поле, поскольку это детерминированный результат, а не вход. Target, product economics, policy и algorithm не дублируются в механизме идемпотентности отдельными полями: они уже покрыты `decisionInputChecksum`.

Retry постановки или отправки использует существующий `decisionId`; новый UUID для retry не генерируется. UUIDv5 от checksum и отдельный составной `idempotencyKey` для `BidDecision` не требуются.

### 10.3. Конкуренция

- Claim выполняется через `SELECT ... FOR UPDATE SKIP LOCKED`.
- Lease имеет TTL и heartbeat.
- Для одного target одновременно допускается только одно non-terminal решение.
- Более новое решение может пометить ещё не отправленное старое как `SUPERSEDED`.
- После `SENT` supersede запрещён до reconciliation.
- Изменения одного target обрабатываются последовательно.

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

`DATA_SYNC_CRON`, `DECISION_CRON` и `CAMPAIGN_APPLY_CRON` конфигурируются независимо. Таким образом, частота обновления данных в БД не связана с частотой применения настроек через WB API. По умолчанию тяжёлые jobs не должны стартовать в одну секунду, чтобы избегать пиков. Если предыдущий run того же job ещё активен, новый запуск не создаёт параллельный дубликат.

### 11.2. Блокировки jobs

- Для scheduler используется PostgreSQL advisory lock или таблица lease.
- Для одного job одновременно работает не более одного worker.
- Несколько реплик bidder поддерживаются без дублирования job.
- Пропущенный запуск не порождает неограниченную очередь старых запусков.
- Каждый run имеет deadline и checkpoint.

### 11.3. Тысячи кампаний

- Все WB-запросы пакетируются по фактическим ограничениям endpoint.
- Кампании обрабатываются страницами/порциями без загрузки всего набора в память.
- Статистика синхронизируется инкрементально с небольшим overlap для поздних изменений.
- Данные за overlap upsert-ятся.
- Для backfill создаётся отдельный низкоприоритетный job.
- Горизонтальное масштабирование ограничивается общим rate limiter единственного WB-аккаунта, а не числом pod.

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

1. общий safety cap на настроенный WB-аккаунт;
2. отдельный bucket на endpoint key.

Обязательные env:

- `WB_API_GLOBAL_RATE_LIMIT_REQUESTS`, default `5`;
- `WB_API_GLOBAL_RATE_LIMIT_INTERVAL_MS`, default `1000`;
- `WB_API_GLOBAL_RATE_LIMIT_BURST`, default `5`;
- `WB_API_RATE_LIMITS_JSON` — переопределение endpoint buckets;
- `WB_API_MAX_IN_FLIGHT`, default `5`.

Встроенный профиль endpoint limits должен соответствовать таблице раздела 4.2. Более строгий из общего и endpoint-specific limit всегда побеждает. Профиль sandbox по умолчанию совпадает с документированным профилем продвижения; пользователь может задать более строгие значения.

Limiter ДОЛЖЕН быть общим для всех реплик deployment. Допустим PostgreSQL-based limiter; in-memory limiter разрешён только при одной реплике и в `mock`.

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
| `401` | остановить WB-интеграцию deployment, alert; токен не логировать |
| `404` | сверить endpoint/profile; terminal либо resync сущности |
| `409` | классифицировать по телу; повторять только документированно временные случаи |
| `429` | retry по заголовкам |
| `5xx` | exponential backoff + full jitter |
| timeout до отправки | retryable |
| timeout после возможной отправки | сначала reconciliation |

Retry policy задаётся отдельно для read, write и verify. Бесконечные retries запрещены.

### 12.5. Circuit breaker

- отдельный breaker на endpoint group;
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
- текущая ставка подтверждена после последнего отправленного решения.

### 13.3. Аномалии данных

При отрицательных счётчиках, денежном значении, которое нельзя точно нормализовать в minor units, уменьшении кумулятивного счётчика или невозможной комбинации campaign/bid/payment type:

- исходный payload сохраняется в redacted diagnostic storage;
- snapshot отмечается `INVALID`;
- решение не применяется;
- увеличивается metric;
- создаётся audit event.

## 14. Executor Engine

### 14.1. Пакетирование

В один запрос объединяются только решения с одинаковыми:

- endpoint;
- payment/bid type;
- совместимым payload;
- приоритетом и временем доступности.

Размер batch не превышает лимита endpoint. Частичный ответ разбирается по элементам, если API предоставляет такую детализацию.

### 14.2. Приоритет

Рекомендуемый порядок:

1. защитное снижение при перерасходе;
2. обычное снижение;
3. обычное повышение по убыванию ожидаемого прироста прибыли на единицу дополнительного рекламного расхода;
4. exploration.

Приоритет не отменяет последовательность изменений одного target и endpoint rate limits.

### 14.3. Перед отправкой

Executor повторно проверяет:

- автоматизация не выключена;
- решение не superseded;
- политика всё ещё действительна;
- версия product economics всё ещё является действующей;
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
- bid-response history for several confirmed bids;
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

### 15.5. Swagger и OpenAPI

Mock-сервер ДОЛЖЕН предоставлять:

- Swagger UI на `GET /docs`;
- машиночитаемый документ OpenAPI 3.x в JSON на `GET /docs-json`.

OpenAPI-документ ДОЛЖЕН включать всё реализованное совместимое подмножество WB API и все служебные endpoints `/__mock`, в том числе request/response schemas, обязательные path/query/body parameters, денежные единицы, headers, успешные ответы и предусмотренные ошибки.

Документ генерируется из runtime DTO и metadata приложения и не ведётся как независимый статический контракт. Изменение mock endpoint, DTO или сценария, влияющего на HTTP-контракт, без соответствующего изменения OpenAPI-документа блокирует CI.

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

- policies: CRUD с неизменяемыми версиями;
- product economics: чтение, единичное версионированное изменение и асинхронный batch-импорт;
- campaign automation: включить, выключить, observe-only;
- manual resync/recalculate без обхода блокировок;
- decisions: список, детали, explanation;
- queue failures: просмотр и безопасный retry terminal item;
- audit events: фильтрация по campaign/target/correlation ID.

Токен WB никогда не возвращается API. Все mutating endpoints должны быть аутентифицированы, авторизованы и создавать audit event. Конкретный корпоративный identity provider выбирается до production; до этого API слушает только localhost/private network и защищается service token.

Bidder ДОЛЖЕН предоставлять Swagger UI на `GET /docs` и машиночитаемый документ OpenAPI 3.x в JSON на `GET /docs-json`. Документ ДОЛЖЕН покрывать все endpoints `/api/v1`, включая request/response schemas, параметры, единицы измерения, форматы дат, idempotency и conditional headers, permission requirements, security schemes, успешные ответы и `application/problem+json`.

OpenAPI-документ генерируется из runtime DTO и metadata приложения и не ведётся как независимый статический контракт. Изменение endpoint или DTO без соответствующего изменения документа блокирует CI. Swagger UI и примеры OpenAPI не должны содержать WB token, service token, credentials, персональные данные или значения секретов. В production доступ к `/docs` и `/docs-json` ДОЛЖЕН быть ограничен не слабее, чем доступ к внутреннему REST API bidder.

### 17.1. Общий контракт product economics

Во всех product economics endpoints:

- чтение требует permission `product-economics:read`, single update — `product-economics:write`, batch import — `product-economics:import`;
- `nmId` передаётся десятичной строкой положительного WB ID;
- `expectedContributionBeforeAdsMinor` передаётся signed decimal string в minor units константы `ACCOUNT_CURRENCY`, например `"125000"` для `1250,00` и `"-500"` для `-5,00`;
- валюта не передаётся в path, query, request или response: все денежные значения internal API относятся к `ACCOUNT_CURRENCY`;
- даты передаются как RFC 3339 UTC;
- `effectiveTo`, если задан, строго больше `effectiveFrom`;
- изменение никогда не перезаписывает использованную версию, а создаёт следующую immutable-версию;
- два периода одного `nmId` не могут пересекаться;
- исторические `MetricSnapshot` и `BidDecision` после изменения не пересчитываются автоматически;
- request-level ошибки возвращаются как `application/problem+json` с `type`, `title`, `status`, `code`, `detail`, `correlationId` и опциональным `errors[]`.
- область уникальности `Idempotency-Key` — HTTP method + canonical path; срок хранения результата не меньше audit retention.

`expectedContributionBeforeAdsMinor` относится к одной единице `orderedUnits` из раздела 4.4 и уже включает ожидание невыкупа, возврата, полученной выручки, всех налогов и переменных расходов. API не принимает отдельные поля себестоимости, комиссии, логистики или налога.

### 17.2. Чтение значения одной позиции

```http
GET /api/v1/product-economics/{nmId}?at={RFC3339}
Authorization: Bearer <service-token>
```

`at` опционален, default — текущее время. Ответ `200`:

```json
{
  "id": "8af46341-08fd-4d2c-9d16-4911f1d2eacd",
  "nmId": "123456789",
  "expectedContributionBeforeAdsMinor": "125000",
  "effectiveFrom": "2026-08-01T00:00:00Z",
  "effectiveTo": null,
  "source": "MANUAL",
  "sourceUpdatedAt": "2026-07-31T18:20:00Z",
  "sourceReference": "operator-ticket-481",
  "version": 4,
  "createdAt": "2026-07-31T18:21:10Z",
  "createdByActor": "service-account:pricing-admin"
}
```

Ответ содержит `ETag: "product-economics-4"`. Если на момент `at` действующей версии нет, возвращается `404 PRODUCT_ECONOMICS_NOT_FOUND`.

### 17.3. Единичное изменение позиции

```http
PUT /api/v1/product-economics/{nmId}
Authorization: Bearer <service-token>
Idempotency-Key: <UUID>
If-Match: "product-economics-4"
Content-Type: application/json
```

Для первой версии позиции вместо `If-Match` обязателен `If-None-Match: *`. Тело:

```json
{
  "expectedContributionBeforeAdsMinor": "137500",
  "effectiveFrom": "2026-08-05T00:00:00Z",
  "effectiveTo": null,
  "sourceUpdatedAt": "2026-08-04T15:00:00Z",
  "sourceReference": "operator-ticket-519",
  "changeReason": "Updated expected contribution after supplier price change"
}
```

Семантика:

1. Сервер валидирует signed `BIGINT`, даты, optimistic-lock header и отсутствие конфликтующей будущей версии.
2. В одной транзакции открытая предыдущая версия закрывается на `effectiveFrom`, а новая версия вставляется с `source=MANUAL`.
3. Если предыдущий период нельзя закрыть без пересечения или отрицательной длительности, запрос отклоняется целиком.
4. Успешный ответ — `201 Created`, полное представление новой версии, `Location` на endpoint чтения с `at=effectiveFrom` и новый `ETag`.
5. Повтор с тем же `Idempotency-Key` и тем же checksum возвращает тот же результат без новой версии и audit event. Повтор ключа с другим payload возвращает `409 IDEMPOTENCY_KEY_REUSED`.
6. `If-Match` должен совпадать с версией, действующей непосредственно перед `effectiveFrom`; устаревшая версия возвращает `412 VERSION_MISMATCH`, отсутствие обязательного conditional header — `428 PRECONDITION_REQUIRED`.
7. Каждое успешное изменение создаёт append-only audit event с before/after, actor, причиной, idempotency key и correlation ID.

Дополнительные ошибки: `400 INVALID_JSON`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `409 EFFECTIVE_PERIOD_OVERLAP`, `422 INVALID_NM_ID`, `422 VALUE_OUT_OF_BIGINT_RANGE`.

### 17.4. Создание batch-импорта

```http
POST /api/v1/product-economics/imports
Authorization: Bearer <service-token>
Idempotency-Key: <UUID>
Content-Type: application/json
```

Один запрос содержит от 1 до 10 000 позиций:

```json
{
  "dryRun": false,
  "changeReason": "Scheduled ERP product economics refresh",
  "items": [
    {
      "rowId": "erp-row-000001",
      "nmId": "123456789",
      "expectedCurrentVersion": 4,
      "expectedContributionBeforeAdsMinor": "137500",
      "effectiveFrom": "2026-08-05T00:00:00Z",
      "effectiveTo": null,
      "sourceUpdatedAt": "2026-08-04T15:00:00Z",
      "sourceReference": "erp-export-2026-08-04"
    },
    {
      "rowId": "erp-row-000002",
      "nmId": "987654321",
      "expectedCurrentVersion": 0,
      "expectedContributionBeforeAdsMinor": "-2500",
      "effectiveFrom": "2026-08-05T00:00:00Z",
      "effectiveTo": null,
      "sourceUpdatedAt": "2026-08-04T15:00:00Z",
      "sourceReference": "erp-export-2026-08-04"
    }
  ]
}
```

Правила:

- `rowId` обязателен, уникален внутри импорта и возвращается во всех результатах;
- `nmId` не может повторяться внутри одного импорта;
- `changeReason` обязателен и сохраняется в audit;
- `expectedCurrentVersion=0` означает, что у позиции ещё не должно существовать версии; иное значение должно совпадать с версией, действующей непосредственно перед `effectiveFrom`;
- request-level валидация проверяет размер массива, уникальность `rowId`/`nmId`, типы и лимит payload `20 MiB` до постановки задания в очередь;
- item-level валидация и запись выполняются worker-ом независимо для каждой позиции;
- каждая успешная строка в своей транзакции закрывает предыдущий период и создаёт immutable-версию с `source=IMPORT`;
- single update записывает `mutationKey` из canonical path и idempotency key; batch row использует `IMPORT:{importId}:{rowId}`, поэтому retry строки не создаёт дубликат;
- ошибка одной строки не откатывает успешные строки; итоговый статус становится `COMPLETED_WITH_ERRORS`;
- при `dryRun=true` выполняются все проверки, но версии product economics и их audit events не создаются;
- deployment может иметь не более одного batch import в `PROCESSING`; остальные задания остаются `QUEUED`;
- повтор с тем же idempotency key и payload возвращает тот же `importId`; другой payload с тем же ключом возвращает `409 IDEMPOTENCY_KEY_REUSED`;
- request checksum, actor, correlation ID и агрегированные результаты сохраняются в audit.

Request-level ошибки включают `400 EMPTY_ITEMS`, `400 DUPLICATE_ROW_ID`, `400 DUPLICATE_NM_ID`, `413 PAYLOAD_TOO_LARGE` и `422 TOO_MANY_ITEMS`. Item-level ошибки включают все ошибки single update, а также `VERSION_MISMATCH` и `ROW_PROCESSING_FAILED`.

Ответ `202 Accepted`:

```json
{
  "importId": "6bd2135d-3c3d-4a9e-ac0c-84600e9aaf31",
  "status": "QUEUED",
  "dryRun": false,
  "totalItems": 2,
  "createdAt": "2026-08-04T15:02:00Z",
  "links": {
    "self": "/api/v1/product-economics/imports/6bd2135d-3c3d-4a9e-ac0c-84600e9aaf31",
    "items": "/api/v1/product-economics/imports/6bd2135d-3c3d-4a9e-ac0c-84600e9aaf31/items"
  }
}
```

Импорт имеет состояния `QUEUED`, `PROCESSING`, `COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED`. `FAILED` используется только для сбоя задания целиком; item-level ошибки дают `COMPLETED_WITH_ERRORS`.

Для dry-run `validatedItems` содержит число строк `VALIDATED`, `succeededItems=0`; для обычного импорта `validatedItems=0`. Всегда выполняется инвариант `processedItems = validatedItems + succeededItems + failedItems`.

Import worker использует lease. После рестарта задание с истёкшим lease продолжается с незавершённых строк. Повторная обработка уже успешной строки не создаёт новую версию благодаря уникальным import item, version и idempotency constraints. После исчерпания ограниченного числа job-level попыток задание получает `FAILED`, а уже успешно записанные строки не откатываются.

### 17.5. Статус и результаты batch-импорта

```http
GET /api/v1/product-economics/imports/{importId}
Authorization: Bearer <service-token>
```

Ответ `200`:

```json
{
  "importId": "6bd2135d-3c3d-4a9e-ac0c-84600e9aaf31",
  "status": "COMPLETED_WITH_ERRORS",
  "dryRun": false,
  "totalItems": 1000,
  "processedItems": 1000,
  "validatedItems": 0,
  "succeededItems": 998,
  "failedItems": 2,
  "createdAt": "2026-08-04T15:02:00Z",
  "startedAt": "2026-08-04T15:02:03Z",
  "finishedAt": "2026-08-04T15:02:17Z",
  "requestChecksum": "sha256:...",
  "errorSummary": {
    "VERSION_MISMATCH": 1,
    "ROW_PROCESSING_FAILED": 1
  }
}
```

Построчные результаты читаются с cursor pagination:

```http
GET /api/v1/product-economics/imports/{importId}/items?status=FAILED&cursor={cursor}&limit=100
Authorization: Bearer <service-token>
```

`limit` имеет диапазон `1..500`, default `100`. Элемент результата:

```json
{
  "rowId": "erp-row-000417",
  "nmId": "123456789",
  "status": "FAILED",
  "code": "VERSION_MISMATCH",
  "detail": "Expected current version 3, actual version 4",
  "actualCurrentVersion": 4,
  "createdVersion": null
}
```

Для успешной записанной строки `status=SUCCEEDED`, `createdVersion` содержит созданную версию, а `code` и `detail` равны `null`. Успешная строка dry-run имеет `status=VALIDATED` и `createdVersion=null`. Результаты batch import хранятся не меньше срока, заданного audit retention policy.

### 17.6. Конкуренция и влияние на Decision Engine

- Single update и строки batch import используют одну блокировку по `nmId` и не могут создать пересекающиеся версии.
- Snapshot фиксирует `productEconomicsVersion`; изменение во время расчёта приводит к отмене результата и повторному расчёту.
- Ещё не отправленное решение со старой версией product economics получает `SUPERSEDED`.
- После `SENT` сначала завершается reconciliation; новая экономика применяется только к следующему решению.
- Импорт не включает automation автоматически и не обходит `OBSERVE_ONLY`, cooldown, budget или write safety flags.

## 18. Конфигурация

Конфигурация валидируется при старте через типизированную схему. Неизвестные критичные значения и несовместимые флаги вызывают startup failure.

Кроме перечисленных ранее обязательны:

- `ACCOUNT_CURRENCY` — обязательный ISO 4217 код валюты единственного WB-аккаунта; читается из env при старте, валидируется и затем используется как неизменяемая runtime-константа;
- `ACCOUNT_TIMEZONE` — календарная зона единственного аккаунта;
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
- `WB_WRITE_ATTEMPT_RETENTION_DAYS` — положительный срок хранения детализированного журнала write-попыток, не меньше максимального окна retry и reconciliation;
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
- campaign ID, target ID, decision ID;
- scheduler run ID;
- endpoint key, attempt, latency, HTTP status;
- result/reason code.

Запрещено логировать:

- WB token;
- Authorization header;
- service token;
- connection string с паролем;
- полные секретные payload.

Все вызовы WB API, включая read-запросы, попадают в structured logs и агрегированные метрики. Отдельная строка PostgreSQL создаётся только для исходящего write-запроса в `WbWriteAttempt`. После `WB_WRITE_ATTEMPT_RETENTION_DAYS` завершённая детализированная запись удаляется плановой очисткой; `PREPARED`, `UNKNOWN` и `PENDING` reconciliation не удаляются, а превышение ими максимального окна создаёт alert. Бизнес-аудит сохраняет идентификаторы попыток и итог применения без полного payload.

### 19.2. Бизнес-аудит

Для решения сохраняются:

- исходная и целевая ставка;
- метрики и окно;
- `productEconomicsVersion` и `expectedContributionBeforeAdsMinor`;
- оценки ordered units, рекламных расходов и прибыли для всех рассмотренных candidate bids;
- policy и algorithm version;
- причины;
- все применённые ограничения;
- идентификаторы и итоги исходящих write-attempts;
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
- `bidder_product_economics_imports_total{status,dry_run}`;
- `bidder_product_economics_import_items_total{status,reason}`;
- `bidder_targets_without_product_economics`;
- `bidder_audit_write_failures_total`.

Нельзя помещать campaign/nm/query в Prometheus labels из-за высокой кардинальности. Для этого используются logs и audit query.

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
- незавершённый product economics import или рост доли targets без действующей экономики;
- неожиданный рост расходов.

## 21. Безопасность

- Секреты не хранятся в git, env examples, логах и audit payload.
- Product economics являются коммерчески чувствительными данными: значения не помещаются в обычные logs и Prometheus labels, а доступ к ним в Admin API и audit ограничивается отдельными permissions.
- Предпочтительно хранить WB token во внешнем secret manager; допустимо зашифрованное хранение в БД с ключом вне БД.
- Токен расшифровывается только перед запросом и не кешируется дольше необходимого.
- Один deployment и его БД обслуживают только аккаунт, которому принадлежит настроенный WB token; подключение другого аккаунта требует отдельного deployment и отдельной БД.
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
- Timezone boundary, leap day и DST покрываются тестами там, где влияют на сутки настроенного аккаунта.

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

`README.md` и `docs/mock-server.md` ДОЛЖНЫ содержать команды запуска и адреса Swagger UI/OpenAPI JSON для соответствующих compose-сценариев. Документация должна содержать Mermaid-диаграммы компонентов, последовательности sync/decision/execution, state machine очереди и ER-модель. Ссылки на WB API должны быть кликабельными и регулярно проверяться.

## 25. Стратегия тестирования

Принцип «необходимое и достаточное» означает, что тесты доказывают критические инварианты, а не просто достигают процента покрытия.

### 25.1. Unit tests

Обязательны для:

- всех формул и нулевых знаменателей;
- денежных округлений;
- profit scoring и выбора максимума среди candidate bids;
- положительного, нулевого и отрицательного `expectedContributionBeforeAdsMinor`;
- immutable-версий и периодов product economics;
- optimistic locking и идемпотентности single/batch economics endpoints;
- частично успешного batch import и dry-run;
- выборки окон и conversion lag;
- zero-conversion;
- floor/cap/hysteresis/cooldown/daily cap;
- разрешения policy precedence;
- канонизация `inputSnapshotChecksum` и `decisionInputChecksum`;
- одинаковые decision inputs дают один `BidDecision` и не более одного `DecisionQueueItem`;
- одинаковый `decisionInputChecksum` с отличающимся результатом даёт `DATA_INCONSISTENCY`;
- retry использует существующий UUIDv7 `decisionId`;
- state machine;
- error classification;
- retry/backoff/jitter с fake timers;
- state machine `WbWriteAttempt`, включая `UNKNOWN` и блокировку повторного write до reconciliation;
- batch builder;
- redaction;
- config validation.

Для Decision Engine используются table-driven и property-based tests:

- ставка никогда не ниже WB minimum;
- ставка никогда не выше policy maximum;
- при равных входах результат идентичен;
- выбранная ставка имеет максимальную ожидаемую прибыль среди допустимых и обеспеченных данными кандидатов;
- рост/снижение не превышает cap;
- невалидные или stale данные никогда не создают write;
- деньги не теряют копейки из-за float.

### 25.2. Integration tests

На реальном PostgreSQL:

- Prisma migrations;
- upsert статистики;
- формирование `BidPerformanceObservation` только для интервалов с одной подтверждённой ставкой;
- immutable product economics versions и запрет пересекающихся периодов;
- single update с optimistic locking;
- идемпотентный batch import, dry-run, partial success и сериализация конкурирующих строк одного `nmId`;
- транзакция decision + queue;
- unique `decisionInputChecksum` и unique `DecisionQueueItem.decisionId`;
- `SKIP LOCKED` с несколькими workers;
- lease expiry/recovery;
- supersede rules;
- durable-регистрация `WbWriteAttempt` до отправки, reconciliation для `UNKNOWN` и плановая retention-очистка;
- advisory scheduler lock;
- audit append-only;
- startup validation констант `ACCOUNT_CURRENCY` и `ACCOUNT_TIMEZONE`.

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

Для внутренних product economics endpoints отдельные contract tests покрывают JSON schemas, decimal-string сериализацию `BIGINT`, conditional headers, idempotency, request-level и item-level ошибки, pagination и все состояния import job.

Для bidder и mock-сервера contract tests отдельно проверяют доступность Swagger UI, валидность OpenAPI 3.x JSON, полноту списка реализованных paths и соответствие схем runtime DTO. Спецификация bidder проверяется на security requirements и отсутствие секретов в examples/defaults; спецификация mock-сервера — на наличие WB-compatible paths и всех endpoints `/__mock`.

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
17. sandbox/prod write safety flags;
18. отсутствие product economics блокирует только соответствующий `nmId`;
19. single economics update supersedes неотправленное старое решение;
20. batch import с успешными и ошибочными строками;
21. выбор максимальной ожидаемой прибыли по нескольким подтверждённым bid buckets.

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
- mutation testing СЛЕДУЕТ применять к формулам и guardrails; целевой mutation score не ниже 80%.

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
- Swagger/OpenAPI contract validation для bidder и mock-сервера;
- Prisma migration validation;
- dependency/security scan;
- Docker image build;
- Compose config validation;
- secret scan;
- Markdown links/lint;
- проверка отсутствия deprecated WB endpoints.

Production deployment СЛЕДУЕТ включать:

1. migration job;
2. запуск в `OBSERVE_ONLY`;
3. readiness;
4. canary-подмножество кампаний и targets;
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

Decision Engine выбирает допустимую ставку с максимальной детерминированно оценённой прибылью. Без действующего `expectedContributionBeforeAdsMinor` объект блокируется; переключение на другую цель не происходит. ACOS и ROAS используются только как диагностические метрики.

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

### AC-17. Product economics API

Единичный `PUT` создаёт immutable-версию с conditional update и идемпотентностью. Batch endpoint принимает до 10 000 позиций, возвращает `202`, обрабатывает строки асинхронно и предоставляет агрегированный статус и построчные результаты. Dry-run не изменяет product economics; частичная ошибка не откатывает успешные строки.

### AC-18. Один аккаунт и единая валюта

Deployment принимает один WB token и обрабатывает только кампании соответствующего seller account. Все денежные значения относятся к `ACCOUNT_CURRENCY`; internal API и таблицы не принимают и не хранят валюту на уровне отдельных записей. Отсутствующее или невалидное значение `ACCOUNT_CURRENCY` приводит к startup failure.

### AC-19. Swagger и OpenAPI

Bidder и mock-сервер возвращают Swagger UI по `GET /docs` и валидный OpenAPI 3.x JSON по `GET /docs-json`. Автоматический contract test запускает каждое приложение, проверяет HTTP `200`, валидирует OpenAPI schema и подтверждает наличие всех реализованных endpoints: `/api/v1` для bidder, совместимого подмножества WB API и `/__mock` для mock-сервера. Схемы, ошибки, security requirements и примеры соответствуют runtime DTO и не содержат секретов.

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
| 15 | Максимизация прибыли продавца | 2.1, 8, 9 | AC-04, AC-05 |
| 16 | Предоставление экономики множества позиций | 8, 17 | AC-17 |
| 17 | Один продавец и тысячи его кампаний | 2, 3, 8, 11, 18 | AC-16, AC-18 |
| 18 | Swagger UI и OpenAPI для bidder и mock-сервера | 15.5, 17, 24, 25 | AC-19 |

## 29. Этапы реализации

### Этап 0. Контракты и каркас

- monorepo/workspace;
- bidder и mock apps;
- strict TypeScript, lint/JSDoc;
- config;
- Prisma/PostgreSQL;
- Swagger UI и генерируемые OpenAPI-контракты для bidder и mock-сервера;
- CI и compose skeleton.

### Этап 1. WB adapter и mock

- runtime schemas;
- read endpoints;
- rate limiter;
- журнал `WbWriteAttempt`, structured request logs и redaction;
- mock scenarios и contract tests.

### Этап 2. Data Sync

- schema/migrations;
- scheduler locks;
- incremental sync;
- freshness/completeness;
- integration/load tests.

### Этап 3. Decision Engine

- product economics и batch import;
- policy versioning;
- metrics;
- детерминированная оценка прибыли candidate bids;
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
| Рекламные заказы не равны выкупам | Требовать, чтобы `expectedContributionBeforeAdsMinor` уже учитывал ожидаемый невыкуп и возврат; не называть orders продажами |
| Нет product economics | Блокировать изменение ставки конкретного `nmId`; не переключать цель оптимизации |
| Ручное изменение конфликтует с bidder | Pre-send compare, audit, cancel + recalculate |
| Две реплики превышают общий лимит | Distributed limiter, общий для deployment |
| HTTP success без фактического изменения | Read-after-write verification |
| Timeout после записи | Verify-before-retry |
| Слишком много метрик labels | IDs только в logs/audit |
| Production включён случайно | Fail-closed flags, secret/type checks, canary |

До production владелец продукта ДОЛЖЕН утвердить:

1. источник, семантику и допустимую погрешность `expectedContributionBeforeAdsMinor`;
2. attribution window и conversion lag;
3. допустимые default policy values;
4. лимиты дневного расхода;
5. retention статистики, аудита и детализированного журнала `WbWriteAttempt`;
6. identity provider Admin API;
7. целевой sync SLA для полного набора кампаний аккаунта;
8. допустимость автоматического повышения ставок;
9. процедуру аварийного глобального отключения writes.

## 31. Definition of Done разработки

Система считается готовой, только когда:

1. выполнены AC-01–AC-18;
2. нет известных нарушений денежных единиц и WB rate limits;
3. все критические тесты и CI gates зелёные;
4. sandbox soak завершён без необъяснённых расхождений;
5. runbook проверен на сценариях WB outage, DB outage, 429 storm и stuck queue;
6. документация на русском актуальна;
7. секреты отсутствуют в репозитории и логах;
8. production по умолчанию остаётся write-disabled;
9. rollback и global kill switch проверены;
10. решение о включении production writes зафиксировано владельцем продукта.
