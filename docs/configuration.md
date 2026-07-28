# Конфигурация deployment

Все значения читаются только при старте и валидируются типизированной схемой. Некорректная
переменная останавливает запуск без вывода секретного значения. В production секреты передаются
через secret manager/runtime injection, а не через сохранённый `.env`. Изменение расписания не
меняет SLA и safety-инварианты: если capacity/freshness gates не доказаны, режим `APPLY` закрыт.

В колонке «секрет» `да` означает обязательное секретное хранение, `содержит` — строка содержит
секретную часть, `нет` — значение допустимо документировать. Cron имеет шесть полей, включая
секунды.

## Приложение и аккаунт

| Переменная                | Тип; default; диапазон                        |   Секрет | Влияние изменения                                                                              |
| ------------------------- | --------------------------------------------- | -------: | ---------------------------------------------------------------------------------------------- |
| `ACCOUNT_CURRENCY`        | ISO 4217 со scale 2; обязательна              |      нет | При первом binding фиксируется в БД; последующее отличие останавливает startup.                |
| `ACCOUNT_TIMEZONE`        | IANA timezone; обязательна                    |      нет | Фиксируется в binding; определяет календарные дни и DST.                                       |
| `ADMIN_API_SERVICE_TOKEN` | строка ≥32; обязательна, placeholder запрещён |       да | Защищает `/api/v1`, `/docs`, `/docs-json`; ротация требует согласованного обновления клиентов. |
| `DATABASE_URL`            | PostgreSQL URL; обязательна                   | содержит | Выбирает единственную production-БД; смена может означать другой account binding.              |
| `POSTGRES_PASSWORD`       | строка; обязательна для Compose               |       да | Пароль контейнера PostgreSQL; приложение получает его только внутри `DATABASE_URL`.            |
| `PORT`                    | integer; `3000`; `1..65535`                   |      нет | Порт HTTP bidder/mock процесса.                                                                |
| `LOG_LEVEL`               | pino level; `info`                            |      нет | Меняет детализацию JSON-логов; секреты всё равно redacted.                                     |
| `LOG_FORMAT`              | literal `json`; `json`                        |      нет | Production logs остаются структурированными.                                                   |
| `METRICS_ENABLED`         | boolean; `false` в схеме, `true` в example    |      нет | Включает Prometheus endpoint и сбор метрик.                                                    |
| `SCHEDULER_ENABLED`       | boolean; `false` в схеме, `true` в example    |      нет | Регистрирует jobs; `false` оставляет API/readiness без фонового выполнения.                    |

## Sync, evidence и расписания

| Переменная                              | Тип; default; диапазон                 | Секрет | Влияние изменения                                                         |
| --------------------------------------- | -------------------------------------- | -----: | ------------------------------------------------------------------------- |
| `CURRENT_STATE_SYNC_CRON`               | cron; `5 */15 * * * *`                 |    нет | Частота короткого current-state sync.                                     |
| `CURRENT_STATE_SYNC_RUN_DEADLINE_MS`    | integer ms; `600000`; `1000..86400000` |    нет | Deadline run; должен быть меньше простого cron-интервала.                 |
| `CURRENT_STATE_TARGET_SYNC_SLA_MINUTES` | integer min; `20`; `1..1440`           |    нет | Максимальный полный обход current bids; не выше freshness.                |
| `CURRENT_BID_FRESHNESS_MINUTES`         | integer min; `20`; `1..1440`           |    нет | Более старое состояние блокирует расчёт/write.                            |
| `DATA_SYNC_CRON`                        | cron; `25 */30 * * * *`                |    нет | Частота медленного data sync.                                             |
| `DECISION_CRON`                         | cron; `45 */30 * * * *`                |    нет | Частота расчёта решений только из БД.                                     |
| `CAMPAIGN_APPLY_CRON`                   | cron; `*/10 * * * * *`                 |    нет | Частота lease/dispatch очереди.                                           |
| `MINIMUM_BID_TARGET_SYNC_SLA_MINUTES`   | integer min; `720`; `1..43200`         |    нет | SLA полного обхода minimum bids.                                          |
| `MINIMUM_BID_FRESHNESS_MINUTES`         | integer min; `720`; `1..43200`         |    нет | Старый verified minimum блокирует write.                                  |
| `SYNC_PAGE_SIZE`                        | integer; `500`; `1..5000`              |    нет | Верхняя граница одной DB-страницы sync.                                   |
| `BID_STATE_MAX_OBSERVATION_GAP_MINUTES` | integer min; `20`; `1..1440`           |    нет | Больший gap исключает статистический день; не выше current-bid freshness. |
| `DAY_FINALIZATION_MIN_STABLE_READS`     | integer; `2`; `2..100`                 |    нет | Число одинаковых source reads для finalized day.                          |
| `DAY_FINALIZATION_MIN_STABLE_MINUTES`   | integer min; `60`; `0..10080`          |    нет | Минимальный интервал между reads финализации.                             |
| `CONVERSION_LAG_DAYS`                   | integer days; `1`; `0..30`             |    нет | Исключает незавершённую атрибуцию из evidence.                            |
| `EXTERNAL_WRITE_CONTROL_MODE`           | `EXCLUSIVE\|SHARED`; `SHARED`          |    нет | Определяет допустимость historical coverage при внешних изменениях.       |

