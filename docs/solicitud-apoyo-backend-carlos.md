# Solicitud de apoyo: continuidad del backend

## Contexto

La API ya cuenta con NestJS, PostgreSQL, Prisma, autenticación por sesión, cookie `HttpOnly`, CSRF y el esquema relacional documentado. También quedaron implementados el adaptador de correo SMTP y las utilidades compartidas de autorización. Todavía no existen endpoints de registro, verificación, invitaciones, revisión administrativa ni trámites.

La fuente de requisitos es la [especificación de identidad y acceso](../.github/modernize/identity-access/spec.md), su [plan y tareas](../.github/modernize/identity-access/plan.md), la [constitución](../.github/modernize/constitution.md) y el [esquema Prisma](../prisma/schema.prisma). Para integrar con frontend, actualizar el [contrato actual de API](../.github/modernize/assessment/engines/facts/api-service-contracts.md) solo cuando las rutas estén implementadas y probadas.

## Trabajo solicitado

Completar primero el ciclo de identidad y autorización en este orden:

1. **Registro de solicitantes y verificación de correo** (`T014–T016`):
   - Normalizar el correo y evitar respuestas que revelen si una cuenta existe.
   - Asignar únicamente el rol `SOLICITANTE`; asociar la institución y mantener la cuenta bloqueada hasta verificar el correo y recibir aprobación administrativa.
   - Generar tokens aleatorios de un solo uso, persistir únicamente sus hashes y consumirlos de forma atómica; no exponerlos en respuestas ni logs.
   - Enviar los mensajes mediante `MailService`. Manejar errores de SMTP sin activar la cuenta ni dejar cambios parciales.
   - Mantener DPI/CUI deshabilitado en producción hasta aprobación institucional. Si se implementa el cifrado, usar una clave gestionada por configuración/secretos, enmascarar siempre las respuestas y no aceptar imágenes del documento.

2. **Invitaciones de proveedores** (`T017`):
   - Permitir su creación solo a personal autorizado.
   - Vincular cada invitación al correo y proveedor previstos; aplicar expiración y aceptación de un solo uso, incluyendo protección contra solicitudes simultáneas y replay.
   - Nunca permitir que el cliente determine el proveedor o rol final al aceptar.

3. **Revisión administrativa y auditoría** (`T019–T020`):
   - Añadir aprobación/rechazo de solicitantes y administración controlada de roles.
   - Registrar actor, acción, objetivo, hora y resultado, sin contraseñas, tokens ni DPI/CUI completo.
   - Evitar que trabajadores y cuentas externas puedan escalar privilegios.

4. **Bootstrap y validación** (`T021–T024`):
   - Crear un bootstrap inicial de administrador de una sola ejecución, sin credenciales predeterminadas ni ruta pública de alta privilegiada.
   - Añadir pruebas unitarias y E2E de acceso anónimo, rol incorrecto, propiedad cruzada, duplicados, expiración, replay, concurrencia, SMTP y límites de tasa.
   - Actualizar documentación/contratos con el comportamiento real, ejecutar la migración en PostgreSQL de prueba y correr `npm test`, `npm run test:e2e`, `npm run build` y `npm run lint`.

## Controles compartidos ya disponibles

- `MailService` en `src/infrastructure/mail/`: el transporte de pruebas es JSON y no envía correo externo. Fuera de pruebas requiere `SMTP_HOST` y `SMTP_FROM`; `SMTP_USER` y `SMTP_PASSWORD` se configuran juntos si el servidor los exige.
- `Roles` y `RolesGuard` en `src/common/auth/`: guard global; proteger cada ruta con metadatos de roles.
- `assertResourceOwnership` en `src/common/auth/ownership.ts`: compara explícitamente ámbito y propietario y deniega si falta el identificador.
- `request.auth.ownership` contiene los IDs de usuario, proveedor e institución obtenidos de la sesión autenticada. No tomar estos valores de body, query o headers.

## Límites y decisiones que deben respetarse

- No habilitar captura de DPI/CUI en producción antes de que el INE confirme finalidad, aviso, acceso, retención y eliminación.
- No guardar secretos, tokens en claro, archivos subidos o credenciales por defecto en el repositorio.
- Mantener DTOs de entrada/salida separados de Prisma; validar propiedades, tamaños y formatos.
- Usar transacciones para los cambios que involucren cuenta, token y estado; probar carreras de consumo/replay.
- Las rutas de solicitudes, importación del catálogo, adjuntos, S.11, comisiones S.21/S.22, búsqueda externa, IA e informes siguen fuera de este bloque. Dejar sus decisiones de dominio explícitas y abordarlas en entregas posteriores; no inventar políticas del INE.

## Resultado esperado

Un PR incremental con tareas trazables a `T014–T024`, pruebas negativas de seguridad, contratos actualizados y una lista explícita de bloqueos institucionales. No marcar ninguna operación como lista si solo existe su modelo Prisma o si no se verificó por HTTP.
