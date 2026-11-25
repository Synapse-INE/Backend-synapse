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