## Verification, reconciliation и retention

| Переменная                               | Тип; default; диапазон                  | Секрет | Влияние изменения                                                             |
| ---------------------------------------- | --------------------------------------- | -----: | ----------------------------------------------------------------------------- |
| `VERIFICATION_POLL_INTERVAL_MS`          | integer ms; `30000`; `1000..3600000`    |    нет | Интервал проверки принятого WB write.                                         |
| `RECONCILIATION_CRON`                    | cron; `15 * * * * *`                    |    нет | Восстановление lease/crash windows и UNKNOWN.                                 |
| `BID_VERIFICATION_INITIAL_DELAY_MS`      | integer ms; `30000`; `30000..3600000`   |    нет | Запрещает read до propagation window.                                         |
| `BID_VERIFICATION_TIMEOUT_MS`            | integer ms; `600000`; `60000..86400000` |    нет | Общий deadline verification/reconciliation.                                   |
| `RECONCILIATION_STABLE_OLD_STATE_READS`  | integer; `2`; `2..10`                   |    нет | Требуемые разделённые reads старого состояния до повторного write.            |
| `RECONCILIATION_STABLE_READ_INTERVAL_MS` | integer ms; `30000`; `1000..3600000`    |    нет | Минимальный интервал между stable reads.                                      |
| `RECONCILIATION_MAX_WRITE_ATTEMPTS`      | integer; `2`; `1..10`                   |    нет | Верхняя граница фактических dispatch одного решения.                          |
| `WB_WRITE_PRE_BYTE_MAX_RETRIES`          | integer; `1`; `0..1`                    |    нет | Повторы только при доказанной непередаче ни одного byte и в том же attempt.   |
| `PRE_WRITE_STATE_MAX_AGE_MS`             | integer ms; `10000`; `1000..60000`      |    нет | DB отклоняет `DISPATCHING`, если live-read старше этого окна.                 |
| `MAX_DECISION_AGE_MINUTES`               | integer min; `60`; `1..10080`           |    нет | Более старое решение не отправляется после восстановления.                    |
| `WB_WRITE_ATTEMPT_RETENTION_DAYS`        | integer days; `30`; `1..3650`           |    нет | Retention завершённых detail records; обязан превышать reconciliation window. |

## WB API

