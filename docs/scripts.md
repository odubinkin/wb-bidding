# Служебные скрипты

Каталог `scripts/` содержит исполняемые quality gates и smoke-проверки, для которых обычного
unit-теста недостаточно. Скрипты запускаются из корня репозитория через команды `pnpm` из
`package.json`. Они не являются runtime-зависимостями bidder и не должны импортироваться
production-кодом.

## Быстрая классификация

| Скрипт                                     | Команда                                 | Контур               | Побочные эффекты                                                                                  |
| ------------------------------------------ | --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| `scripts/compose-smoke.mjs`                | `pnpm run smoke:compose`                | Docker Compose       | собирает образы, создаёт контейнеры и volumes, затем удаляет их                                   |
| `scripts/require-database-url.mjs`         | вызывается database suites              | предварительный gate | нет                                                                                               |
| `scripts/run-decision-mutation-tests.mjs`  | `pnpm run test:mutation`                | Decision Engine      | запускает дочерние процессы Vitest                                                                |
| `scripts/sandbox-smoke.mjs`                | `pnpm run smoke:sandbox`                | внешний WB sandbox   | выполняет сетевые чтения, а при отдельном подтверждении — обратимую запись; создаёт evidence-файл |
| `scripts/smoke-built-apps.mjs`             | `pnpm run smoke:built`                  | собранные приложения | запускает локальные процессы и обращается к тестовой БД                                           |
| `scripts/verify-container.mjs`             | `pnpm run security:container`           | Docker policy        | нет                                                                                               |
| `scripts/verify-database-architecture.mjs` | `pnpm run verify:database-architecture` | архитектурный gate   | нет                                                                                               |
| `scripts/verify-deprecated-endpoints.mjs`  | `pnpm run verify:deprecated-endpoints`  | WB-контракт          | нет                                                                                               |
| `scripts/verify-docs.mjs`                  | `pnpm run docs:check`                   | документация         | нет                                                                                               |
| `scripts/verify-endpoint-profile.mjs`      | `pnpm run profile:checksum`             | WB-профиль           | нет                                                                                               |
| `scripts/verify-secrets.mjs`               | `pnpm run security:secrets`             | безопасность         | читает tracked и видимые untracked файлы, но не изменяет их                                       |
| `scripts/verify-wb-contract-fixtures.mjs`  | `pnpm run verify:wb-contract-fixtures`  | WB fixtures          | нет                                                                                               |

`pnpm run scripts:check` выполняет синтаксическую проверку каждого `.mjs`. Полный
`pnpm run quality` дополнительно запускает безопасные статические gates и тесты. Stateful smoke
не входят в `quality`, потому что требуют Docker, PostgreSQL или внешнего WB sandbox.

## Smoke-проверки

### Compose

`scripts/compose-smoke.mjs` последовательно проверяет `docker-compose.mock-only.yml` и
`docker-compose.mock.yml`. Для каждого контура он выполняет `docker compose config`, сборку и
`up --wait`, затем проверяет health/OpenAPI HTTP endpoints. Используются фиксированные host-порты
`3000` и `3001`; перед локальным запуском они должны быть свободны. Cleanup выполняется через
`docker compose down --volumes --remove-orphans`, поэтому данные созданных smoke volumes не
сохраняются.

### Собранные приложения

`scripts/smoke-built-apps.mjs` запускает `apps/wb-mock/dist/main.js` и
`apps/bidder/dist/main.js`, а не TypeScript-исходники. Поэтому перед ним нужны `pnpm run build`,
применённые миграции и `DATABASE_URL` отдельной тестовой PostgreSQL. Фиксированные порты — `3191`
для mock и `3190` для bidder. Скрипт проверяет readiness, service-info, mock state и обе OpenAPI
схемы, после чего завершает дочерние процессы.

### WB sandbox

`scripts/sandbox-smoke.mjs` — ручной release gate, который не запускается на обычном PR. Нужны
собранный пакет WB API, `SANDBOX_FIXTURE_MANIFEST` и `WB_API_TOKEN` типа Test. По умолчанию скрипт
выполняет только чтения. Наличие `writeCanary` в manifest требует точного подтверждения
`SANDBOX_WRITE_CONFIRMATION=I_UNDERSTAND_SANDBOX_WRITES`; после canary скрипт проверяет возврат
исходной ставки. Результат, включая стадию ошибки без token/response payload, записывается в
`SANDBOX_EVIDENCE_OUTPUT` или `artifacts/sandbox-smoke-evidence.json` с режимом `0600`.

## Тестовые и архитектурные gates

`scripts/require-database-url.mjs` завершает database suite до Vitest, если `DATABASE_URL`
отсутствует или пуст. Он намеренно не проверяет доступность сервера: соединение и миграции
проверяет сама suite.

`scripts/run-decision-mutation-tests.mjs` сначала запускает baseline Decision Engine tests, затем
девять source mutations из `vitest.config.ts`. Мутация считается убитой только при assertion-test
failure; timeout, signal, spawn/configuration error делают сам gate неуспешным. Anchors должны
встречаться в production-исходниках ровно один раз.

`scripts/verify-database-architecture.mjs` запрещает прямую зависимость от `pg`, удалённый raw SQL
facade, прямой Prisma raw API и SQL statements вне `packages/database`. Он сканирует TypeScript в
`apps`, `packages`, `tests` и workspace manifests. Это защитный архитектурный gate, а не SQL parser.

`scripts/verify-deprecated-endpoints.mjs` запрещает известные deprecated пары method/path в
implementation и JSON contracts, кроме централизованного compatibility registry. Метод и путь
должны находиться в одном endpoint object; отдельные несвязанные строки не считаются парой.

## Контрактные и документальные gates

`scripts/verify-endpoint-profile.mjs` считает SHA-256 точных байтов активного endpoint profile и
сверяет его с `build-profile.json`. Любое осознанное изменение профиля требует обновить закреплённый
checksum.

`scripts/verify-wb-contract-fixtures.mjs` аналогично связывает runtime WB fixture с checksum в
endpoint profile и проверяет наличие обязательных contract keys. Семантическую форму ответов
дополнительно проверяют contract tests.

`scripts/verify-docs.mjs` проверяет обязательные русскоязычные документы, H1, локальные ссылки,
Mermaid evidence, карту TypeScript-модулей, все Prisma models, acceptance identifiers и наличие
описания каждого `.mjs` в этом справочнике. Проверка структурная и не заменяет содержательный review.

## Security gates

`scripts/verify-container.mjs` проверяет policy в конкретных Docker stages и Compose-файлах:
закреплённый runtime base, non-root user, frozen install, удаление package managers из runtime,
отсутствие копирования `.env`, healthchecks и выключенные по умолчанию production writes. Реальную
сборку и vulnerability scan выполняет CI отдельно.

`scripts/verify-secrets.mjs` ищет высокосигнальные private keys и token assignments во всех tracked
и неигнорируемых untracked файлах. Явные тестовые placeholders разрешены по точным значениям или
ограниченным префиксам. Это быстрый repository gate, а не универсальный secret scanner; секреты
всё равно должны храниться вне git, а CI может дополнять проверку специализированным инструментом.

## Изменение скриптов

При добавлении нового `.mjs` нужно одновременно:

1. добавить команду в `package.json`, если скрипт предназначен для прямого запуска;
2. включить его в `scripts:check`;
3. описать назначение, prerequisites и побочные эффекты в этом документе;
4. определить, входит ли он в `quality`, CI или остаётся ручным stateful gate;
5. не превращать отсутствие внешней инфраструктуры в успешный результат проверки.
