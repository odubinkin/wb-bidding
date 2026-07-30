# ADR-0001: Fail-closed для неподтверждённых WB-контрактов

Статус: принят. Дата: 2026-07-28.

## Как читать ADR

ADR (Architecture Decision Record) фиксирует одно значимое архитектурное решение: контекст,
выбранное правило и его последствия. Это не инструкция по запуску. Если термины WB API, ставка,
placement или fail-closed пока незнакомы, сначала прочитайте [путеводитель](../project-guide.md)
и [интеграцию с WB API](../wb-api-integration.md). Здесь «неподтверждённый» означает, что
команда не располагает достаточным официальным и воспроизводимым доказательством точной HTTP
семантики; это не оценка качества WB.

## Контекст

Документация WB не всегда полностью определяет денежную единицу, absence/delete semantics,
агрегацию parent/child rows и максимальный reporting lag. Ошибка в предположении может изменить
реальную ставку или нарушить лимит расхода.

## Решение

Каждый wire contract имеет versioned статус `VERIFIED`, `UNVERIFIED` или `DEPRECATED`.
`UNVERIFIED` разрешает schema-validated diagnostic read, но не нормализацию в денежное решение и
не write capability. Изменение fixture/profile checksum снова закрывает capability. Перевод в
`VERIFIED` требует release-owner evidence report с официальными источниками и воспроизводимым
read/write proof.

## Последствия

Card bid в копейках доступен после всех runtime gates. Cluster write/delete закрыты.
`fullstats` сохраняется как observational source, а повышение закрыто при неподтверждённом
same-day spend. Это уменьшает функциональный охват, но соответствует safety contract ТЗ и
исключает неявное угадывание денежных semantics.
