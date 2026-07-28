# Матрица приёмочного evidence

Этот документ не подменяет результаты команд. Статус `AUTOMATED` означает наличие
детерминированной проверки; `EXTERNAL GATE` нельзя закрыть без предоставленного внешнего
артефакта/решения. Итоговый release разрешён только когда все строки имеют сохранённый зелёный
результат.

## AC-01–AC-30

| Критерий | Статус        | Прямое evidence                                                               |
| -------- | ------------- | ----------------------------------------------------------------------------- |
| AC-01    | CI + EXTERNAL | `smoke:compose` для mock-контуров; production readiness — release environment |
| AC-02    | AUTOMATED     | `tests/unit/config.spec.ts`, token/profile/host/write gates                   |
| AC-03    | AUTOMATED     | data-sync unit/integration, scheduler lock/cursor/freshness/capacity          |
| AC-04    | AUTOMATED     | golden/property tests, DB-only `DecisionJobService`                           |
| AC-05    | AUTOMATED     | decision-engine unit/golden/mutation tests                                    |
| AC-06    | AUTOMATED     | policy/guardrail/property/pre-dispatch tests                                  |
| AC-07    | AUTOMATED     | decision и write-pipeline PostgreSQL integration                              |
| AC-08    | AUTOMATED     | crash windows, `UNKNOWN`, stable-old reconciliation integration               |
| AC-09    | AUTOMATED     | write integration и HTTP mock E2E read-after-write                            |
| AC-10    | AUTOMATED     | limiter unit/integration, `429` headers и shared PostgreSQL bucket            |
| AC-11    | AUTOMATED     | append-only triggers, decision/attempt/audit integration                      |
| AC-12    | AUTOMATED     | observability service, runbook readiness tests, real built smoke              |
| AC-13    | AUTOMATED     | mock contract/OpenAPI/virtual-time/fault suites                               |
| AC-14    | PARTIAL       | 49/51 сценариев; E2E-24/49 и compose topology не закрыты                      |
| AC-15    | AUTOMATED     | ESLint JSDoc и `docs:check`                                                   |
| AC-16    | AUTOMATED     | `tests/load/account-scale-postgres.load.spec.ts`                              |
| AC-17    | AUTOMATED     | Admin contract и economics PostgreSQL integration                             |
| AC-18    | AUTOMATED     | binding transition/startup integration и configuration                        |
| AC-19    | AUTOMATED     | `tests/openapi/openapi.spec.ts`, protected docs contract                      |
| AC-20    | AUTOMATED     | golden estimator, PAVA/interpolation/late-attribution tests                   |
| AC-21    | AUTOMATED     | capability matrix и unverified cluster fail-closed tests                      |
| AC-22    | AUTOMATED     | experiment state machine/planning/runtime queue lifecycle tests               |
| AC-23    | AUTOMATED     | JWT matrix и singleton binding transitions                                    |
| AC-24    | PARTIAL       | UNVERIFIED gate зелёный; verified mock cluster write/delete отсутствует       |
| AC-25    | AUTOMATED     | per-item attempt/partial/timeout/reconciliation integration                   |
| AC-26    | AUTOMATED     | finalization, coverage, `shks`, `canceled`, late attribution                  |
| AC-27    | AUTOMATED     | WB fixtures/profile checksum/fullstats leaf aggregation                       |
| AC-28    | AUTOMATED     | Admin API contract: permissions/ETag/idempotency/jobs/retry                   |
| AC-29    | AUTOMATED     | error classifier, circuit/429, readiness и quota tests                        |
| AC-30    | EXTERNAL GATE | harness `smoke:sandbox`; нужен manifest/Test token и release-owner evidence   |

## Definition of Done, раздел 31

| Пункт     | Статус               | Evidence / условие закрытия                                                  |
| --------- | -------------------- | ---------------------------------------------------------------------------- |
| DoD-31.1  | BLOCKED              | AC-14/24 имеют cluster mock gaps; AC-30 требует external evidence            |
| DoD-31.2  | AUTOMATED            | money/golden/property и versioned rate profile/limiter tests                 |
| DoD-31.3  | CI GATE              | все команды из `docs/testing.md`, dependency/container scans и CI run        |
| DoD-31.4  | EXTERNAL GATE        | `SANDBOX_FIXTURE_MANIFEST`, Test token, явное разрешение и redacted evidence |
| DoD-31.5  | AUTOMATED            | `pnpm run test:runbook`                                                      |
| DoD-31.6  | AUTOMATED            | `pnpm run docs:check`                                                        |
| DoD-31.7  | AUTOMATED + OPERATOR | secret scan; runtime secret manager и log inspection                         |
| DoD-31.8  | AUTOMATED            | compose default false и config multi-gate tests                              |
| DoD-31.9  | AUTOMATED            | global kill integration и rollback drill в runbook suite                     |
| DoD-31.10 | EXTERNAL GATE        | подписанное product-owner решение о production writes                        |
| DoD-31.11 | AUTOMATED            | endpoint profile + adapter/pre-dispatch fail-closed tests                    |

## Release evidence

В release bundle сохраняются:

- `packages/contracts/src/profiles/build-profile.json`;
- [технический WB evidence report](wb-api-evidence/wb-promotion-2026-07-28-v1.md);
- checksum pinned endpoint profile и contract fixture;
- вывод quality/integration/e2e/load/runbook/docs/security/container commands;
- CI run URL и immutable image digest;
- redacted sandbox evidence;
- product-owner и API release-owner решения;
- актуальный [реестр расхождений](implementation-deviations.md).

Построчное покрытие раздела 25.4 хранится в
[матрице E2E-сценариев](e2e-scenario-evidence.md).

## Локальный verification snapshot 2026-07-29

На чистой PostgreSQL 18 database с применёнными шестью migrations подтверждено:

- `pnpm run quality`: 97 unit, 1 golden, 2 OpenAPI и 10 contract tests; coverage
  98.04% statements, 90.33% branches, 99.09% functions, 97.99% lines;
- `test:integration`: 25 tests, включая единый card lifecycle
  sync → decision → durable dispatch → reconciliation → `APPLIED`;
- `test:e2e`: 2 tests; `test:load`: 4 tests; `test:runbook`: 23 tests;
- property suite: 3 tests; source mutation score: 100% (9/9 killed);
- frozen offline install, workspace build, built bidder/mock smoke, docs, profile/checksum,
  deprecated endpoint, secret и container policy gates;
- `docker compose config` для production, full mock и mock-only;
- Agentplane routing check и `ap doctor` без ошибок.

Локально не подтверждены Docker runtime/image scan, dependency audit, sandbox smoke и внешние
release decisions. Они остаются CI/external gates; Docker daemon в локальной среде недоступен.