| Переменная                             | Тип; default; диапазон                                 | Секрет | Влияние изменения                                                            |
| -------------------------------------- | ------------------------------------------------------ | -----: | ---------------------------------------------------------------------------- |
| `WB_API_MODE`                          | `mock\|sandbox\|prod`; `mock` в схеме                  |    нет | Выбирает environment и допустимый token profile.                             |
| `WB_API_PROD_BASE_URL`                 | URL; официальный `https://advert-api.wildberries.ru`   |    нет | В prod другой origin, port, credentials или HTTP останавливают startup.      |
| `WB_API_SANDBOX_BASE_URL`              | URL; `https://advert-api-sandbox.wildberries.ru`       |    нет | Sandbox origin; разрешён только TEST profile.                                |
| `WB_API_MOCK_BASE_URL`                 | URL; `http://wb-mock:3001`                             |    нет | Адрес детерминированного mock.                                               |
| `WB_API_CONNECT_TIMEOUT_MS`            | integer ms; `2000`; `100..60000`                       |    нет | Connect deadline транспорта.                                                 |
| `WB_API_TIMEOUT_MS`                    | integer ms; `15000`; `100..120000`                     |    нет | Deadline одной HTTP-попытки.                                                 |
| `WB_API_GLOBAL_RATE_LIMIT_REQUESTS`    | integer; `5`; `1..1000`                                |    нет | Account-wide requests на interval.                                           |
| `WB_API_GLOBAL_RATE_LIMIT_INTERVAL_MS` | integer ms; `1000`; `1..60000`                         |    нет | Account-wide limiter interval.                                               |
| `WB_API_GLOBAL_RATE_LIMIT_BURST`       | integer; `5`; `1..1000`                                |    нет | Максимальный burst; endpoint profile может быть строже.                      |
| `WB_API_RATE_LIMITS_JSON`              | JSON object; `{}`                                      |    нет | Разрешает только более строгие endpoint overrides.                           |
| `WB_API_MAX_IN_FLIGHT`                 | integer; `5`; `1..100`                                 |    нет | Account-wide одновременные WB запросы.                                       |
| `WB_READ_MAX_ATTEMPTS`                 | integer; `3`; `1..10`                                  |    нет | Максимум transport attempts обычного read.                                   |
| `WB_READ_RETRY_BASE_MS`                | integer ms; `250`; `1..60000`                          |    нет | Начальный exponential backoff; не выше cap.                                  |
| `WB_READ_RETRY_CAP_MS`                 | integer ms; `5000`; `1..120000`                        |    нет | Верхняя граница read backoff.                                                |
| `WB_VERIFY_HTTP_MAX_ATTEMPTS`          | integer; `2`; `1..10`                                  |    нет | Transport attempts одного verification poll.                                 |
| `WB_TOKEN_EXPIRY_WARN_DAYS`            | integer days; `14`; `1..365`                           |    нет | Окно warning до `exp`; истёкший token закрывает интеграцию.                  |
| `WB_API_TOKEN`                         | непустая строка; обязательна                           |     да | Единственный WB credential; никогда не сохраняется в БД/логах/audit.         |
| `WB_EXPECTED_TOKEN_TYPE`               | `PERSONAL\|TEST\|BASE`; обязательна                    |    нет | Проверяется против claims/environment; BASE принудительно read-only.         |
| `WB_API_WRITE_ENABLED`                 | boolean; `false`                                       |    нет | Один из write gates; сам по себе не включает `APPLY`.                        |
| `WB_PRODUCTION_WRITE_CONFIRMATION`     | пусто; для prod write literal `I_UNDERSTAND_WB_WRITES` |    нет | Второй явный prod write gate.                                                |
| `WB_ENDPOINT_PROFILE_VERSION`          | embedded ID; обязательна                               |    нет | Выбирает pinned contract/checksum; неизвестная версия останавливает startup. |

## Детерминированный mock

| Переменная          | Тип; default; диапазон         | Секрет | Влияние изменения                           |
| ------------------- | ------------------------------ | -----: | ------------------------------------------- |
| `MOCK_CLOCK_MODE`   | literal `virtual`; `virtual`   |    нет | Запрещает зависимость CI/E2E от wall clock. |
| `MOCK_INITIAL_TIME` | RFC 3339 с offset; обязательна |    нет | Начальный instant виртуальных данных.       |
| `MOCK_SEED`         | непустая строка; обязательна   |    нет | Выбирает воспроизводимый сценарий.          |

Алгоритмические thresholds не задаются env: они находятся в immutable `BiddingPolicy`. Значения
из `.env.example` безопасны только как шаблон; `replace-*` и `missing-token` намеренно отклоняются
для внешнего WB environment.
