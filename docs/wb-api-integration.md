# Интеграция с WB API

## Роль внешнего API

WB API принадлежит внешней платформе: его ответы и маршруты не становятся внутренней истиной
системы только потому, что выглядят правдоподобно. Этот документ объясняет, какие части
контракта подтверждены, какие можно использовать лишь для диагностики и почему неопределённость
закрывает запись. Базовый смысл `fail-closed`, target и placement дан в
[путеводителе](project-guide.md); общая последовательность read → snapshot → decision → write —
в [архитектуре](architecture.md).

Под **wire-контрактом** здесь понимается точная договорённость на границе HTTP: путь, метод,
заголовки, схема тела, денежные единицы и смысл отсутствия значения. Неверно угадать любой из
этих элементов опаснее, чем пропустить оптимизацию, поэтому статус `UNVERIFIED` намеренно не
является «почти рабочим»: он запрещает нормализовать данные для денег и посылать write.

Текущий immutable profile: `wb-promotion-2026-07-28-v1`. Его JSON и checksum встраиваются в
artifact, а redacted synthetic fixtures хранятся в
`fixtures/wb-contracts/wb-promotion-runtime-v1.json`.
Результат последней технической сверки и незакрытая подпись release owner находятся в
[evidence report](wb-api-evidence/wb-promotion-2026-07-28-v1.md).

Официальные источники:

- [Маркетинг и продвижение](https://dev.wildberries.ru/ru/openapi/promotion)
- [Общая информация, JWT, ошибки и ping](https://dev.wildberries.ru/ru/openapi/api-information)
- [Типы токенов и OAuth](https://dev.wildberries.ru/knowledge-base/articles/019d49a0-f60a-7b42-bcbb-15b1cfee9023/sposoby-podkliucheniia-k-wb-api-token-i-oauth-2-0)
- [Ограничения sandbox](https://dev.wildberries.ru/knowledge-base/articles/019d49a1-24e3-7642-801f-e1f18c5fe708/ogranicheniia-testovogo-kontura-wb-api)
- [Журнал изменений](https://dev.wildberries.ru/release-notes)

## Fail-closed matrix

| Контракт                                | Статус       | Поведение                                                               |
| --------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| card bid kopecks                        | `VERIFIED`   | integer wire value отображается 1:1 в internal minor unit               |
| cluster bid unit/minimum/absence/delete | `UNVERIFIED` | чтение сохраняется raw; write/delete блокируются adapter                |
| fullstats money/aggregation             | `UNVERIFIED` | schema-validated observational read; decision normalization не включена |
| current-day coverage                    | `UNVERIFIED` | не используется как realtime spend и блокирует increase                 |
| budget `cash/netting/total` semantics   | `UNVERIFIED` | хранится диагностически и не называется остатком                        |

Deprecated пары централизованы в registry и запрещены source/contract checks. Особенно
запрещён `POST /adv/v1/promotion/adverts`; текущий details endpoint —
`GET /api/advert/v2/adverts`.

## Токен и безопасность хоста

До integration startup локально разбираются `sid`, `exp`, `acc`, `for`, `t`, bitmask `s`,
promotion bit и read-only bit. Поддерживаются:

- `PERSONAL+PROD`: `acc=3`, `for=self`, `t=false`;
- `BASE+PROD`: `acc=1`, без `for`, `t=false`, всегда observe-only;
- `TEST+SANDBOX`: `acc=2`, без `for`, `t=true`;
- mock: только `mock-test-token` и фиксированный synthetic seller.

JWT decode не считается криптографическим подтверждением identity. Доверие появляется только
после успешного авторизованного вызова WB и проверки immutable
`DeploymentAccountBinding`. Service token (`acc=4`) отклоняется.

Production promotion host фиксирован как `https://advert-api.wildberries.ru`, seller identity
host — `https://common-api.wildberries.ru`. Redirect с `Authorization`, userinfo, другой host,
нестандартный port и отключение TLS validation запрещены.

## Квоты и повторные попытки

Limiter имеет общий account bucket и endpoint bucket. Production shared store расположен в
PostgreSQL (`wb_rate_limit_bucket`) и использует transaction advisory lock; in-memory store
допустим только для mock/одной тестовой реплики. Профиль выбирается по token type + environment.
Operator override может только уменьшить rate или burst.

`Retry-After` и `X-Ratelimit-Retry` немедленно замораживают account и endpoint buckets.
`X-Ratelimit-Reset` трактуется только как absolute Unix epoch и применяется при нулевом
remaining. Заголовки не могут автоматически увеличить embedded quota.

Read/verify используют bounded exponential backoff с full jitter. `401`, auth-classified `403`
и истёкший token открывают breaker; `400/422` terminal; `402` — anomaly WB API profile/billing,
а не budget breach кампании; `413` требует bounded split выше adapter; `429` следует server
headers. Write после возможной передачи bytes и transport timeout получает
`WRITE_OUTCOME_UNKNOWN` и не retry-ится до reconciliation.

Production transport использует отдельные границы:

- `WB_API_CONNECT_TIMEOUT_MS` ограничивает установление TCP/TLS через Node HTTP(S) transport;
- `WB_API_TIMEOUT_MS` ограничивает весь HTTP attempt через `AbortSignal`;
- redirect отключён, ответ ограничен 16 MiB;
- write можно классифицировать `TRANSPORT_PRE_BYTE` только если transport доказал, что
  TCP/TLS-соединение ещё не было установлено; во всех остальных transport failure результат
  write считается `UNKNOWN`.

CI поднимает PostgreSQL, применяет полный migration chain и проверяет, что два экземпляра
limiter с одним account key атомарно делят bucket и server-directed freeze.

## Проверка sandbox-контура

Bidder не создаёт token, campaign или budget. Внешний владелец готовит manifest по
`fixtures/sandbox/manifest.example.json` (без credential), затем отдельно инжектирует Test token:

```bash
pnpm run build
SANDBOX_FIXTURE_MANIFEST=/secure/manifest.json \
WB_API_TOKEN='injected-by-secret-manager' \
pnpm run smoke:sandbox
```

Read-only smoke проверяет scope, details, minimum bids и fullstats schemas. Обратимый canary
выполняется только при наличии `writeCanary` и отдельного
`SANDBOX_WRITE_CONFIRMATION=I_UNDERSTAND_SANDBOX_WRITES`; baseline обязан совпасть с manifest,
а `finally` выполняет rollback и bounded read-after-write. Redacted evidence по умолчанию
записывается в `artifacts/sandbox-smoke-evidence.json`; token и response payload туда не входят.
