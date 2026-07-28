# Тестирование и quality gates

Тесты разделены по доказуемым контрактам, а PostgreSQL suites используют реальную БД.

## Команды

```bash
pnpm install --frozen-lockfile
pnpm run quality
pnpm run test:integration
pnpm run test:e2e
pnpm run test:load
pnpm run test:runbook
pnpm run docs:check
pnpm run security:secrets
pnpm run security:container
pnpm run build
pnpm run smoke:built
pnpm run smoke:compose
```

Для integration/e2e/load/runbook задаётся `DATABASE_URL` на отдельную PostgreSQL 18. Suites,
которым нужна чистая схема, создают временную БД, применяют полный migration chain и удаляют её.

## Контуры

| Контур                   | Доказательство                                                                  |
| ------------------------ | ------------------------------------------------------------------------------- |
| Unit                     | формулы, деньги, policy, limiter, schemas, state machines, redaction, config    |
| Golden/property/mutation | детерминизм, bounds, argmax и устойчивость guardrails                           |
| Integration              | migrations, evidence, decision/queue, leases, crash windows, audit, kill switch |
| Contract/OpenAPI         | WB fixtures, Admin API, Swagger bidder/mock, deprecated endpoint gate           |
| E2E                      | реальный HTTP mock → durable dispatch → delayed read-after-write → APPLIED      |
| Load                     | 10 000 campaigns/100 000 targets в PostgreSQL и bounded paging/memory           |
| Runbook                  | DB outage, 429/breaker, stuck/UNKNOWN, recovery, kill switch, shutdown          |
| Sandbox                  | внешний Test-token/manifest; безопасный smoke и обратимый canary                |

Coverage для критического доменного набора: не менее 95% lines/statements/functions и 90%
branches. Generated code, bootstrap wiring и декларативные migrations исключены, поскольку их
поведение проверяется build/integration/smoke. Snapshot-only проверки бизнес-логики не
используются.

## CI

PR workflow выполняет locked install, quality, PostgreSQL migrations и suites, build/smoke,
Compose validation, runtime smoke mock-only/full-mock, secret/dependency/container scans и
Markdown check. Production Compose readiness требует реальный Personal token и доступ к
официальному WB API, поэтому выполняется как release-environment smoke; CI статически проверяет
его topology/default gates и запускает тот же bidder image в полном mock-контуре. Sandbox не
запускается на PR: fixture и credential provision-ятся внешне и являются release gate.
Соответствие критериям отражено в [матрице evidence](acceptance-evidence.md).
