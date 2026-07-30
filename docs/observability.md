# Наблюдаемость

## Что оператор должен видеть

Наблюдаемость отвечает не на вопрос «процесс запущен ли», а на вопрос «безопасно ли системе
принимать и применять решения». `liveness` показывает, что HTTP-процесс жив; `readiness` — что
он способен выполнять заявленную работу с доступными зависимостями; метрики и аудит помогают
понять, где в цепочке snapshot → decision → queue → reconciliation возникла задержка или запрет.
Эта цепочка введена в [путеводителе](project-guide.md).

Отсутствие метрики не доказывает успех ставки. Подтверждение применения хранится в модели
очереди и попыток записи; метрики дают агрегированную картину, а последовательность действий
при тревоге определяет [runbook](runbook.md). Не публикуйте в метриках токены, тела запросов или
идентификаторы, раскрывающие секреты.

Bidder выдаёт Prometheus-метрики с bounded labels и структурированные JSON-логи. Campaign,
target, decision и seller IDs разрешены в audit/log context, но запрещены как metric labels.

## Конечные точки

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
