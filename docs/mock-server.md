# Детерминированный WB mock

Mock — отдельное NestJS-приложение без PostgreSQL, файлового persistence и внешнего state
store. Оно предназначено только для синтетических данных. Реальные WB-токены, идентификаторы
продавца, персональные данные и production service tokens передавать mock-серверу запрещено.

## Запуск

```bash
docker compose -f docker-compose.mock-only.yml up --build
```

- Swagger UI: <http://localhost:3001/docs>
- OpenAPI JSON: <http://localhost:3001/docs-json>
- liveness: <http://localhost:3001/health/live>
- состояние: <http://localhost:3001/__mock/state>

WB-совместимые endpoints требуют только синтетический заголовок:

```text
Authorization: mock-test-token
```

## Служебный API

| Метод  | Путь                     | Назначение                                                                                       |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `POST` | `/__mock/reset`          | Сбросить seed, виртуальное время, faults, ставки и журнал                                        |
| `POST` | `/__mock/seed/:scenario` | Выбрать `foundation`, `multi-day`, `partial-failure`, `delayed-visibility` или `ambiguous-write` |
| `POST` | `/__mock/faults`         | Заменить bounded fault rules                                                                     |
| `POST` | `/__mock/time/advance`   | Перевести модельное время и материализовать полные source days                                   |
| `GET`  | `/__mock/state`          | Получить checksum и счётчики состояния                                                           |
| `GET`  | `/__mock/requests`       | Получить полные пары синтетических request/response текущего процесса                            |

Пример многодневного перехода без реального ожидания:

```bash
curl --fail -X POST http://localhost:3001/__mock/time/advance \
  -H 'Content-Type: application/json' \
  -d '{"days":5,"hours":0,"minutes":0,"finalizeStatistics":true}'
```

Один вызов сначала переводит виртуальные часы, затем создаёт завершённые статистические даты,
применяет наступившую delayed visibility и возвращает новый timestamp, список дат и SHA-256
checksum. Частичный последний модельный день не финализируется. Mock не вызывает bidder:
contract/E2E после перехода времени явно запускает нужный workflow.

Fault rule действует заданное число раз:

```bash
curl --fail -X POST http://localhost:3001/__mock/faults \
  -H 'Content-Type: application/json' \
  -d '{"rules":[{"endpointKey":"campaignCount","status":503,"remaining":1}]}'
```

Поддержаны `400`, `401`, `402`, `403`, `409`, `413`, `429` и `5xx`. Успешная запись card bid
становится видима чтению не сразу: обычно через 30 модельных секунд, а в сценарии
`delayed-visibility` — через 90 секунд. Cluster write/delete доступны mock-клиентам для
сценариев, но production adapter оставляет их fail-closed, пока cluster contract имеет статус
`UNVERIFIED`.

Mock применяет refillable token bucket на endpoint key. Fault rule может временно ужесточить
bucket и задать документированные quota headers:

```bash
curl --fail -X POST http://localhost:3001/__mock/faults \
  -H 'Content-Type: application/json' \
  -d '{
    "rules":[{
      "endpointKey":"campaignCount",
      "remaining":3,
      "rateLimit":{"requests":1,"intervalMs":10000,"burst":1},
      "responseHeaders":{"x-ratelimit-retry":"10"}
    }]
  }'
```

Override, который разрешает больший rate или burst, отклоняется с `400`. После исчерпания mock
возвращает `429`, `Retry-After`, `X-Ratelimit-Limit`, `X-Ratelimit-Remaining`,
`X-Ratelimit-Retry` и `X-Ratelimit-Reset`. Восстановление bucket проверяется переводом
виртуального времени, без wall-clock ожидания.

`partial-failure` для card batch с несколькими campaign groups принимает только первый item,
ставит его в delayed visibility и возвращает `503` с `accepted_indices`. `ambiguous-write`
ставит весь payload в delayed visibility, но возвращает `503` с outcome `UNKNOWN`, моделируя
потерю успешного ответа после dispatch. В обоих случаях клиент обязан сначала выполнить
reconciliation, а не слепой retry.

## Детерминизм

Одинаковые `MOCK_SEED`, `MOCK_INITIAL_TIME` и последовательность команд дают одинаковые
campaign/statistics данные и checksum. Reset возвращает исходное время и очищает журнал.
Request journal намеренно не маскирует синтетический payload; этим объясняется строгий запрет
на любые реальные секреты и данные.
