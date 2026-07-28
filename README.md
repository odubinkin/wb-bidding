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
служебного API; полное WB-совместимое подмножество и виртуальные сценарии реализуются Stage 1.

## Локальная проверка

```bash
corepack pnpm install --frozen-lockfile
pnpm run quality
```

Настройки приведены в `.env.example`. Не помещайте реальные WB/Admin токены в git, команды,
скриншоты, Swagger examples или логи.
