# Алгоритм управления ставками

Этот документ описывает фактическую реализацию `rules-v1` из пакета
[`@wb-bidder/decision-engine`](../packages/decision-engine/src/engine.ts). Это чистая функция:
она не читает БД, не вызывает WB API и не использует системные часы. Оркестратор передаёт ей
неизменяемый нормализованный `DecisionInput`, а результат (`DecisionResult`) объясняет каждое
принятое или заблокированное решение. Подготовка входа выполняется синхронизацией и runtime,
а фактическая запись идёт только через [очередь](write-pipeline.md).

## Цель, единицы и границы применения

Алгоритм выбирает ставку, максимизирующую консервативную ожидаемую прибыль за горизонт
`predictionHorizonDays`:

```text
profit = expectedOrderedUnits × expectedContributionBeforeAdsMinor
         − expectedAdvertisingSpendMinor
```

Все денежные величины — знаковые `bigint` в minor units валюты аккаунта. `orderedUnits`,
клики и показы — целые счётчики. Промежуточные средние, PAVA и интерполяция вычисляются
классом `Rational`; float не используется. Финальный `conservativeProfitScoreMinor` получается
округлением вниз, поэтому отрицательные значения также округляются консервативно.

Алгоритм применим к card targets и к CPM cluster targets только при подтверждённой capability.
`orders` не заменяет `orderedUnits`: для оценки используется нормализованный WB `shks`.
ACOS, ROAS, CTR, CR, CPC и CPM вычисляются лишь как диагностика и не участвуют в выборе ставки.
При нулевом знаменателе соответствующая диагностическая метрика равна `null`.

## Входной контракт

`DecisionInput` является полным снимком одного target. В нём нет скрытых запросов или defaults.

| Группа         | Поля                                                                                                                    | Назначение                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Идентичность   | `targetKey`, `accountLocalDate`, `algorithmVersion`, `decisionAt`                                                       | Привязывают результат к WB campaign/nm/placement, версии правил и модельному времени.                   |
| Текущая ставка | `currentBidMinor`, `dailyAnchorBidMinor`, `endpointQuantumMinor`, `wbMinimumBidMinor`                                   | Подтверждённая ставка, якорь на начало суток, шаг endpoint и живой минимум WB.                          |
| Режим          | `campaignRunning`, `manualPause`, `capability`, `paymentType`, `attributionUnambiguous`, `currentTrafficRegimeChecksum` | Определяют, допустимы ли решение и изменение ставки, и какие дни сопоставимы с текущим режимом трафика. |
| Экономика      | `expectedContributionBeforeAdsMinor`, `productEconomicsVersion`                                                         | Маржинальный вклад одной заказанной единицы до рекламы и версия его источника.                          |
| Данные         | `performanceDays`, `snapshotApplyEligible`                                                                              | Финализированные дневные наблюдения и итог проверки полноты/freshness/coherence.                        |
| Рекомендации   | `recommendationBidHintsMinor`, `recommendationSnapshotChecksum`, `recommendationSnapshotFetchedAt`                      | Дополнительные CPM-кандидаты; они не доказывают прибыль сами по себе.                                   |
| Бюджет         | `budget`                                                                                                                | Same-day расход, статус контракта, свежесть и окна, нужные только для повышения.                        |
| Политика       | `policy`                                                                                                                | Полностью разрешённая версия всех лимитов, порогов, горизонтов и execution mode.                        |

Каждый `DecisionPerformanceDay` содержит точную ставку, дату, `configurationChecksum`,
clicks/views, spend, `orderedUnits` и checksum входа. День с `orderedUnits=null` исключается
из кривой, но его наличие может сделать итог `MISSING_ORDERED_UNITS`.

## Предварительная валидация и безусловные блокировки

До расчётов проверяются неотрицательность текущей/дневной ставки, положительность quantum,
корректность даты и времени, а также диапазоны policy. Некорректный контракт — ошибка
программы, а не бизнес-решение.

