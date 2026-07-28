# Безопасность

Deployment self-hosted и рассчитан на один WB seller account. Реальные credentials не должны
попадать в git, image layers, Swagger examples, audit, metrics или request logs.

## Секреты и доступ

- `WB_API_TOKEN`, `ADMIN_API_SERVICE_TOKEN`, пароль БД подаются secret manager/runtime injection.
- Admin API и Swagger защищены constant-time bearer validation и permissions.
- Token выводится только в irreversible fingerprint; payload/header redaction выполняется до log
  и persistence boundaries.
- Production принимает только официальный HTTPS host, запрещает redirect, userinfo,
  нестандартный port и перенос `Authorization` на другой origin.
- JWT claims проверяют environment/type/category/read-only/expiry; identity подтверждается
  authorized WB call и singleton binding.

## Защита записей

Production write по умолчанию выключен. Один `WB_API_WRITE_ENABLED=true` недостаточен:
необходимы Personal token, explicit production confirmation, verified contract/capability,
account binding, fresh integration/capacity, active APPLY policy, automation и выключенный global
kill. Cluster write/delete и increase при неподтверждённом соответствующем контракте fail closed.

## Supply chain и CI

Dependencies устанавливаются по `pnpm-lock.yaml` с `--frozen-lockfile`. CI выполняет dependency
audit, secret scan и Trivy scan собранных non-root images. Локально:

```bash
pnpm run security:secrets
pnpm run security:container
pnpm run security:scan
```

Последняя команда обращается к registry advisory service и требует отдельно разрешённой сети.
Найденная high/critical уязвимость блокирует release до обновления или документированного
security exception владельца риска.
