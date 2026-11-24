# Trazabilidad de entregas

Registro de lo trabajado, su ubicación en el código y su estado de verificación.

## 2026-11-23 — Auth, guards e importador del Excel INE

**Rama:** `feat/auth-importerExcel`

| Requerimiento | Implementación | Ubicación |
|---|---|---|
| Autenticación con JWT en cookie HttpOnly | Login, refresh, logout, `me` y `csrf` | `src/modules/auth/auth.controller.ts`, `auth.service.ts` |
| Hash de contraseñas | Argon2id | `src/modules/auth/auth.service.ts` |
| Refresh rotativo con detección de reutilización | Hash SHA-256 del token; la reutilización revoca las sesiones del usuario | `auth.service.ts`, modelo `SesionAutenticacion` |
| Autorización global por defecto | Guards JWT, CSRF y roles; `@Public`, `@SkipCsrf`, `@Autorizado` | `src/modules/auth/guards`, `decorators` |
| Auditoría con IP | Campo IP en eventos; login, refresh y logout auditados | `prisma/migrations/20261124030000_auth_sessions` |
| Errores RFC 7807 | Filtro global | `src/common/http/problem-details.filter.ts` |
| Variables de auth | Claves añadidas a `.env.example` | `.env.example` |
| Importador del catálogo INE | CLI `npm run import:ine -- --archivo <ruta.xlsx>`, staging, hash idempotente, validaciones | `src/modules/referencias-ine/`, `src/scripts/importar-referencias-ine.ts` |
| Normalización | Alias, fechas, `DECIMAL(14,3)`, las dos columnas `Modalidad` conservadas | `normalizador-ine.ts` |

### Verificación
- `npm run build`, `npm test` (7 pruebas), `npm run lint` y `git diff --check` pasan. Antes de esta entrega también se ejecutaron `npm run test:e2e` (2 pruebas) y `prisma validate`.
- El importador procesó las 7,788 filas del libro oficial con un adaptador de persistencia simulado.

### Pendiente
- Aplicar la migración e importar contra un PostgreSQL real (`npm run db:migrate:deploy`); no se pudo probar sin Docker/PostgreSQL.
- `npm audit`: 2 vulnerabilidades moderadas transitivas (`exceljs` → `uuid`). La corrección automática implica un downgrade incompatible y no se aplicó.
- Autorización por propietario, registro, verificación de correo e invitaciones.
