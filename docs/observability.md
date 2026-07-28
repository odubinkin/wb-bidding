# Наблюдаемость

Bidder выдаёт Prometheus-метрики с bounded labels и структурированные JSON-логи. Campaign,
target, decision и seller IDs разрешены в audit/log context, но запрещены как metric labels.

## Endpoints

| Endpoint            | Назначение                                                 |
| ------------------- | ---------------------------------------------------------- |
| `GET /health/live`  | процесс принимает HTTP; не обращается к WB и БД            |
| `GET /health/ready` | БД, migrations, binding, config и cached integration state |
| `GET /metrics`      | Prometheus exposition и bounded DB aggregates              |

Readiness никогда не вызывает WB. Отдельный quota-aware integration job обновляет cache; его
успех действителен 120 секунд. Ошибка БД немедленно возвращает failed readiness и закрывает
write gate.

## Метрики

Публикуются scheduler runs/duration, sync results/lag/SLA/ETA, snapshot age, decisions,
queue size/oldest age, executor attempts, verification/reconciliation, WB latency/status/429,
rate-limit wait, circuit state, invalid data, economics imports, experiments, global kill,
targets без economics, pool utilization и stuck attempts.

## Алерты

Оператор обязан настроить:

- readiness failed и migration/binding mismatch;
- integration cache expired, auth breaker или sustained WB `5xx`;
- `429` storm и долгий limiter wait;
- current-state/minimum/statistics SLA violation;
- oldest queue/UNKNOWN/PREPARED/DISPATCHING выше runbook threshold;
- verify mismatch/reconciliation inconclusive;
- `FAILED_REVERT_BLOCKED`;
- global kill enabled;
- pool utilization и scheduler deadline exceeded.

Диагностика и действия приведены в [runbook](runbook.md).
