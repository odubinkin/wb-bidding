# Evidence report WB Promotion profile `wb-promotion-2026-07-28-v1`

Статус отчёта: техническая сверка завершена, утверждение release owner не предоставлено.
Дата read-only сверки: 2026-07-29.

## Артефакты

- profile: `packages/contracts/src/profiles/wb-promotion-2026-07-28-v1.json`;
- profile SHA-256: `11fde6df2c5049c11199096522e565e9c726f3ad211de1b832f3a068c53b5937`;
- runtime fixture: `fixtures/wb-contracts/wb-promotion-runtime-v1.json`;
- fixture SHA-256: `2dcbdbdf073472a0d648a8ede4a124216ab5ddb594ceb2f4c362c5678c58828e`;
- runtime schema: `wb-promotion-runtime-v1`.

Официальные источники: [Promotion OpenAPI](https://dev.wildberries.ru/ru/openapi/promotion),
[общая информация API](https://dev.wildberries.ru/ru/openapi/api-information),
[типы токенов](https://dev.wildberries.ru/knowledge-base/articles/019d49a0-f60a-7b42-bcbb-15b1cfee9023/sposoby-podkliucheniia-k-wb-api-token-i-oauth-2-0),
[sandbox](https://dev.wildberries.ru/sandbox) и
[release notes](https://dev.wildberries.ru/release-notes).

## Результат

| Contract                            | Статус       | Основание                                                                          |
| ----------------------------------- | ------------ | ---------------------------------------------------------------------------------- |
| card bid/minimum в копейках         | `VERIFIED`   | wire fields явно имеют суффикс/описание kopecks; synthetic schemas/golden fixtures |
| Personal endpoint limits            | `VERIFIED`   | официальные endpoint tables; runtime headers могут только ужесточить               |
| Base/Test limits                    | conservative | безопасный cap 1 request/s; не используется для повышения published limits         |
| `fullstats` shape/range/rate        | проверено    | `GET /adv/v3/fullstats`, 1–50 IDs, до 31 дня, 3 запроса/мин, nested day/apps/nms   |
| `fullstats` money/aggregation       | `UNVERIFIED` | документации недостаточно для live scale, parent/leaf и late-attribution semantics |
| same-day spend coverage/lag         | `UNVERIFIED` | нет доказанной realtime coverage boundary и максимального reporting lag            |
| budget remaining semantics          | `UNVERIFIED` | `cash/netting/total` не объявляются остатком                                       |
| cluster unit/minimum/absence/delete | `UNVERIFIED` | требуется sandbox/prod canary read-after-write/delete evidence                     |

Техническая сверка не переводит последние четыре строки в `VERIFIED`. Для этого нужны redacted
sandbox/live fixtures, request ID, read-after-write/reconciliation proof и подпись назначенного
release owner. До такого решения runtime обязан оставаться fail closed.

## Подпись release owner

Не предоставлена. Поля, которые должны быть зафиксированы внешним решением: имя/роль, timestamp,
утверждённый profile SHA-256, перечень разрешённых переходов contract status и ссылка на
неизменяемый evidence bundle.
