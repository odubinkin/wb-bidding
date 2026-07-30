# Матрица приёмочного evidence

Этот документ не подменяет результаты команд. `LOCAL VERIFIED` означает сохранённый
детерминированный локальный результат; `EXTERNAL GATE` нельзя закрыть без предоставленного
внешнего артефакта или решения. Итоговый release разрешён только когда все строки имеют
сохранённый зелёный результат либо явно утверждённое изменение DoD.

## AC-01–AC-30

| Критерий | Статус                    | Прямое evidence                                                                                 |
| -------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| AC-01    | LOCAL VERIFIED + EXTERNAL | `smoke:compose` для mock-контуров прошёл; production WB environment требует отдельного evidence |
| AC-02    | AUTOMATED                 | `tests/unit/config.spec.ts`, token/profile/host/write gates                                     |
| AC-03    | AUTOMATED                 | data-sync unit/integration, scheduler lock/cursor/freshness/capacity                            |
| AC-04    | AUTOMATED                 | golden/property tests, DB-only `DecisionJobService`                                             |
| AC-05    | AUTOMATED                 | decision-engine unit/golden/mutation tests                                                      |
| AC-06    | AUTOMATED                 | policy/guardrail/property/pre-dispatch tests                                                    |
| AC-07    | AUTOMATED                 | decision и write-pipeline PostgreSQL integration                                                |
| AC-08    | AUTOMATED                 | crash windows, `UNKNOWN`, stable-old reconciliation integration                                 |
| AC-09    | AUTOMATED                 | write integration и HTTP mock E2E read-after-write                                              |
| AC-10    | AUTOMATED                 | limiter unit/integration, `429` headers и shared PostgreSQL bucket                              |
| AC-11    | AUTOMATED                 | append-only triggers, decision/attempt/audit integration                                        |
| AC-12    | AUTOMATED                 | observability service, runbook readiness tests, real built smoke                                |
| AC-13    | AUTOMATED                 | mock contract/OpenAPI/virtual-time/fault suites                                                 |
| AC-14    | LOCAL VERIFIED            | 51/51 сценариев автоматизированы; mock-only/full-mock Compose smoke прошёл                      |
| AC-15    | AUTOMATED                 | ESLint JSDoc и `docs:check`                                                                     |
| AC-16    | AUTOMATED                 | `tests/load/account-scale-postgres.load.spec.ts`                                                |
| AC-17    | AUTOMATED                 | Admin contract и economics PostgreSQL integration                                               |
| AC-18    | AUTOMATED                 | binding transition/startup integration и configuration                                          |
| AC-19    | AUTOMATED                 | `tests/openapi/openapi.spec.ts`, protected docs contract                                        |
| AC-20    | AUTOMATED                 | golden estimator, PAVA/interpolation/late-attribution tests                                     |
| AC-21    | AUTOMATED                 | capability matrix и unverified cluster fail-closed tests                                        |
| AC-22    | AUTOMATED                 | experiment state machine/planning/runtime queue lifecycle tests                                 |
| AC-23    | AUTOMATED                 | JWT matrix и singleton binding transitions                                                      |
| AC-24    | AUTOMATED                 | verified mock unit/min/absence/POST/DELETE/reconciliation; prod fail-closed                     |
| AC-25    | AUTOMATED                 | per-item attempt/partial/timeout/reconciliation integration                                     |
| AC-26    | AUTOMATED                 | finalization, coverage, `shks`, `canceled`, late attribution                                    |
| AC-27    | AUTOMATED                 | WB fixtures/profile checksum/fullstats leaf aggregation                                         |
| AC-28    | AUTOMATED                 | Admin API contract: permissions/ETag/idempotency/jobs/retry                                     |
| AC-29    | AUTOMATED                 | error classifier, circuit/429, readiness и quota tests                                          |
| AC-30    | EXTERNAL GATE             | harness `smoke:sandbox`; нужен manifest/Test token и release-owner evidence                     |

## Definition of Done, раздел 31

| Пункт     | Статус                    | Evidence / условие закрытия                                                               |
| --------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| DoD-31.1  | PARTIAL / EXTERNAL        | 51 внутренних сценариев локально зелёные; AC-30 требует внешний sandbox evidence          |
| DoD-31.2  | AUTOMATED                 | money/golden/property и versioned rate profile/limiter tests                              |
| DoD-31.3  | LOCAL VERIFIED + EXTERNAL | локальный CI-equivalent, audit и Trivy зелёные; hosted CI run отсутствует                 |
| DoD-31.4  | FORCED EXTERNAL GAP       | sandbox credentials отсутствуют по подтверждению пользователя; smoke нельзя заменить mock |
| DoD-31.5  | LOCAL VERIFIED            | `pnpm run test:runbook`                                                                   |
| DoD-31.6  | LOCAL VERIFIED            | `pnpm run docs:check`                                                                     |
| DoD-31.7  | AUTOMATED + OPERATOR      | secret scan; runtime secret manager и log inspection                                      |
| DoD-31.8  | AUTOMATED                 | compose default false и config multi-gate tests                                           |
| DoD-31.9  | AUTOMATED                 | global kill integration и rollback drill в runbook suite                                  |
| DoD-31.10 | EXTERNAL GATE             | требуется product-owner решение; до него writes остаются выключены                        |
| DoD-31.11 | AUTOMATED                 | endpoint profile + adapter/pre-dispatch fail-closed tests                                 |

## Release evidence

В release bundle сохраняются:

- `packages/contracts/src/profiles/build-profile.json`;
- [технический WB evidence report](wb-api-evidence/wb-promotion-2026-07-28-v1.md);
- checksum pinned endpoint profile и contract fixture;
- вывод quality/integration/e2e/load/runbook/docs/security/container commands;
- hosted CI run URL и immutable image digest после появления CI;
- redacted sandbox evidence после provision sandbox fixture;
- product-owner и API release-owner решения;
- актуальный [реестр расхождений](implementation-deviations.md).

Построчное покрытие раздела 25.4 хранится в
[матрице E2E-сценариев](e2e-scenario-evidence.md).

## Локальный verification snapshot 2026-07-30

На новой PostgreSQL 18 database с применёнными семью migrations подтверждено:

- `pnpm run quality`: 99 unit, 1 golden, 2 OpenAPI и 11 contract tests; coverage
  98.04% statements, 90.40% branches, 99.09% functions, 98.00% lines;
- `test:integration`: 25 tests, включая единый card lifecycle
  sync → decision → durable dispatch → reconciliation → `APPLIED`, а также cluster
  discovery/current state/statistics/performance-day;
- `test:e2e`: 3 tests, включая cluster `POST → APPLIED → DELETE → ABSENT`;
  `test:load`: 4 tests; `test:runbook`: 23 tests;
- property suite: 3 tests; source mutation score: 100% (9/9 killed);
- frozen install, workspace build, built bidder/mock smoke, profile/checksum, deprecated endpoint,
  secret и container policy gates;
- `pnpm audit --audit-level=high` и `pnpm audit --audit-level=high --prod` без известных
  уязвимостей; Trivy HIGH/CRITICAL scan двух локально собранных runtime images без findings;
- Docker build, `docker compose config` для production/full-mock/mock-only и `smoke:compose`
  для mock-only/full-mock;
- Agentplane routing check и `ap doctor` без ошибок.

Локально не подтверждены только обязательный WB sandbox smoke, hosted CI run и внешние
release-owner решения. По направлению пользователя GitHub не используется: проект ещё не
опубликован. Все эти ограничения и их влияние на буквальный DoD зафиксированы в
[реестре расхождений](implementation-deviations.md).
