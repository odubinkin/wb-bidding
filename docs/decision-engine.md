# Decision Engine

Decision Engine `rules-v1` — чистый детерминированный доменный модуль. Он не обращается к WB,
не читает часы самостоятельно и не выполняет запись ставки. На вход передаётся один полный
нормализованный target snapshot, на выходе получается объяснённое решение и semantic checksum.

## Денежная арифметика

Ставки, расходы, contribution и итоговая прибыль представлены `bigint` в minor units.
Среднедневные значения, PAVA и interpolation используют точные рациональные числа. Float не
используется. Диагностические CTR, CR, CPC, CPM, ACOS и ROAS возвращают `null` при нулевом
знаменателе. Conservative profit округляется вниз, включая отрицательные значения.

```text
expectedProfit =
  expectedOrderedUnits × expectedContributionBeforeAdsMinor
  − expectedAdvertisingSpend
```

`expectedContributionBeforeAdsMinor` является signed величиной. Нулевой или отрицательный
contribution запускает защитное движение к floor и никогда не приводит к повышению.

## Evidence и estimator

Финализированные полные WB days группируются по точной подтверждённой ставке. CPM bucket требует
days, views либо явно включённый spend threshold и ordered units; CPC использует clicks вместо
views. `orders` не подменяет `shks`.

Для ordered units и spend независимо выполняется weighted PAVA с весом `eligibleDays`, затем
применяются safety discount/premium. Между соседними eligible buckets разрешена точная линейная
interpolation. Экстраполяция запрещена. Candidate с максимальным conservative profit выбирается
до округления; tie-break: текущая ставка, затем меньшая ставка.

Golden fixture: `tests/fixtures/decision-golden-v1.json`.

## Checksums и идемпотентность

`inputSnapshotChecksum` и `decisionInputChecksum` вычисляются как
`lowerHex(SHA-256(UTF8(scope + "\n" + RFC8785(payload))))`. `bigint` сериализуется десятичной
строкой, `Date` — RFC 3339 UTC. Технические UUID и correlation IDs не входят в semantic payload.
Повтор одинакового решения возвращает существующий UUIDv7; отличающийся результат для того же
checksum считается `DATA_INCONSISTENCY`.

## Guardrails

Единственный порядок bounds:

```text
floor/cap → quantum → cycle cap → account-day cap → quantum
→ absolute AND relative hysteresis → cooldown → execution mode
```

Unconditional blockers применяются в нормативном порядке. Budget evidence проверяется только для
итогового `INCREASE`: отсутствие verified same-day contract, свежего signal, coverage boundary
или policy bounds не мешает observe и снижению. `OBSERVE_ONLY` применяется последним и не создаёт
queue item.

Card write допускается только при подтверждённой capability. Cluster остаётся fail closed до
versioned verification unit/minimum/absence contract. Неоднозначная placement attribution,
неполный snapshot, отсутствующая economics или WB minimum также блокируют write.

## Immutable versions и experiments

Product economics и policies создаются версиями под PostgreSQL advisory lock. Conditional update
проверяет ожидаемую текущую версию; idempotency key нельзя повторно использовать с другим
payload. Batch до 10 000 уникальных `nmId` обрабатывается асинхронно и сохраняет построчный
partial result. PostgreSQL triggers запрещают изменение содержимого закрытых versions,
`MetricSnapshot` и `BidDecision`.

Exploration v1 создаёт только ставку ниже source bid. Порог расхода включает весь наблюдённый
target spend и резерв, после чего начинается revert. Revert повторно применяет актуальные
floor/cap/quantum; законно ограниченный возврат завершается `REVERT_CONSTRAINED`, а недоступная
capability или minimum выше cap — `FAILED_REVERT_BLOCKED`. Все переходы получают model time
параметром, поэтому mock-тесты не используют многодневные wall-clock sleeps.