Безусловные блокировки прекращают обработку до построения кандидатов. В `outcomeReasonCode`
используется первая причина в следующем нормативном порядке:

1. `MANUAL_PAUSE` — операторская пауза;
2. `CAMPAIGN_NOT_RUNNING` — кампания не активна;
3. `UNSUPPORTED_CAMPAIGN` — capability `UNSUPPORTED` либо cluster не CPM;
4. `UNVERIFIED_CLUSTER_BID_CONTRACT` — cluster без `CLUSTER_WRITE_READY`;
5. `INSUFFICIENT_ATTRIBUTION_GRANULARITY` — нельзя однозначно отнести статистику;
6. `MISSING_PRODUCT_ECONOMICS` — отсутствует экономика или её версия;
7. `STALE_DATA` — snapshot не пригоден для применения либо не подтверждён WB minimum;
8. `MIN_ABOVE_POLICY_MAX` — минимум WB выше policy cap.

Ответ имеет `action=BLOCKED`, пустые buckets/candidates, `queueEligible=false` и полный список
всех обнаруженных `unconditionalBlockers`. Приоритет причины делает повторные расчёты
детерминированными.

## Снимки и идемпотентность

Перед выбором создаются два SHA-256 checksum через canonical serialization:

```text
inputSnapshotChecksum = SHA-256("input-snapshot-v1\n" + canonical(payload))
decisionInputChecksum = SHA-256("bid-decision-v1\n" + canonical(context))
```

Первый payload включает ставку, режим, экономику, minimum, рекомендации, бюджетные данные и
отсортированные `performanceDays`; UUID и correlation ID в него не входят. Второй checksum
добавляет дату аккаунта, policy, дневной anchor, фазу бюджета и deadline cooldown. Одинаковый
семантический ввод создаёт тот же `decisionInputChecksum`; в БД он уникален для защиты от
повторной постановки одинакового решения.

## Построение доказательной кривой

Дни сначала группируются по точной `bidMinor`; группы сортируются по возрастанию ставки. Для
каждой группы вычисляются totals и средние за день:

```text
unitsRawPerDay = Σ orderedUnits / eligibleDays
spendRawPerDay = Σ spendMinor / eligibleDays
```

Группа пригодна только при выполнении всех условий:

| Проверка          | CPM                                                   | CPC                                       | Код исключения                                        |
| ----------------- | ----------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| Число полных дней | `days ≥ minBidObservationDays`                        | то же                                     | `INSUFFICIENT_OBSERVATION_DAYS`                       |
| Трафик            | `views ≥ minBidViews` либо `spend ≥ minBidSpendMinor` | `clicks ≥ minBidClicks` либо тот же spend | `INSUFFICIENT_TRAFFIC`                                |
| Конверсии         | `orderedUnits ≥ minBidOrderedUnits`                   | то же                                     | `ZERO_ORDERED_UNITS` или `INSUFFICIENT_ORDERED_UNITS` |

`minBidSpendMinor=null` выключает альтернативную проверку расхода. Непригодные группы остаются
в объяснении со своими raw значениями, но не участвуют в PAVA, интерполяции и выборе кандидата.

### PAVA и консервативная поправка

Для пригодных buckets независимо выполняется взвешенная изотоническая регрессия PAVA над
`unitsRawPerDay` и `spendRawPerDay`; вес — число дней в bucket. Соседние блоки объединяются,
пока их средние нарушают неубывание с ростом ставки. Следовательно, кривая units и кривая spend
не уменьшаются при увеличении bid, но исходные данные не переписываются.

К PAVA-значениям применяются policy-поправки в ppm:

```text
unitsSafe = unitsPava × (1 − orderedUnitsSafetyDiscountPpm / 1_000_000)
spendSafe = spendPava × (1 + spendSafetyPremiumPpm / 1_000_000)
```

