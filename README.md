# WB Bidder

WB Bidder — self-hosted backend одного продавца для детерминированного управления ставками
WB Продвижение. Цель алгоритма — максимизация ожидаемой маржинальной прибыли после рекламы
при соблюдении ограничений риска, бюджета и подтверждённых возможностей WB API.

Проект находится в активной разработке по
[техническому заданию](docs/technical-specification.md). Production-запись по умолчанию
выключена. Неподтверждённые wire-контракты работают fail closed.

## Требования

- Node.js 24;
- pnpm 10;
- Docker с Compose;
- PostgreSQL 18 для запуска без Compose.

## Быстрый запуск mock-контура

```bash
docker compose -f docker-compose.mock.yml up --build
```

После старта:

- bidder Swagger UI: <http://localhost:3000/docs>;
- bidder OpenAPI JSON: <http://localhost:3000/docs-json>;
- mock Swagger UI: <http://localhost:3001/docs>;
- mock OpenAPI JSON: <http://localhost:3001/docs-json>;
- readiness bidder: <http://localhost:3000/health/ready>;
- mock state: <http://localhost:3001/__mock/state>.

Остановка с удалением временного mock-состояния:

```bash
docker compose -f docker-compose.mock.yml down
```

## Production-топология в безопасном read-only режиме

Скопируйте `.env.example` во внешнее секретное хранилище/локальный `.env`, замените все
`replace-*`/`missing-token` и оставьте `WB_API_WRITE_ENABLED=false`:

```bash
docker compose up --build -d
docker compose ps
curl --fail http://localhost:3000/health/live
curl --fail http://localhost:3000/health/ready
curl --fail -H "Authorization: Bearer ${ADMIN_API_SERVICE_TOKEN}" \
  http://localhost:3000/docs-json
```

- bidder Swagger UI: <http://localhost:3000/docs>;
- bidder OpenAPI JSON: <http://localhost:3000/docs-json>;
- readiness: <http://localhost:3000/health/ready>;
- metrics: <http://localhost:3000/metrics>.

Production Compose не содержит mock. Включение writes требует всех gates из
[документации безопасности](docs/security.md) и зафиксированного решения владельца продукта.
Остановка без удаления PostgreSQL volume:

```bash
docker compose down
```

## Только WB mock

```bash
docker compose -f docker-compose.mock-only.yml up --build
```

Mock не использует PostgreSQL или внешнее хранилище. На этапе Stage 0 доступен каркас
служебного API. Реализованы все методы WB из таблицы 4.2 ТЗ, виртуальные часы, delayed
visibility ставок, fault injection, rate-limit headers и журнал синтетических
request/response. Для WB-совместимых путей используйте только тестовый заголовок
`Authorization: mock-test-token`.

Smoke без PostgreSQL:

```bash
docker compose -f docker-compose.mock-only.yml up -d --build
curl --fail http://localhost:3001/health/live
curl --fail http://localhost:3001/docs-json
curl --fail -H 'Authorization: mock-test-token' \
  http://localhost:3001/adv/v1/promotion/count
docker compose -f docker-compose.mock-only.yml down
```

Сценарии и служебные запросы описаны в [документации mock-сервера](docs/mock-server.md).
Профиль интеграции, статусы `VERIFIED | UNVERIFIED | DEPRECATED` и правила fail-closed
описаны в [документации WB API](docs/wb-api-integration.md).
Архитектура jobs, checkpoints, target snapshots и статистических evidence описана в
[документации синхронизации](docs/data-synchronization.md).
Алгоритм прибыли, exact arithmetic, bounds и exploration описаны в
[документации Decision Engine](docs/decision-engine.md).
Общая схема компонентов приведена в [архитектуре](docs/architecture.md), эксплуатация — в
[runbook](docs/runbook.md), а текущий статус приёмки — в
[матрице evidence](docs/acceptance-evidence.md).

## Локальная проверка

```bash
corepack pnpm install --frozen-lockfile
pnpm run quality
DATABASE_URL=postgresql://... pnpm run test:integration
DATABASE_URL=postgresql://... pnpm run test:load
DATABASE_URL=postgresql://... pnpm run test:runbook
pnpm run docs:check
pnpm run security:secrets
```

Настройки приведены в `.env.example` и подробно описаны в
[`docs/configuration.md`](docs/configuration.md). Не помещайте реальные WB/Admin токены в git, команды,
скриншоты, Swagger examples или логи.
