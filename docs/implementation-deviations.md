# Расхождения реализации и внешние ограничения проверки

## Функциональные расхождения

Известных расхождений с требуемым поведением ТЗ нет. Immutable `verified-mock` cluster profile
фиксирует minor unit, minimum, quantum, `EXPLICIT|ABSENT`, delete effect и checksum/version; он
разрешён только для loopback/`wb-mock` origin и не изменяет production/sandbox profile.

### Топология функциональных E2E

ТЗ буквально требует запускать все 51 сценарий через `docker-compose.mock.yml`. Реализация
проверяет Compose build, health, readiness и HTTP smoke в контейнерах, а функциональные suites
запускает с теми же приложениями, in-process HTTP mock и временными PostgreSQL databases. Это
сознательное отличие тестовой топологии для точной fault injection и deterministic teardown, а
не отличие пользовательского поведения. Docker Compose smoke сейчас проходит; отличие остаётся
только в буквальном способе запуска 51 функционального сценария.

### Неподтверждённые production-контракты

- production cluster unit/minimum/absence/write/delete остаются `UNVERIFIED`, поэтому cluster
  automation fail-closed и observation-only; manual CPM cluster `APPLY` разрешён только в
  изолированном verified-mock profile;
- fullstats money/aggregation и same-day reporting lag остаются `UNVERIFIED`; данные сохраняются,
  но production increase закрыт;
- budget fields сохраняются диагностически и не называются остатком.

Это требуемое fail-closed поведение ТЗ. Для production-включения нужны новый pinned profile,
официальный source, воспроизводимые fixtures и подписанный API release-owner evidence report.

Corporate identity provider не выбран. Реализован предусмотренный ТЗ service-token boundary:
permissions, constant-time comparison, private-network assumptions, audit actor и redaction.

## Закрытые локальные gates (2026-07-30)

- полный `pnpm audit --audit-level=high` и production audit проходят без известных уязвимостей;
- оба non-root Docker image собраны; `pnpm run smoke:compose` прошёл для mock-only и full-mock;
- Trivy 0.69.3 с pinned image digest не нашёл HIGH/CRITICAL уязвимостей в обоих runtime images;
- `docker compose config --quiet` прошёл для production, full-mock и mock-only topology.

Ненужные npm/corepack из final runtime stages удалены, так как первоначальный Trivy scan нашёл
уязвимости именно в этих неиспользуемых global packages. Build stages остаются неизменны.

## Внешние незакрытые gates и вынужденные расхождения

1. **DoD 31.4 — обязательный WB sandbox smoke не выполнен.** Пользователь подтвердил, что
   sandbox credentials не существуют и предоставлены не будут. Поэтому нет manifest/Test token и
   нельзя честно выполнить `smoke:sandbox`. Это вынужденное материальное расхождение с буквальным
   DoD, а не waiver: production writes остаются выключены, и release нельзя маркировать как
   полностью соответствующий пункту 31.
2. **DoD 31.3 — нет hosted CI run.** По указанию пользователя GitHub не используется, потому что
   проект ещё не опубликован. Полный локальный CI-equivalent набор выполнен, но зелёный run
   внешнего CI и immutable release artifact отсутствуют; их нельзя подменять локальным выводом.
3. **DoD 31.10 и раздел 30 — нет зафиксированного product-owner/API release-owner решения.**
   Значение по умолчанию `WB_API_WRITE_ENABLED=false` остаётся обязательным. Никто не должен
   включать production writes или переводить `UNVERIFIED → VERIFIED` до документированного решения
   владельца продукта и отдельного evidence report владельца API.

Harness и команды готовы, однако указанные результаты нельзя изготовить синтетически или считать
пройденными без внешнего evidence.

## Вывод о готовности

Реализованная система безопасна для локального и production-like observe-only запуска: локальные
runtime, security и функциональные проверки зелёные, а небезопасные пути fail-closed. Полный
production release по буквальному разделу 31 пока **не сертифицируется** из-за трёх внешних gates
выше. Этот документ фиксирует все известные вынужденные расхождения; скрытых waivers нет.
