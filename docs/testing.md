# Тестирование и quality gates

## Как читать статусы проверок

Тесты проверяют разные уровни одного пути: чистую математику, связь с PostgreSQL, HTTP-границу,
контракт mock и готовую Compose-топологию. Поэтому «зелёный unit test» не означает, что
production-запись подтверждена. Разницу между локальным доказательством, внешним gate и реальным
контрактом WB объясняет [путеводитель](project-guide.md), а сводная граница готовности находится
в [матрице приёмочных доказательств](acceptance-evidence.md).

`Quality gate` — команда с обязательным условием прохождения перед изменением или выпуском.
`E2E` — проверка сквозного сценария через реальные процессы и временную БД, но обычно с mock,
а не с production WB. Перед добавлением теста определите, какой риск он должен закрыть и какой
контур действительно способен это доказать.

Тесты разделены по доказуемым контрактам, а PostgreSQL suites используют реальную БД.
Назначение команд из `scripts/`, их prerequisites и побочные эффекты перечислены в
[справочнике служебных скриптов](scripts.md).

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

Для integration/e2e/load/runbook задаётся `DATABASE_URL` на отдельную PostgreSQL 18. Перед
повторным полным integration-прогоном source database должна быть новой: часть integration fixtures
намеренно сохраняет audit/version history, чтобы проверить append-only инварианты. Suites, которым
нужна отдельная схема, создают временную БД, применяют полный migration chain и удаляют её.
CI использует новый PostgreSQL service на каждый run; локально для того же свойства нужно создать
новую test database и применить `pnpm prisma migrate deploy` перед запуском набора.

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

Unit coverage измеряет расширенную критичную поверхность: config, contracts, decision engine,
чистую часть data sync, WB client/resilience, write executor/state machine и runtime-оркестрацию.
Порог применяется per-file, поэтому высокий результат одного модуля не скрывает соседний файл;
для config и decision engine действуют отдельные усиленные пороги. Репозитории БД, migrations и
полная композиция не подменяются unit coverage: их обязательное evidence дают integration/E2E
suites. Generated code и bootstrap entrypoints исключены. Snapshot-only проверки бизнес-логики
не используются.

## CI

PR workflow выполняет locked install, quality, property/mutation checks, PostgreSQL migrations и suites, build/smoke,
Compose validation, runtime smoke mock-only/full-mock, secret/dependency/container scans и
Markdown check. Production Compose readiness требует реальный Personal token и доступ к
официальному WB API, поэтому выполняется как release-environment smoke; CI статически проверяет
его topology/default gates и запускает тот же bidder image в полном mock-контуре. Sandbox не
запускается на PR: fixture и credential provision-ятся внешне и являются release gate.
Соответствие критериям отражено в [матрице evidence](acceptance-evidence.md).
