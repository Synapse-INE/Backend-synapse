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

## 2026-11-24 — Registro, verificación de correo, invitaciones y revisión de solicitantes

**Rama:** `feat/registro-verificacion-invitaciones` (incluye la rama `feat/auth-auditoria-rfc7807`, de la que depende para registrar la IP)

- Nuevos módulos `registro`, `invitaciones` y `solicitantes`, y `AuditoriaService` compartido (`registrarEn` transaccional y `registrar` de mejor esfuerzo).
- Registro sin enumeración de cuentas: misma respuesta 202 para correos nuevos, existentes o en carrera; el hash Argon2 se calcula siempre.
- Tokens de verificación e invitación de un solo uso, solo hash en base de datos, consumo atómico (`updateMany` con `consumidoEn/aceptadaEn = null` y vigencia). El token nunca se devuelve ni se registra; si falla el SMTP la cuenta se conserva y la invitación devuelve `correoEnviado: false`.
- Un solicitante necesita correo verificado y aprobación de un `ADMIN` para iniciar sesión; el proveedor solo existe vía invitación.
- Nuevas variables: `FRONTEND_URL`, `EMAIL_TOKEN_TTL_HOURS`, `INVITATION_TTL_HOURS`, `REGISTRO_DOMINIOS_PERMITIDOS`.
- Verificación: 66 pruebas unitarias y e2e, y una prueba de humo contra PostgreSQL real (registro, verificación, aprobación con y sin CSRF, rol no autorizado, invitación y reutilización) con auditoría con IP.
- Pendiente: pantalla de administración, límites por cuenta, rotación de invitaciones desde la UI, y confirmar con el INE los dominios permitidos.

## 2026-11-24 — Solicitudes S.00 (borrador, envío y revisión)

**Rama:** `feat/solicitudes-s00` (incluye `feat/registro-verificacion-invitaciones`, que a su vez incluye `feat/auth-auditoria-rfc7807`)

- Migración `20261124050000_solicitudes_borrador`: valor `BORRADOR` en `estado_solicitud` y columna `enviada_en` (las solicitudes existentes se marcan como enviadas en su fecha de creación).
- Nuevo módulo `solicitudes`: crear borrador, listar, ver, editar, enviar y cambiar estado. Cada solicitud queda ligada a `creadaPorId` y a la institución del solicitante.
- Autorización: el solicitante lee lo propio y lo enviado por su institución, y solo el autor modifica; el personal del INE (`TRABAJADOR_INE`, `ADMIN`) ve lo enviado y es el único que cambia estados. Una solicitud ajena responde 404 para no revelar su existencia.
- Reglas de envío en el servidor (422 `SOLICITUD_INCOMPLETA` con detalle por campo); envío atómico (`updateMany` con `estado = BORRADOR`) y transiciones de estado con compare-and-set.
- Decisiones aplicadas según la documentación, pendientes de confirmar con el INE: mínimo de cotizaciones por producto (aún no aplicado, pertenece a S.11/S.21), Contrato Abierto como copia digital dirigida a la DGAE, y estados por rol como se describe arriba.
- Verificación: 80 pruebas unitarias/e2e y una prueba de humo contra PostgreSQL real (creación, 422 de envío incompleto, aislamiento entre instituciones y personal, doble envío, saltos de estado y auditoría).
- Pendiente: adjuntos privados, S.11 (proveedores por producto), S.21/S.22, y borrado de borradores.

## 2026-11-24 — Validación contra PostgreSQL real

**Rama:** `fix/importador-compilado`

- PostgreSQL 16 (`pgvector/pgvector:pg16`) levantado con `infra/docker-compose.yml`; las 4 migraciones se aplicaron con `npm run db:migrate:deploy` sin errores.
- Importación del libro oficial: 7,788 filas leídas, 6,885 `NORMALIZADA` y 903 `REVISAR` (898 `FECHA_INVALIDA`, 5 `PRECIO_AUSENTE`), 0 rechazadas; 7,788 filas en `referencias_ine`. Alias de modalidad: 492 `PENDIENTE` y 3 `CONFIRMADO`.
- Una segunda ejecución con el mismo archivo devolvió el mismo lote (`yaExistia: true`), lo que confirma la idempotencia por hash.
- Defecto hallado y corregido: `npm run import:ine` usaba `tsx`, que no emite metadatos de decoradores, y fallaba al inyectar dependencias. Ahora compila con `nest build` y ejecuta `dist/`.
- Limitación conocida: `npm run` en Windows divide rutas con espacios.
- Pendiente: revisar los 903 casos `REVISAR` (fechas no interpretables) y confirmar o rechazar los 492 alias pendientes.

## 2026-11-24 — Documentación OpenAPI completa y backlog del backend

**Rama:** `docs/openapi-completo`

- OpenAPI describe los 19 endpoints: etiquetas por área, resúmenes y descripciones, ejemplos de respuesta, errores `application/problem+json` con su `code`, y los dos esquemas de seguridad (cookie de sesión y encabezado `x-csrf-token`). Los esquemas de entrada se generan desde los DTO con el plugin de compilación de `@nestjs/swagger`.
- Decoradores reutilizables en `src/infrastructure/openapi/decoradores.ts` (`ApiProtegido`, `ApiProblema`, `ApiLimite`).
- `test/openapi.e2e-spec.ts` verifica la lista exacta de operaciones y su seguridad; falla si se añade un endpoint sin documentar o se documenta uno inexistente.
- README: tabla completa de endpoints, secciones de registro, solicitudes y errores (que se habían perdido en una fusión) y sección de pendientes.
- Nuevo [backlog-backend.md](./backlog-backend.md) con los ítems B-01 a B-14, su orden, las decisiones del INE que los bloquean y la definición de «backend terminado».
- Actualizados `estado-y-siguientes-pasos.md`, `criterios-aceptacion-api.md` y `api-service-contracts.md`.
