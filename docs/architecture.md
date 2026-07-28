# Архитектура WB Bidder

WB Bidder — self-hosted deployment для одного продавца. PostgreSQL является источником истины,
WB API — внешним наблюдаемым и изменяемым контуром, а Decision Engine остаётся чистой
детерминированной библиотекой. Mock входит только в тестовую топологию.

## Компоненты

```mermaid
flowchart LR
  O[Оператор] -->|Admin API| B[Bidder NestJS]
  B --> A[Аутентификация и аудит]
  B --> S[Scheduler]
  S --> DS[Data Sync]
  S --> DE[Decision Engine]
  S --> EX[Executor и reconciliation]
  DS --> PG[(PostgreSQL)]
  DE --> PG
  EX --> PG
  DS --> RL[Общий rate limiter]
  EX --> RL
  RL --> WB[WB Promotion API]
  WB --> RL
  P[Prometheus] -->|/metrics| B
```

Bidder запускает независимые jobs: быстрый current-state sync, медленный data sync, расчёт,
применение, verification/reconciliation, experiment lifecycle, imports, manual jobs и retention.
Каждый job имеет PostgreSQL advisory lock; несколько реплик не выполняют один run одновременно.

## Последовательность синхронизации

```mermaid
sequenceDiagram
  participant C as Cron
  participant R as DataSyncRepository
  participant W as WB API
  participant D as PostgreSQL
  C->>R: взять advisory lock и создать SchedulerRun
  R->>D: прочитать cursor и bounded page
  R->>W: запрос через общий limiter
  W-->>R: runtime-validated response и quota headers
  R->>D: source snapshot, observations, target snapshot
  R->>D: финализировать полный statistical day при достаточном evidence
  R->>D: сохранить cursor и terminal status
```

`CURRENT_STATE_SYNC` не зависит от медленной статистики. Cursor сохраняется только после
обработки страницы; deadline и freshness failures закрывают `APPLY`, но Admin API остаётся
доступным.

## Решение и применение

```mermaid
sequenceDiagram
  participant J as Decision job
  participant D as PostgreSQL
  participant E as Decision Engine
  participant X as Executor
  participant W as WB API
  J->>D: coherent target snapshot
  J->>E: immutable input и policy
  E-->>J: action, bid, explanation, checksums
  J->>D: атомарно BidDecision и DecisionQueueItem
  X->>D: lease через SKIP LOCKED
  X->>W: свежий live read через limiter
  X->>D: PREPARED, затем commit DISPATCHING/SENT
  X->>W: write после commit
  X->>D: ACCEPTED или UNKNOWN
  X->>W: read-after-write после propagation window
  X->>D: APPLIED только при совпадении
```

Ни один сетевой write не выполняется до durable commit `DISPATCHING`. Timeout/`5xx` после этой
границы становится `UNKNOWN`; новый write возможен только после двух разнесённых стабильных
чтений старого состояния и полной повторной валидации.

## Машина состояний очереди

```mermaid
stateDiagram-v2
  [*] --> QUEUED
  QUEUED --> LEASED: claim
  RETRY_WAIT --> LEASED: availableAt
  LEASED --> SENT: commit DISPATCHING
  LEASED --> QUEUED: lease release
  SENT --> VERIFY_WAIT: accepted или UNKNOWN
  VERIFY_WAIT --> APPLIED: desired state прочитан
  VERIFY_WAIT --> RETRY_WAIT: доказано stable old state
  VERIFY_WAIT --> FAILED: conflict или deadline
  QUEUED --> SUPERSEDED: новое решение
  LEASED --> CANCELLED: pre-dispatch gate
  APPLIED --> [*]
  FAILED --> [*]
  SUPERSEDED --> [*]
  CANCELLED --> [*]
```

## Границы безопасности

- Один deployment привязан к одному `sellerSid`, currency, timezone, environment и token type.
- Production URL фиксирован официальным HTTPS origin; redirect и userinfo запрещены.
- Все деньги хранятся как `BIGINT` minor units, ratios — как точные rational/ppm.
- Write требует одновременно configuration, token, binding, capacity, integration, policy,
  capability, automation и kill-switch gates.
- Неподтверждённый wire-контракт никогда не включает write capability.

Связанные документы: [модель данных](data-model.md), [синхронизация](data-synchronization.md),
[алгоритм](bidding-algorithm.md), [write pipeline](write-pipeline.md) и [runbook](runbook.md).
