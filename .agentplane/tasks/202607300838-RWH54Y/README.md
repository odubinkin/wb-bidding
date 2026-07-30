---
id: "202607300838-RWH54Y"
title: "Explain every data model table and column"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 9
origin:
  system: "manual"
depends_on: []
tags:
  - "docs"
verify: []
plan_approval:
  state: "approved"
  updated_at: "2026-07-30T08:38:30.333Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-07-30T08:42:27.133Z"
  updated_by: "CODER"
  note: "Модель данных дополнена построчным справочником: назначение, источник, жизненный цикл и применение объяснены для всех таблиц и хранимых Prisma-колонок."
  attempts: 0
commit: null
comments:
  -
    author: "CODER"
    body: "Start: расширяю описание каждой таблицы и каждого столбца модели данных по утверждённой Prisma-схеме."
events:
  -
    type: "status"
    at: "2026-07-30T08:38:37.353Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: расширяю описание каждой таблицы и каждого столбца модели данных по утверждённой Prisma-схеме."
  -
    type: "verify"
    at: "2026-07-30T08:42:27.133Z"
    author: "CODER"
    state: "ok"
    note: "Модель данных дополнена построчным справочником: назначение, источник, жизненный цикл и применение объяснены для всех таблиц и хранимых Prisma-колонок."
doc_version: 3
doc_updated_at: "2026-07-30T08:42:27.203Z"
doc_updated_by: "CODER"
description: "Expand the Russian data model documentation with concrete purpose, lifecycle, source and use of every Prisma table and field, without changing the schema."
sections:
  Summary: |-
    Explain every data model table and column

    Expand the Russian data model documentation with concrete purpose, lifecycle, source and use of every Prisma table and field, without changing the schema.
  Scope: "Включено: docs/data-model.md и scripts/verify-docs.mjs, а также task artifacts. Исключено: prisma/schema.prisma, миграции, рабочий код, API-контракты и реальные данные."
  Plan: |-
    1. Сверить все 28 Prisma-моделей и их поля с текущим data-model.md.
    2. Для каждой таблицы описать роль, владельца/источник, жизненный цикл, связи и последствия ошибок или устаревания.
    3. Добавить таблицы полей с конкретным смыслом, заполнением и потребителями каждого столбца, не дублируя исходную Prisma-схему.
    4. Расширить docs:check, чтобы ключевые таблицы полей и вводные объяснения не исчезли.
    5. Выполнить форматирование и проверки документации, policy и AgentPlane.
  Verify Steps: |-
    1. pnpm exec prettier --check docs/data-model.md scripts/verify-docs.mjs.
    2. pnpm run docs:check.
    3. node .agentplane/policy/check-routing.mjs.
    4. ap doctor.
    5. Сверить названия моделей и полей документации с prisma/schema.prisma; выполнить git diff --check и git status --short --untracked-files=all.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    ### 2026-07-30T08:42:27.133Z — VERIFY — ok

    By: CODER

    Note: Модель данных дополнена построчным справочником: назначение, источник, жизненный цикл и применение объяснены для всех таблиц и хранимых Prisma-колонок.
    Attempts: 0

    VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-30T08:38:37.353Z, excerpt_hash=sha256:c554207a9c73b28f1b206f4ed825a1bce4a9661c70d833adbab65325c0320de4

    Details:

    BlueprintSnapshotRef:
    - state: current
    - path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607300838-RWH54Y/blueprint/resolved-snapshot.json
    - old_digest: e50c6e89ef2cae82a795c8cc937dd171bcc65c9f4a2e9538b30794184244526e
    - current_digest: e50c6e89ef2cae82a795c8cc937dd171bcc65c9f4a2e9538b30794184244526e
    - route_changed: no
    - safe_command: agentplane blueprint snapshot 202607300838-RWH54Y

    DecisionContextRef:
    - operator_action: run_exact_argv
    - can_execute_now: true
    - safe_command: agentplane task verify-show 202607300838-RWH54Y
    - diagnostic_command: none
    - source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
    - freshness: route=computed_local remote=remote_skipped
    - repeat_allowed: true
    - repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
    - risks: none

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: "Откатить только коммиты этой задачи; документация и проверка вернутся к предыдущей версии. Схема PostgreSQL, миграции и данные не меняются."
  Findings: |-
    Пользователь подтвердил, что текущая группировка полей недостаточна. Цель — объяснить назначение каждой таблицы и каждого Prisma-столбца на русском языке, опираясь только на локальную схему и реализацию.

    - Observation: Command: node schema-to-documentation coverage check; pnpm run docs:check; pnpm exec prettier --check docs/data-model.md scripts/verify-docs.mjs; node .agentplane/policy/check-routing.mjs; ap doctor; git diff --check. Result: pass. Evidence: 28 моделей и все хранимые колонки найдены в справочнике; 23 обязательных документа и все ссылки проверены. Scope: docs/data-model.md, scripts/verify-docs.mjs.
      Impact: Читатель получает объяснение бизнес-смысла полей и их роли в синхронизации, расчёте, очереди, записи, аудите и эксплуатации, а не только список имён.
      Resolution: Добавлен построчный справочник с таблицами полей и автоматический контроль наличия описания всех Prisma-моделей.
