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

## 2026-11-24 — Revisión de filas `REVISAR` y alias pendientes del catálogo INE

**Rama:** `fix/importador-reglas-revision`

- 898 filas con `FECHA_INVALIDA` traían `30/11/-0001`, la fecha cero de Excel usada como «sin fecha». Ahora se normalizan a `NULL` sin observación; el valor original se conserva en `datos_originales`.
- 490 alias `Contrato Abierto Número NN-AAAA`, uno `Contrato Abierto NN-AAAA` y el error tipográfico `Bienes y suminstros importados` (revisado manualmente) se confirman automáticamente. El sufijo `NN-AAAA` se guarda en `referencia_contrato`.
- Nuevo comando `npm run reprocesar:ine` para reaplicar las reglas a lotes ya importados (necesario porque la importación es idempotente por hash).
- Resultado tras reprocesar en PostgreSQL: 7,783 filas `NORMALIZADA` y 5 `REVISAR` (precio `Sin Dato`, filas 3193, 3867, 4240, 5220 y 5782 del libro); 495 alias `CONFIRMADO` y 0 pendientes.
- Pendiente: el INE debe indicar el precio de esas 5 filas o confirmar que se excluyen de estadísticas.
