# Карта модулей системы

## Как пользоваться картой

Этот документ нужен после [путеводителя](project-guide.md) и [архитектуры](architecture.md), когда
уже понятно, зачем существуют синхронизация, расчёт и очередь. Он связывает исполняемый код с
назначением каждого модуля: по таблицам можно перейти от понятия из документации к файлу, который
его реализует. Это не каталог «что делает каждая строка»: для порядка вызовов используйте
[справочник реализации](implementation-reference.md), а для причин бизнес-ограничений —
[алгоритм](bidding-algorithm.md) и [ADR-0001](adr/0001-fail-closed-wb-contracts.md).

Этот документ дополняет
[архитектуру](architecture.md), а не заменяет её: здесь приведены границы исходных файлов,
их входы, результаты и ключевые зависимости. Имена пакетов, классов, API и переменных оставлены
на английском, поскольку это идентификаторы реализации.

Подробный порядок работы этих модулей, включая runtime, API, I/O и проверки, приведён в
[справочнике реализации](implementation-reference.md).

## Приложение `apps/bidder`

Это NestJS-процесс, который принимает административные запросы, координирует синхронизацию и
расчёты, но по умолчанию не имеет права записывать ставки в WB.

| Файл                             | Назначение                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `app.module.ts`                  | Корневой NestJS-модуль: собирает контроллеры, конфигурацию, пул БД, runtime-сервисы, обработчик ошибок и структурный журнал.       |
| `main.ts`                        | Запускает HTTP-процесс, применяет ограничение размера запроса, валидацию, OpenAPI и корректное завершение.                         |
| `application-config.ts`          | Объявляет DI-токен неизменяемой проверенной конфигурации.                                                                          |
| `application-config.module.ts`   | Единожды загружает конфигурацию и предоставляет её остальным компонентам.                                                          |
| `database.ts`                    | Создаёт ограниченный пул PostgreSQL и закрывает его при остановке приложения.                                                      |
| `runtime.providers.ts`           | Связывает DI-провайдеры пакетов синхронизации, расчёта, WB API и конвейера записи.                                                 |
| `runtime-coordinator.service.ts` | Выполняет fail-closed инициализацию: проверяет профиль, binding, capacity и запускает координаторы только после успешных проверок. |
| `runtime-state.ts`               | Хранит процессное состояние безопасности; оно может только закрыть возможность записи.                                             |
| `runtime-clock.service.ts`       | Даёт модельное время: wall clock для production/sandbox и виртуальные часы mock-контура.                                           |
| `scheduler.service.ts`           | Разбирает six-field cron, регистрирует задания и не допускает параллельного выполнения одного job.                                 |
| `decision-job.service.ts`        | Загружает готовые snapshots, запускает чистый `decision-engine` и помещает допустимые решения в durable queue.                     |
| `experiment-runtime.service.ts`  | Продвигает lower-only experiments и ставит старт/revert в ту же очередь, что и обычные решения.                                    |
| `write-runtime.service.ts`       | Управляет исполнителем, verification, reconciliation, recovery и retention write-конвейера.                                        |
| `pre-dispatch-validator.ts`      | Повторно подтверждает economics, policy, binding, snapshot и live state перед переходом в `DISPATCHING`.                           |
| `wb-integration.ts`              | Создаёт безопасный профиль декодированного WB token и выдаёт его через DI.                                                         |
| `admin.controller.ts`            | HTTP-граница `/api/v1`: маршруты product economics, policies, automation, jobs, decisions, queue и audit.                          |
| `admin.service.ts`               | Транзакционная бизнес-логика Admin API: версии, идемпотентность, курсоры, import и аудит.                                          |
| `admin-dto.ts`                   | DTO и OpenAPI/class-validator-ограничения для тел и ответов Admin API.                                                             |
| `admin-security.ts`              | Service-token guard, permission metadata и извлечение principal из принятого запроса.                                              |
| `problem-details.ts`             | Преобразует ошибки в RFC 9457 `application/problem+json` с correlation ID.                                                         |
| `health.controller.ts`           | Liveness/readiness endpoints с ограниченными проверками зависимостей.                                                              |
| `service-info.controller.ts`     | Отдаёт не секретные сведения о сборке и профиле интеграции.                                                                        |
| `observability.service.ts`       | Регистрирует Prometheus-метрики, bounded readiness checks и бизнес-сигналы runtime.                                                |
| `openapi.ts`                     | Строит OpenAPI-документ bidder из метаданных NestJS и DTO.                                                                         |

