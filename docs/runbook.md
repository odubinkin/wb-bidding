# Операционный runbook

Все команды выполняются из checkout с утверждённой конфигурацией. Сначала закройте новые writes:
включите global kill через Admin API с `automation:kill`; при недоступном Admin API установите
`WB_API_WRITE_ENABLED=false` и перезапустите bidder. Не удаляйте queue/attempt rows.

## WB outage

Признаки: integration cache expired, breaker open, рост `5xx`/transport errors. Ожидаемое
поведение: Admin reads доступны, scheduler не теряет state, новые writes закрыты, post-dispatch
ошибки становятся `UNKNOWN`.

1. Включить global kill.
2. Проверить `/health/ready`, breaker и quota metrics.
3. Не выполнять ручной retry `UNKNOWN`.
4. После восстановления дождаться authorized integration check.
5. Запустить scoped resync, затем reconciliation; открывать automation только после чистого audit.

## DB outage

Readiness обязан стать failed после первой неуспешной query. Executor не может commit
`DISPATCHING`, поэтому сетевой write не выполняется. Восстановите PostgreSQL, проверьте migration
set/binding, затем запустите recovery. Не подменяйте БД пустой схемой для существующего account.

## 429 storm

`Retry-After`/`X-Ratelimit-Retry` замораживают общий и endpoint bucket. Уменьшите operator limits,
проверьте другое ПО продавца, оставьте writes закрытыми до стабилизации. Никогда не увеличивайте
embedded limit по единичному успешному ответу.

## Stuck queue и UNKNOWN

Для старых `PREPARED` recovery безопасно возвращает item без расходования attempt. Старый
`DISPATCHING` становится `UNKNOWN`. После propagation window нужны минимум два разнесённых
stable-old reads и полная pre-send revalidation; третье состояние или deadline завершаются
без нового write. Оператор анализирует `WbWriteAttemptItem`, `ReconciliationRead` и audit по
decision ID.

## Experiment revert

`REVERTING` использует обычную durable queue. Если deadline истёк или legal bid недоступен,
состояние `FAILED_REVERT_BLOCKED` отключает automation target. Включите global kill при массовом
событии, вручную сверяйте фактическую ставку и WB minimum, затем создайте новую policy/economics
version; не редактируйте experiment row.

## Rollback релиза

1. Включить global kill и выставить deployment writes `false`.
2. Сохранить audit/metrics и дождаться terminal/reconciled queue.
3. Откатить application image на предыдущий digest.
4. Миграции только forward-compatible; destructive schema rollback запрещён.
5. Проверить readiness, binding/profile checksum и запустить в `OBSERVE_ONLY`.
6. Повторное ограниченное включение требует нового product-owner решения.

## Graceful shutdown

Процесс прекращает claims, ждёт in-flight не более 30 секунд, освобождает недиспетчеризованные
leases/import/manual jobs и закрывает pool. `DISPATCHING` не возвращается слепо в queue.

## Проверка runbook

```bash
DATABASE_URL=postgresql://... pnpm run test:runbook
```

Suite воспроизводит DB failure/cached readiness, limiter/429/breaker, оба crash window,
stable-old reconciliation, stuck lease recovery, global kill и необратимый shutdown gate.
