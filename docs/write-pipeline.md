# Надёжный write pipeline и Admin API

## Safety model

Любая WB mutation проходит `DecisionQueueItem`. Executor берёт bounded page через
`FOR UPDATE SKIP LOCKED`, выдаёт lease и сериализует активную работу по target. После fresh WB
read и полной policy validation он резервирует limiter/in-flight slot и создаёт immutable
`WbWriteAttempt` с отдельным item для каждого batch element.

Сетевой вызов разрешён только после отдельной транзакции, которая фиксирует:

- attempt/items как `DISPATCHING`;
- queue как `SENT`;
- desired state, live-read checksum/source marker, attempt number и verification deadline.

`PREPARED` означает, что dispatch commit не выполнен и recovery безопасен без нового attempt.
Зависший `DISPATCHING` всегда становится `UNKNOWN`. Доказанный pre-byte transport failure можно
повторить не более `WB_WRITE_PRE_BYTE_MAX_RETRIES` в том же attempt; прочий timeout/reset/`5xx`
после dispatch не retry-ится вслепую.

## Reconciliation

Verification начинается после visibility delay:

- desired state → `APPLIED`;
- стабильное pre-write state → после минимум двух разнесённых reads, свежей prevalidation и
  оставшегося лимита возможен bounded retry;
- третье состояние → `FAILED / EXTERNAL_STATE_CONFLICT`;
- deadline → `FAILED / RECONCILIATION_INCONCLUSIVE`.

Retry сохраняет `decisionId` и увеличивает `attemptNumber`. `UNKNOWN`, pending reconciliation,
auth/capability denial, invalid payload и superseded result возвращают `RETRY_NOT_SAFE`.
Partial batch response сопоставляется по устойчивому `requestIndex`; соседний item не меняет
результат другого.

## Управление writes

`DeploymentControl`, `CampaignAutomation` и `TargetAutomation` повторно проверяются в prepare и
dispatch transactions; global kill имеет приоритет. `APPLY` не обходит config/token/profile,
runtime binding/integration/capacity и live minimum/policy/economics/snapshot gates. Cluster
write/delete закрыты при `UNVERIFIED` contract.

## Admin API

`/api/v1` использует service-token authentication и permissions:

- `product-economics:read|write|import`;
- `policies:read|write|activate`;
- `automation:read|write|kill`;
- `jobs:read|trigger`;
- `decisions:read`;
- `queue:read|retry`;
- `audit:read`.

Mutations требуют `Idempotency-Key`; current-state changes — также `If-Match`, первичная
economics version допускает `If-None-Match: *`. Lists имеют stable cursor и `limit=1..500`.
`BIGINT` сериализуется decimal string, ошибки — `application/problem+json` с correlation ID.
Swagger защищён тем же token.

Admin endpoint не вызывает WB синхронно. Manual jobs сохраняют bounded scope, recalculation читает
только БД, write остаётся за queue/lease/limiter/capability/kill/reconciliation gates.
