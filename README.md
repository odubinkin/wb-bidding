# WB Bidder — сервис управления ставками

WB Bidder — self-hosted backend для одного продавца на Wildberries. Он помогает выбирать ставку
для продвижения товара: собирает статистику и текущее состояние кампаний, оценивает ожидаемую
маржинальную прибыль после рекламных расходов и при необходимости применяет безопасное изменение.
Ставка — это не обещание продаж: она меняет расход и вероятность показа, поэтому система
сознательно отказывается от действия, когда данных или подтверждений недостаточно.

Если вы впервые в проекте, не начинайте с технического задания или исходного кода. Прочитайте
[путеводитель по проекту](docs/project-guide.md): в нём объяснены предметная задача, термины,
сквозной пример, режимы работы и порядок дальнейшего чтения.

Проект находится в активной разработке по
[техническому заданию](docs/technical-specification.md). Production-запись по умолчанию выключена.
Неизвестный или неподтверждённый контракт WB API не допускается использовать для денежного
расчёта либо записи — это правило называется _fail-closed_.

## Документация

Начните с [путеводителя](docs/project-guide.md), затем выберите нужную глубину:

- [Архитектура](docs/architecture.md) объясняет состав системы и её сквозной поток;
- [карта модулей](docs/modules.md) сопоставляет компоненты с файлами реализации;
- [справочник реализации](docs/implementation-reference.md) раскрывает запуск, jobs, HTTP API,
  синхронизацию, WB-клиент, очередь и эксплуатацию;
- [алгоритм управления ставками](docs/bidding-algorithm.md) и [модель данных](docs/data-model.md)
  описывают, как факты превращаются в решение и как это можно проверить;
- [конфигурация](docs/configuration.md), [безопасность](docs/security.md),
  [наблюдаемость](docs/observability.md) и [runbook](docs/runbook.md) предназначены для оператора;
- [интеграция WB API](docs/wb-api-integration.md), [mock-сервер](docs/mock-server.md),
  [синхронизация](docs/data-synchronization.md), [модуль решения](docs/decision-engine.md) и
  [конвейер записи](docs/write-pipeline.md) раскрывают отдельные потоки реализации;
- [тестирование](docs/testing.md), [приёмочные доказательства](docs/acceptance-evidence.md) и
  [реестр расхождений](docs/implementation-deviations.md) показывают границы подтверждённой
  готовности, а не маркетинговую оценку продукта.

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

## Рабочая топология в безопасном режиме только чтения

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
Архитектура заданий, контрольных точек, снимков target и статистических данных описана в
[документации синхронизации](docs/data-synchronization.md).
Алгоритм прибыли, точная арифметика, границы и исследовательские эксперименты описаны в
[документации модуля принятия решений](docs/decision-engine.md).
Общая схема компонентов приведена в [архитектуре](docs/architecture.md), эксплуатация — в
[runbook](docs/runbook.md), а текущий статус приёмки — в
[матрице доказательств](docs/acceptance-evidence.md).

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