## Приложение `apps/wb-mock`

Изолированный NestJS-сервер без PostgreSQL. Он имитирует подтверждённую часть WB Promotion API,
виртуальное время, лимиты и ошибочные сценарии для контрактных и E2E-тестов.

| Файл                       | Назначение                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `app.module.ts`            | Корневой модуль mock: контроллеры, состояние, конфигурация и HTTP-filter.                      |
| `main.ts`                  | Запускает mock HTTP-процесс и его Swagger/OpenAPI-поверхность.                                 |
| `mock-config.ts`           | Определяет DI-токен и проверенную конфигурацию детерминированного mock.                        |
| `mock-state.service.ts`    | Хранит кампании, ставки, виртуальные часы, fault plans, rate-limit counters и журнал запросов. |
| `mock.controller.ts`       | Служебный API `/__mock` для reset, fixture, времени, faults и диагностики.                     |
| `promotion.controller.ts`  | WB-совместимые Promotion/Common endpoints; передаёт запросы в состояние mock.                  |
| `promotion.dto.ts`         | DTO запросов и ответов совместимых promotion endpoints.                                        |
| `mock-exception.filter.ts` | Формирует детерминированные WB-подобные ошибки и quota headers, включая `429`.                 |
| `openapi.ts`               | Строит OpenAPI mock-сервера из runtime-метаданных.                                             |

## Пакет `@wb-bidder/config`

| Файл        | Назначение                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| `schema.ts` | Zod-схемы окружения, режимы `mock`/`sandbox`/`prod`, проверка токенов, URL, лимитов и безопасных defaults. |
| `time.ts`   | Преобразует instant в календарный день аккаунта и сдвигает ISO-даты без потери часового пояса.             |
| `index.ts`  | Публичный API конфигурационного пакета.                                                                    |

## Пакет `@wb-bidder/contracts`

| Файл                     | Назначение                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `wb-endpoint-profile.ts` | Типы versioned endpoint profile, статусы доказательности контрактов и загрузка текущего профиля. |
| `money.ts`               | Branded `MinorUnits` и строгий разбор денежных величин в целых minor units.                      |
| `index.ts`               | Публичный API контрактов.                                                                        |

## Пакет `@wb-bidder/data-sync`

| Файл            | Назначение                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `binding.ts`    | Проверяет неизменяемую привязку deployment к WB account/token/environment и checksum настроек.         |
| `capacity.ts`   | Рассчитывает пропускную способность endpoint passes и fail-closed достижимость SLA.                    |
| `checksum.ts`   | Канонически хеширует evidence, включая `bigint` и `Date`.                                              |
| `evidence.ts`   | Валидирует и нормализует raw daily statistics, completeness, freshness и finalization evidence.        |
| `repository.ts` | PostgreSQL-репозиторий scheduler runs, snapshots, cursors, observations и immutable evidence versions. |
| `types.ts`      | Контракты стадий, checkpoints, snapshots, campaign/target data и worker dependencies.                  |
| `worker.ts`     | Оркестрирует bounded sync stages, locks, retries, checkpoints и запись evidence.                       |
| `index.ts`      | Публичный API синхронизации.                                                                           |

## Пакет `@wb-bidder/decision-engine`

Это чистый доменный пакет без сети, NestJS и PostgreSQL. Его подробные правила приведены в
[документе алгоритма](decision-engine.md).

