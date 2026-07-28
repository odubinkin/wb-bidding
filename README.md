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

## Локальная проверка

```bash
corepack pnpm install --frozen-lockfile
pnpm run quality
```

Настройки приведены в `.env.example`. Не помещайте реальные WB/Admin токены в git, команды,
скриншоты, Swagger examples или логи.
