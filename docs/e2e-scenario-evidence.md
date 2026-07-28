# Трассировка обязательных E2E-сценариев

Статус `AUTOMATED` означает, что поведение проверяется исполняемым тестом. `PARTIAL` означает,
что fail-closed часть доказана, но положительная ветвь требования ещё не реализована или не
подтверждена. Эта таблица не заменяет зелёный вывод CI.

Функциональные suites запускают реальные NestJS приложения, HTTP mock и временные PostgreSQL
базы, но не входят внутрь `docker-compose.mock.yml`. Compose отдельно проходит build,
health/readiness и HTTP smoke в `scripts/compose-smoke.mjs`. Это расхождение тестовой топологии
зафиксировано в [реестре расхождений](implementation-deviations.md).

| ID     | Статус    | Исполняемое evidence                                                                    |
| ------ | --------- | --------------------------------------------------------------------------------------- |
| E2E-01 | AUTOMATED | `data-sync-worker.integration.spec.ts`: sync → DecisionJob → durable dispatch → APPLIED |
| E2E-02 | AUTOMATED | `decision-engine.spec.ts`, golden/property: прибыльное повышение и argmax               |
| E2E-03 | AUTOMATED | `decision-engine.spec.ts`, `write-flow.e2e.spec.ts`: снижение и verified write          |
| E2E-04 | AUTOMATED | `decision-engine-boundaries.spec.ts`: максимум на текущей ставке                        |
| E2E-05 | AUTOMATED | `decision-engine.spec.ts`: zero-conversion protective decrease                          |
| E2E-06 | AUTOMATED | data-sync evidence и property suites: stale/invalid fail closed                         |
| E2E-07 | AUTOMATED | `data-sync.integration.spec.ts`: scheduler non-overlap и checkpoint                     |
| E2E-08 | AUTOMATED | `write-pipeline.integration.spec.ts`: recovery после claim/crash                        |
| E2E-09 | AUTOMATED | `write-flow.e2e.spec.ts`: post-dispatch ambiguity без двойного write                    |
| E2E-10 | AUTOMATED | mock contract + write E2E: delayed visibility                                           |
| E2E-11 | AUTOMATED | mock contract и limiter suites: `429`, retry/reset headers                              |
| E2E-12 | AUTOMATED | WB resilience и write E2E: transient `5xx`                                              |
| E2E-13 | AUTOMATED | pre-dispatch integration: live bid mismatch отменяет dispatch                           |
| E2E-14 | AUTOMATED | decision integration: старое queued-решение superseded                                  |
| E2E-15 | AUTOMATED | decision unit/config: observe-only не создаёт write                                     |
| E2E-16 | AUTOMATED | write integration: global/target automation kill controls                               |
| E2E-17 | AUTOMATED | config/token suites: sandbox/prod write gates                                           |
| E2E-18 | AUTOMATED | decision boundary suite: economics blocker локален target/nm                            |
| E2E-19 | AUTOMATED | policy/economics integration: новая версия supersedes queue                             |
| E2E-20 | AUTOMATED | decision integration: async partial/dry-run import                                      |
| E2E-21 | AUTOMATED | golden fixture: максимум прибыли по нескольким bid buckets                              |
| E2E-22 | AUTOMATED | estimator unit/property: PAVA, interpolation, no extrapolation                          |
| E2E-23 | AUTOMATED | decision capability tests: dual-placement attribution blocker                           |
| E2E-24 | AUTOMATED | verified mock cluster sync/stats/optimizer; production unverified и CPC fail closed     |
| E2E-25 | AUTOMATED | recommendation tests: hint добавляет только обеспеченный CPM candidate                  |
| E2E-26 | AUTOMATED | experiment unit/integration/runtime: lower-only и безопасный revert                     |
| E2E-27 | AUTOMATED | mock contract: multi-day `/__mock/time/advance` и conversion lag                        |
| E2E-28 | AUTOMATED | data-sync integration: late attribution supersedes checksum/version                     |
| E2E-29 | AUTOMATED | config, built/compose smoke: production write-disabled multi-gate                       |
| E2E-30 | AUTOMATED | binding integration: rotation/upgrade разрешены, drift запрещён                         |
| E2E-31 | AUTOMATED | write integration: partial response и per-item reconciliation                           |
| E2E-32 | AUTOMATED | profile/adapter contract: cluster POST/DELETE недоступны при UNVERIFIED                 |
| E2E-33 | AUTOMATED | performance-day tests: enrollment/gap/shared external provenance                        |
| E2E-34 | AUTOMATED | token suites: read-only/expired/wrong-category diagnostics                              |
| E2E-35 | AUTOMATED | runbook/observability: cached readiness и bounded `/ping`                               |
| E2E-36 | AUTOMATED | Admin contract/integration: permission, ETag, idempotency, job locks                    |
| E2E-37 | AUTOMATED | decision blocker и sync tests: status `4` без estimator/write                           |
| E2E-38 | AUTOMATED | budget boundary/data-sync tests: freshness, coverage и lag reserve                      |
| E2E-39 | AUTOMATED | decision unit: zero-conversion использует только текущий regime                         |
| E2E-40 | AUTOMATED | experiment runtime/unit: constrained и blocked revert                                   |
| E2E-41 | AUTOMATED | write integration: два stable-old reads, contradiction fail closed                      |
| E2E-42 | AUTOMATED | token/config/limiter suites: Personal/Test/Base/Service matrix                          |
| E2E-43 | AUTOMATED | fullstats normalization test: `canceled` не подменяет ordered units                     |
| E2E-44 | AUTOMATED | binding integration: currency/timezone drift останавливает startup                      |
| E2E-45 | AUTOMATED | scheduler/config/data-sync tests: deadline, overlap, SLA coverage                       |
| E2E-46 | AUTOMATED | decision tests: UNVERIFIED same-day блокирует только increase                           |
| E2E-47 | AUTOMATED | write integration: PREPARED и DISPATCHING crash windows                                 |
| E2E-48 | AUTOMATED | pre-dispatch integration: changed/stale live read                                       |
| E2E-49 | AUTOMATED | `write-flow.e2e.spec.ts`: POST → APPLIED → DELETE/ABSENT, точный live `wireBidRaw`      |
| E2E-50 | AUTOMATED | data-sync/WB schema tests: NFC-only, case/whitespace, collision blocker                 |
| E2E-51 | AUTOMATED | executor/WB tests: post-dispatch ambiguity против pre-byte retry                        |

## Итог

Локально автоматизированы все 51 обязательная поведенческая строка. Production cluster contract
по-прежнему обязан оставаться `UNVERIFIED`; положительная ветвь изолирована immutable
verified-mock profile и не может быть выбрана для WB origin. Буквальная Compose-топология и
внешние release gates учитываются отдельно и не скрываются этим статусом.