Именно `unitsSafe` и `spendSafe` прогнозируются. Объяснение содержит raw, PAVA, safe,
количество дней, totals и все причины исключения для каждого bucket.

## Кандидаты, прогноз и выбор максимума

Набор кандидатов дедуплицируется, фильтруется по `[floor, cap]` и сортируется. В него входят:

- текущая ставка;
- все пригодные bucket bids;
- один шаг вниз и вверх от текущей ставки, где
  `step = max(endpointQuantumMinor, round(currentBid × candidateBidStepPpm))`;
- floor и, если задан, cap;
- положительные WB recommendation hints только для CPM.

`floor = max(policyMinBidMinor или 0, wbMinimumBidMinor)`. Для каждого кандидата разрешено
только точное bucket-значение либо линейная интерполяция между соседними пригодными buckets:

```text
value(b) = value(left) + (value(right) − value(left))
           × (b − leftBid) / (rightBid − leftBid)
```

Кандидат вне закрытого диапазона кривой отбрасывается: экстраполяция запрещена. Затем safe
средние умножаются на `predictionHorizonDays`, и вычисляется прибыль. Нужны как минимум два
кандидата и оценка текущей ставки; иначе результат `BLOCKED` с
`INSUFFICIENT_BID_RESPONSE_DATA`, `INSUFFICIENT_DATA` либо `MISSING_ORDERED_UNITS`.

Победитель — максимальный exact score. При равенстве сначала выбирается текущая ставка, затем
меньшая ставка, затем ближайшая к текущей. Если улучшение победителя меньше
`minExpectedProfitImprovementMinor`, результат — `NO_CHANGE/NO_PROFIT_IMPROVEMENT`, даже когда
другая ставка формально имеет больший score.

## Особые стратегии до оптимизации

При `expectedContributionBeforeAdsMinor ≤ 0` данные кривой не нужны: рекомендуемая ставка равна
floor, а причина — `NEGATIVE_CONTRIBUTION_BEFORE_ADS`. Это никогда не приводит к повышению.

Для нулевой конверсии в текущем traffic regime нужны минимум `minBidObservationDays`, нулевые
`orderedUnits` и достаточный CPM traffic (`views`) либо CPC traffic (`clicks`), или заданный
порог расхода. Тогда выбирается `currentBid × (1 − zeroConversionDecreasePpm/1_000_000)` с
причиной `ZERO_CONVERSION_DECREASE`.

## Bounds, скорость и исполнение

Сырая рекомендация проходит строго в таком порядке:

```text
floor/cap → quantum → ограничение цикла и суток → quantum → hysteresis → cooldown → execution mode
```

1. `cap` равен policy cap; если его нет, верхняя граница не даёт увеличить ставку выше max(raw,
   current). Ставка clamp-ится и округляется до endpoint quantum.
2. Скорость ограничивается пересечением interval-ов:

   ```text
   cycle: current × (1 ± max*PerCyclePpm)
   daily: dailyAnchor × (1 ± maxDaily*Ppm)
   ```

   Выход за нижнюю/верхнюю границу записывает соответственно `DECREASE_SPEED_CAP` или
   `INCREASE_SPEED_CAP`.

3. Абсолютное изменение должно быть не меньше `minAbsoluteChangeMinor`, а относительное — не
   меньше `minRelativeChangePpm`. При нулевой текущей ставке относительное изменение считается
   1 000 000 ppm. Иначе `BELOW_MIN_CHANGE` блокирует write.
4. До истечения `lastWriteAt + cooldownMinutes` любое изменение блокирует `COOLDOWN`.

`NO_CHANGE` у floor/cap получает `AT_FLOOR`/`AT_CAP`; при `OBSERVE_ONLY` вычисленные
`INCREASE`/`DECREASE` остаются видимыми, но `queueEligible=false` и причина — `OBSERVE_ONLY`.

### Дополнительный барьер повышения

