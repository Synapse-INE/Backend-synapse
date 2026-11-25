# Trazabilidad de entregas

Registro de las funcionalidades integradas, su ubicación y las validaciones pendientes.

## Sesiones, autorización e importador del catálogo INE

| Requerimiento | Implementación | Ubicación |
|---|---|---|
| Autenticación de navegador | Inicio/cierre de sesión, sesión opaca en cookie HttpOnly y consulta del usuario autenticado | `src/modules/auth/`, `src/common/auth/` |
| Protección de credenciales | Verificación de contraseñas con Argon2id y respuesta genérica ante credenciales no válidas | `src/modules/auth/auth.service.ts` |
| Sesiones y CSRF | Persistencia de hashes, expiración y revocación; renovación del token CSRF | `prisma/schema.prisma`, `prisma/migrations/20261124030000_identity_access_sessions/` |
| Autorización | Guard de sesión, guard de roles y helper de propiedad con denegación por defecto | `src/modules/auth/auth.guard.ts`, `src/common/auth/` |
| Importación INE | Comando CLI, validación de extensión, firma y tamaño, hash idempotente y lotes de staging | `src/scripts/importar-referencias-ine.ts`, `src/modules/referencias-ine/` |
| Normalización de datos | Conservación de filas originales, modalidades repetidas, alias y campos normalizados | `src/modules/referencias-ine/normalizador-ine.ts` |

### Verificación

Pasaron `npm run build`, `npm test` (41 pruebas), `npm run test:e2e` (4 pruebas), `npm run lint`, `npx prisma validate` y `git diff --check`. La prueba del importador genera un libro XLSX temporal y comprueba la conservación de las doce columnas fuente, incluidos los dos encabezados `Modalidad`; el fixture no depende de archivos en rutas locales.

### Pendiente

- Ejecutar la migración y el importador en un PostgreSQL de aceptación; el entorno de desarrollo no se considera validación de despliegue.
- Completar registro, verificación de correo, invitaciones, revisión administrativa y endpoints de solicitudes.
- Aplicar controles de rol y propiedad en cada operación de negocio y cubrirlos con pruebas de integración.

## 2026-11-24 — Alineación tras la integración de #4 y #5

**Rama:** `fix/auth-docs-alineacion`

- Al fusionar `feat/auth-importerExcel` con `jrealiquez` prevaleció la auth de sesiones opacas (`SesionUsuario`, CSRF por sesión, `TRUSTED_PROXY_CIDRS`). La auth de la rama original (JWT con refresh rotativo, filtro RFC 7807 e IP en auditoría) no se conservó; el importador INE sí.
- Corregido un rechazo no manejado en `auth.service.spec.ts` (ambas promesas se esperan ahora con `Promise.allSettled`).
- README: añadidas instrucciones de instalación y nota sobre el cambio de nombre de la migración de sesiones.
- Pendiente de decisión: reincorporar IP en auditoría y respuestas RFC 7807 con `code` estable sobre la auth actual.

## 2026-11-24 — Validación contra PostgreSQL real

**Rama:** `fix/importador-compilado`

- PostgreSQL 16 (`pgvector/pgvector:pg16`) levantado con `infra/docker-compose.yml`; las 4 migraciones se aplicaron con `npm run db:migrate:deploy` sin errores.
- Importación del libro oficial: 7,788 filas leídas, 6,885 `NORMALIZADA` y 903 `REVISAR` (898 `FECHA_INVALIDA`, 5 `PRECIO_AUSENTE`), 0 rechazadas; 7,788 filas en `referencias_ine`. Alias de modalidad: 492 `PENDIENTE` y 3 `CONFIRMADO`.
- Una segunda ejecución con el mismo archivo devolvió el mismo lote (`yaExistia: true`), lo que confirma la idempotencia por hash.
- Defecto hallado y corregido: `npm run import:ine` usaba `tsx`, que no emite metadatos de decoradores, y fallaba al inyectar dependencias. Ahora compila con `nest build` y ejecuta `dist/`.
- Limitación conocida: `npm run` en Windows divide rutas con espacios.
- Pendiente: revisar los 903 casos `REVISAR` (fechas no interpretables) y confirmar o rechazar los 492 alias pendientes.
