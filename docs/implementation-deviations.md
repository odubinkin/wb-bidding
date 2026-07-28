# Расхождения реализации и внешние ограничения проверки

## Функциональные расхождения

### Verified mock cluster profile

ТЗ требует положительные mock-only сценарии для manual CPM cluster и `DELETE`/`ABSENT`
(E2E-24 и E2E-49). HTTP mock реализует соответствующие synthetic endpoints, но общий WB adapter,
Data Sync capability и write executor используют production endpoint profile, где cluster
unit/minimum/absence/delete contract обоснованно `UNVERIFIED`. Отдельный immutable verified
mock profile и cluster executor не реализованы.

Текущее отличие: cluster targets всегда `OBSERVE_ONLY`; POST/DELETE не исходят. Причина
production-ограничения — отсутствие воспроизводимого официального/sandbox evidence. Эта причина
не отменяет требования отдельного synthetic mock profile, поэтому расхождение является
функциональным release blocker, а не waiver.

### Топология функциональных E2E

ТЗ формулирует все 51 сценарий как проходящие через `docker-compose.mock.yml`. Реализация
запускает Compose build/health/readiness/HTTP smoke отдельно, а функциональные suites используют
те же приложения с in-process HTTP mock и временными PostgreSQL databases. Причина — изоляция,
точная fault injection и быстрый deterministic teardown; локальная среда также не имела Docker
daemon. Поведение card full-cycle доказано, но буквальная топология требования отличается.

### Неподтверждённые production-контракты

Неподтверждённые контракты не заменены предположениями:

- cluster unit/minimum/absence/write/delete остаются `UNVERIFIED`, поэтому cluster automation
  работает только observation-only;
- fullstats money/aggregation и same-day reporting lag остаются `UNVERIFIED`; данные сохраняются,
  но production increase закрыт;
- budget fields сохраняются диагностически и не называются остатком.

Это требуемое fail-closed поведение ТЗ. Для production-включения нужен новый pinned profile, официальный
source, воспроизводимые fixtures и подписанный release-owner evidence report.

Corporate identity provider не выбран владельцем продукта. Реализован предусмотренный ТЗ
промежуточный service-token boundary: permissions, constant-time comparison, private-network
deployment assumptions, audit actor и redaction. Замена provider должна сохранить permissions и
audit contract.

## Внешние незакрытые gates

На дату документа отсутствуют предоставленные пользователем:

1. внешний sandbox fixture manifest и Test credential для обязательного smoke;
2. зафиксированное владельцем продукта решение о production writes и пунктах раздела 30;
3. подписанный release-owner evidence report для переходов `UNVERIFIED → VERIFIED`.

Код harness и команды готовы, но эти результаты нельзя изготовить синтетически или считать
пройденными без внешнего evidence.

## Ограничение локальной среды

Локальный Docker CLI доступен, но daemon во время разработки был недоступен. Compose-файлы и
non-root images проверяются статически, workspace собирается, built entrypoints проходят smoke
с реальным локальным PostgreSQL и HTTP mock. Docker build/Compose runtime и container scan
остаются обязательными CI/release gates; отличие относится к среде верификации, а не к поведению.

## Вывод о готовности

Система не может быть объявлена полностью production-ready до устранения verified mock cluster
расхождения, зелёного Compose runtime/CI evidence, sandbox smoke и решений product/API release
owners. Все остальные известные расхождения перечислены выше; скрытых waivers документ не вводит.
