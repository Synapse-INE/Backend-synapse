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

## 2026-11-24 — Auditoría de acceso con IP y errores RFC 7807

**Rama:** `feat/auth-auditoria-rfc7807`

- Migración `20261124040000_auditoria_ip`: columna `ip` (VARCHAR(45)) en `eventos_auditoria`.
- Se auditan `INICIO_SESION`, `INICIO_SESION_FALLIDO` (sin guardar el correo en claro: solo su hash SHA-256) y `CIERRE_SESION`, con la IP efectiva (`request.ip`, que respeta `TRUSTED_PROXY_CIDRS`). La auditoría del éxito se escribe en la misma transacción que la sesión; la de fallos y cierres es de mejor esfuerzo y no impide la respuesta.
- `ProblemDetailsFilter` global (`APP_FILTER`): respuestas `application/problem+json` con `code` estable (`NO_AUTENTICADO`, `SIN_PERMISO`, `NO_ENCONTRADO`, `CONFLICTO`, `LIMITE_EXCEDIDO`, `SOLICITUD_INVALIDA`). Los errores de validación devuelven `VALIDACION_FALLIDA` con `errors[{field, message}]`.
- `test/identity-migration.spec.ts` ya no asume que la migración de identidad es la última.
