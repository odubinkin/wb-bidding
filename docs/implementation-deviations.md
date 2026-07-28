# Расхождения реализации и внешние ограничения проверки

## Функциональные расхождения

Известных функциональных расхождений с описанным поведением ТЗ после реализации отдельного
immutable `verified-mock` cluster profile не осталось. Synthetic contract фиксирует minor unit,
minimum, quantum, `EXPLICIT|ABSENT`, delete effect и checksum/version; он разрешён адаптером
только для loopback/`wb-mock` HTTP origin. Production/sandbox profile от этого не меняется.

### Топология функциональных E2E

ТЗ формулирует все 51 сценарий как проходящие через `docker-compose.mock.yml`. Реализация
запускает Compose build/health/readiness/HTTP smoke отдельно, а функциональные suites используют
те же приложения с in-process HTTP mock и временными PostgreSQL databases. Причина — изоляция,
точная fault injection и быстрый deterministic teardown; локальная среда также не имела Docker
daemon. Поведение card full-cycle доказано, но буквальная топология требования отличается.

### Неподтверждённые production-контракты

Неподтверждённые контракты не заменены предположениями:

- production cluster unit/minimum/absence/write/delete остаются `UNVERIFIED`, поэтому production
  cluster automation работает только observation-only; manual CPM cluster `APPLY` реализован
  только в изолированном verified mock profile;
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

Полный dependency audit обнаружил high advisory `brace-expansion` только в dev-графе
ESLint/Testcontainers. Эти пакеты не входят в результат `pnpm deploy --prod`; production-граф
локально очищен от найденных vulnerable `lodash`/`js-yaml` удалением неиспользуемого
`@nestjs/config` и совместимым pinned override, подтверждённым quality/OpenAPI/build/built-smoke.
Закрытие all-dependencies audit требует обновления родительских dev tools через registry и остаётся
CI/tooling gate; исключение advisory или скрытый waiver не добавлялись.

## Вывод о готовности

Локально реализованное поведение соответствует ТЗ, включая E2E-24 и E2E-49. Release всё ещё
нельзя объявить полностью production-ready без зелёного Compose runtime/CI evidence, sandbox
smoke и решений product/API release owners. Оставшиеся ограничения являются внешними gates или
буквальным отличием тестовой топологии, перечисленным выше; скрытых waivers документ не вводит.