| Файл             | Назначение                                                                         |
| ---------------- | ---------------------------------------------------------------------------------- |
| `types.ts`       | Полные immutable входы решения, причины, действия, bounds, evidence и результаты.  |
| `policy.ts`      | Валидирует resolved policy и её нормативные диапазоны.                             |
| `rational.ts`    | Выполняет точную рациональную арифметику без float.                                |
| `estimator.ts`   | Строит PAVA buckets, диагностические метрики и консервативный прогноз spend/units. |
| `engine.ts`      | Применяет guardrails, bounds, hysteresis, cooldown и выбирает объяснённое решение. |
| `experiments.ts` | Чистый reducer жизненного цикла lower-only experiment.                             |
| `ids.ts`         | Генерирует time-ordered UUIDv7 от переданных часов.                                |
| `checksum.ts`    | Создаёт scoped semantic SHA-256 для snapshots и решений.                           |
| `repository.ts`  | Определяет порты атомарной записи decision/experiment без привязки к БД.           |
| `index.ts`       | Публичный API decision engine.                                                     |

## Пакет `@wb-bidder/wb-api`

| Файл                   | Назначение                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `endpoint-registry.ts` | Единственный реестр разрешённых WB method/path pairs и capability/profile ограничений.         |
| `schemas.ts`           | Runtime Zod-схемы подтверждённых wire-ответов и request payloads.                              |
| `token.ts`             | Безопасно декодирует и проверяет тип, окружение и capability WB token без логирования секрета. |
| `money.ts`             | Нормализует WB decimal money в точные scale-two minor units.                                   |
| `rate-limiter.ts`      | Реализует profile-aware quotas, reservation и учёт заголовков лимитов.                         |
| `resilience.ts`        | Классифицирует ошибки, задаёт retry/backoff и circuit-breaker правила.                         |
| `transport.ts`         | Изолирует fetch/HTTP и сохраняет факт установления соединения для safe retry.                  |
| `client.ts`            | Собирает registry, token, schemas, limiter и resilience в fail-closed WB-клиент.               |
| `index.ts`             | Публичный API клиента WB.                                                                      |

## Пакет `@wb-bidder/write-pipeline`

| Файл               | Назначение                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `types.ts`         | Контракты queue item, dispatch, live state, pre-dispatch и reconciliation.                                        |
| `state-machine.ts` | Нормативные переходы очереди, classification recovery и checksums состояния.                                      |
| `repository.ts`    | Транзакционно арендует queue items, создаёт attempts, обновляет состояния и хранит audit/reconciliation evidence. |
| `wb-gateway.ts`    | Адаптирует write-пакет к endpoint profile и WB-клиенту, не пропуская неподтверждённые capability.                 |
| `executor.ts`      | Группирует homogeneous batch, резервирует лимит, фиксирует `DISPATCHING` до сети и обрабатывает результат.        |
| `redaction.ts`     | Глубоко скрывает credential-поля перед persistence и сериализацией.                                               |
| `index.ts`         | Публичный API write-конвейера.                                                                                    |

## Хранилище, поставка и проверка

| Путь                            | Назначение                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`          | Полная PostgreSQL-модель: аккаунт, синхронизация, economics, policy, decision, queue, attempts, audit и scheduler. |
| `prisma/migrations/`            | Неизменяемая история схемы и инвариантов БД; применяется только Prisma.                                            |
| `fixtures/wb-contracts/`        | Версионированные подтверждённые wire fixtures.                                                                     |
| `tests/`                        | Unit, golden, property, mutation, integration, contract, E2E, load и runbook-доказательства.                       |
| `scripts/`                      | Проверки документации, секретов, endpoint profile, контейнеров, deprecated endpoints и smoke-сценарии.             |
| `Dockerfile`, `Dockerfile.mock` | Runtime-образы bidder и mock.                                                                                      |
| `docker-compose*.yml`           | Production read-only, полный mock-контур и независимый mock-only контур.                                           |
| `.env.example`                  | Полный перечень параметров без действительных секретов.                                                            |

## Как использовать карту

1. Для изменения бизнес-правила начните с `decision-engine`, затем проследите его входные evidence
   через `data-sync` и запись через `write-pipeline`.
2. Для изменения HTTP-контракта откройте controller/DTO, затем `openapi.ts` и соответствующий
   contract/E2E-тест.
3. Для изменения WB-интеграции сначала обновите versioned profile и fixture; только затем registry,
   schema, mock и адаптер. Неподтверждённый контракт не должен открывать запись.
4. Для эксплуатационной настройки используйте [конфигурацию](configuration.md),
   [наблюдаемость](observability.md) и [runbook](runbook.md).