Только `INCREASE` требует подтверждённого same-day spend. Нужны `contractStatus=VERIFIED`,
заполненные расход/временные метки, `dailySpendLimitMinor`, `maxSpendPerMinuteMinor` и
`maxSpendReportingLagMinutes`, а также свежесть сигнала не старше `signalFreshnessMinutes`.

Неучтённый расход резервируется консервативно:

```text
unobservedMinutes = ceil(max(0, decisionAt − coverageEndedAt))
                    + targetSyncSlaMinutes + ceil(writeVisibilitySlaSeconds / 60)
reserved = maxSpendPerMinuteMinor × unobservedMinutes
```

Повышение разрешено лишь при строгом `observedSameDaySpendMinor + reserved < dailySpendLimitMinor`.
Иначе результат `BLOCKED/BUDGET_SIGNAL_UNAVAILABLE`. Снижение и observe-only не требуют этого
доказательства.

## Результат и переход к очереди

`DecisionResult` хранит raw recommendation (`proposedBidMinor`), ставку после bounds
(`boundedBidMinor`), `strategyReasonCode`, `outcomeReasonCode`, все guardrail codes,
input checksums, buckets, candidates и reserved spend. `queueEligible=true` только для
неблокированного `INCREASE` или `DECREASE` в `APPLY`; отдельный runtime вновь валидирует
доказательства непосредственно перед `DISPATCHING`.

| `action`                | Значение                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `INCREASE` / `DECREASE` | Допустимое направление; при `queueEligible=true` создаётся durable queue item.           |
| `NO_CHANGE`             | Текущая ставка оптимальна, недостаточно улучшение, либо достигнута граница.              |
| `BLOCKED`               | Безусловное условие, недостаток данных, budget, hysteresis или cooldown запретили write. |

## Lower-only experiments

Эксперимент создаётся отдельно функцией `planLowerExperiment` только при включённой policy и
наличии отдельного `maxExplorationSpendMinor`. Он уменьшает source bid на max(quantum,
процентный `explorationStepPpm`), округляет, применяет floor и отказывается от создания, если
получилась не меньшая ставка. Сохраняются source/experiment/desired revert bids, число полных
дней, spend limit и safety buffer.

Reducer `advanceExperiment` использует модельное время и переводит состояния:

```text
PLANNED → ACTIVE → COLLECTING → EVALUATING
                    └────────────→ REVERTING → REVERTED | REVERT_CONSTRAINED
                                           └→ FAILED_REVERT_BLOCKED
```

Revert начинается при изменении конфигурации либо когда observed+reserved spend достиг
`spendLimit − safetyBuffer`. Оценка начинается только после нужного числа полных дней и
`evaluationNotBefore`. При возврате повторно проверяются capability, WB minimum, policy cap и
quantum; недоступный безопасный возврат даёт `FAILED_REVERT_BLOCKED`, а законное ограничение
первоначальной ставки — `REVERT_CONSTRAINED`. Все start/revert решения проходят обычную очередь
и reconciliation.

## Настройка, тесты и исходники

`validateDecisionPolicy` требует положительные integer thresholds, допустимые ppm, неотрицательные
денежные пороги, корректный min/max и полный набор budget/cap параметров для `APPLY`.
`initialObserveOnlyPolicy()` создаёт безопасный v1 default: 28 дней baseline, 7 дней primary,
сутки cooldown, 10% шаг кандидата, 20% discount units, 10% premium spend и `OBSERVE_ONLY`.

Основные исходники: `engine.ts`, `estimator.ts`, `policy.ts`, `experiments.ts`, `rational.ts` и
`types.ts` в `packages/decision-engine/src`. Поведение закрепляют
`tests/unit/decision-engine*.spec.ts`, `tests/golden/decision-engine.golden.spec.ts`,
`tests/property/decision-engine.property.spec.ts` и `tests/mutation/decision-engine.mutation.spec.ts`.
