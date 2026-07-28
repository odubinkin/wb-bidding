# Алгоритм управления ставками

Нормативная реализация находится в пакете `decision-engine`; подробные формулы и evidence
описаны в [документе Decision Engine](decision-engine.md). Модуль не выполняет I/O и получает
модельное время во входе.

## Целевая функция

Для каждого допустимого candidate bid вычисляется консервативная ожидаемая прибыль:

```text
expectedProfitMinor =
  expectedOrderedUnits × expectedContributionBeforeAdsMinor
  − expectedAdvertisingSpendMinor
```

Contribution может быть отрицательным. При отсутствии действующей immutable-версии экономики
target блокируется. ACOS/ROAS являются только диагностикой и не заменяют целевую функцию.

## Evidence и estimator

Используются только `FINALIZED` дни после enrollment/warm-up с одной подтверждённой ставкой,
неизменной конфигурацией и непрерывным bid-state coverage. `shks` является ordered units;
`orders` не подменяет его. CPM и CPC имеют разные пороги evidence.

1. Дни группируются по точной ставке.
2. Для ordered units и spend применяется weighted PAVA.
3. К прогнозу применяется safety discount/premium.
4. Допускается линейная interpolation только между соседними подтверждёнными buckets.
5. Extrapolation запрещена.
6. Побеждает максимум conservative profit; tie-break — current bid, затем меньшая ставка.

## Guardrails

Порядок обязателен:

```text
WB floor / policy cap → quantum → cycle cap → account-day cap → quantum
→ absolute и relative hysteresis → cooldown → execution mode
```

Повышение дополнительно требует verified same-day spend contract, свежего сигнала, coverage,
reporting-lag reserve и headroom. При `sameDaySpendContractStatus=UNVERIFIED` observe и снижение
разрешены, повышение — нет.

## Exploration

Версия v1 допускает только lower-only experiment и не более одного активного experiment на
target. Start и revert проходят обычную durable queue. После нужного числа полных дней и
conversion cutoff результат принимается либо выполняется возврат к source bid. Изменившиеся
floor/cap дают `REVERT_CONSTRAINED`; невозможный безопасный возврат даёт
`FAILED_REVERT_BLOCKED` и target-level stop.

Детерминизм подтверждают golden/property/mutation tests; команды приведены в
[документации тестирования](testing.md).