id_source: "generated"
---
## Summary

Explain every data model table and column

Expand the Russian data model documentation with concrete purpose, lifecycle, source and use of every Prisma table and field, without changing the schema.

## Scope

Включено: docs/data-model.md и scripts/verify-docs.mjs, а также task artifacts. Исключено: prisma/schema.prisma, миграции, рабочий код, API-контракты и реальные данные.

## Plan

1. Сверить все 28 Prisma-моделей и их поля с текущим data-model.md.
2. Для каждой таблицы описать роль, владельца/источник, жизненный цикл, связи и последствия ошибок или устаревания.
3. Добавить таблицы полей с конкретным смыслом, заполнением и потребителями каждого столбца, не дублируя исходную Prisma-схему.
4. Расширить docs:check, чтобы ключевые таблицы полей и вводные объяснения не исчезли.
5. Выполнить форматирование и проверки документации, policy и AgentPlane.

## Verify Steps

1. pnpm exec prettier --check docs/data-model.md scripts/verify-docs.mjs.
2. pnpm run docs:check.
3. node .agentplane/policy/check-routing.mjs.
4. ap doctor.
5. Сверить названия моделей и полей документации с prisma/schema.prisma; выполнить git diff --check и git status --short --untracked-files=all.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
### 2026-07-30T08:42:27.133Z — VERIFY — ok

By: CODER

Note: Модель данных дополнена построчным справочником: назначение, источник, жизненный цикл и применение объяснены для всех таблиц и хранимых Prisma-колонок.
Attempts: 0

VerifyStepsRef: doc_version=3, doc_updated_at=2026-07-30T08:38:37.353Z, excerpt_hash=sha256:c554207a9c73b28f1b206f4ed825a1bce4a9661c70d833adbab65325c0320de4

Details:

BlueprintSnapshotRef:
- state: current
- path: /Users/odubinkin/Projects/wb-bidding/.agentplane/tasks/202607300838-RWH54Y/blueprint/resolved-snapshot.json
- old_digest: e50c6e89ef2cae82a795c8cc937dd171bcc65c9f4a2e9538b30794184244526e
- current_digest: e50c6e89ef2cae82a795c8cc937dd171bcc65c9f4a2e9538b30794184244526e
- route_changed: no
- safe_command: agentplane blueprint snapshot 202607300838-RWH54Y

DecisionContextRef:
- operator_action: run_exact_argv
- can_execute_now: true
- safe_command: agentplane task verify-show 202607300838-RWH54Y
- diagnostic_command: none
- source_of_truth: route=task_next_action diagnostic=task_next_action remote=not_checked
- freshness: route=computed_local remote=remote_skipped
- repeat_allowed: true
- repeat_stop_condition: after any non-zero exit or completed mutation, recompute task next-action before a second step
- risks: none

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

Откатить только коммиты этой задачи; документация и проверка вернутся к предыдущей версии. Схема PostgreSQL, миграции и данные не меняются.

## Findings

Пользователь подтвердил, что текущая группировка полей недостаточна. Цель — объяснить назначение каждой таблицы и каждого Prisma-столбца на русском языке, опираясь только на локальную схему и реализацию.

- Observation: Command: node schema-to-documentation coverage check; pnpm run docs:check; pnpm exec prettier --check docs/data-model.md scripts/verify-docs.mjs; node .agentplane/policy/check-routing.mjs; ap doctor; git diff --check. Result: pass. Evidence: 28 моделей и все хранимые колонки найдены в справочнике; 23 обязательных документа и все ссылки проверены. Scope: docs/data-model.md, scripts/verify-docs.mjs.
  Impact: Читатель получает объяснение бизнес-смысла полей и их роли в синхронизации, расчёте, очереди, записи, аудите и эксплуатации, а не только список имён.
  Resolution: Добавлен построчный справочник с таблицами полей и автоматический контроль наличия описания всех Prisma-моделей.
