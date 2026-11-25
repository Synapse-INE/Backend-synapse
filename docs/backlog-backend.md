# Backlog para cerrar el backend

**Corte:** 24 de noviembre de 2026
**Propósito:** lista de lo que falta para considerar terminado el backend, en el orden recomendado. El frontend se desarrolla por separado y consume el contrato OpenAPI (`/api/v1/openapi.json`, ver el [README](../README.md#documentación-openapi)); cada entrega de este backlog debe actualizar ese contrato y sus pruebas.

## Qué ya está hecho

| Área | Estado |
|---|---|
| Autenticación, sesiones opacas, CSRF, roles y propiedad | Listo |
| Auditoría con IP (escritura) y errores RFC 7807 | Listo |
| Registro de solicitantes, verificación de correo, invitaciones de proveedor y revisión administrativa | Listo |
| Solicitudes S.00 (borrador, envío validado, estados) | Listo |
| Importador CLI del catálogo INE, reglas de normalización y reprocesado | Listo |
| Documentación OpenAPI de los 19 endpoints actuales | Listo |

## Cómo leer cada ítem

Cada ítem indica el alcance, los endpoints propuestos, las reglas que no se pueden saltar y la dependencia. Ninguno se considera terminado sin: migración si cambia la persistencia, validación de entrada, autorización por rol **y** propiedad, auditoría, pruebas (unitarias y de humo contra PostgreSQL), OpenAPI actualizado y una entrada en [trazabilidad.md](./trazabilidad.md).

## Prioridad alta: desbloquean al frontend y a la operación

### B-01 · Primer administrador y recuperación de cuenta
**Por qué:** hoy el primer `ADMIN` solo puede crearse con SQL, y no hay forma de recuperar una contraseña.
- Comando `npm run crear-admin -- --email <correo>` que crea el administrador inicial (contraseña por entrada interactiva o enlace de activación; nunca por argumento ni en logs). Debe negarse si ya existe un administrador.
- `POST /auth/olvide-contrasena` (respuesta genérica, token de un solo uso con hash) y `POST /auth/restablecer-contrasena` (consume el token y revoca todas las sesiones del usuario).
- `POST /auth/cambiar-contrasena` (sesión + CSRF + contraseña actual).
- **Reglas:** misma política de contraseñas que el registro (12–128 caracteres), límites de peticiones, sin enumeración de cuentas, auditoría.

### B-02 · Administración de usuarios y roles
- `GET /usuarios` (filtros por estado y rol, paginado), `GET /usuarios/:id`.
- `POST /usuarios/:id/bloquear` y `/desbloquear` (revocan sesiones), `PUT /usuarios/:id/roles`.
- **Reglas:** solo `ADMIN`; no se puede quitar el último administrador ni asignarse roles a sí mismo; los roles privilegiados nunca se asignan por registro público; todo cambio se audita.

### B-03 · Consulta de la auditoría
- `GET /auditoria` solo para `ADMIN`, con filtros por actor, acción, recurso, rango de fechas e IP, y paginación.
- **Reglas:** no devolver tokens ni datos sensibles; los metadatos ya se guardan sin ellos.

### B-04 · Adjuntos privados de las solicitudes
- Interfaz de almacenamiento (`AlmacenamientoPrivado`) con implementación en disco local para desarrollo y una compatible con S3 para producción; PostgreSQL guarda solo clave y metadatos (ya modelado en `SolicitudAdjunto`).
- `POST /solicitudes/:id/adjuntos` (multipart), `GET /solicitudes/:id/adjuntos`, `GET /solicitudes/:id/adjuntos/:adjuntoId` (descarga autorizada) y `DELETE` mientras la solicitud sea borrador.
- **Reglas:** límite de tamaño y lista de tipos permitidos; verificar el tipo real por firma del archivo, no por extensión ni `Content-Type`; calcular `sha256`; nombre de objeto generado por el servidor; descarga solo para el autor, su institución y el personal del INE; encabezados `Content-Disposition` y `nosniff`; sin enlaces públicos.
- **Dependencia:** decisión del INE sobre tipos documentales y tamaño máximo.

### B-05 · Calidad y operación
- **CI** (GitHub Actions) en cada PR: `npm ci`, `build`, `lint`, `test`, `test:e2e`, `prisma validate` y `prisma migrate diff` sin deriva, contra un PostgreSQL de servicio. Motivo: `develop` llegó a no compilar sin que nadie lo notara.
- **Salud con base de datos:** `GET /salud` queda como liveness; añadir `GET /salud/listo` (readiness) que compruebe PostgreSQL.
- **Logs estructurados** con identificador de correlación por petición; nunca registrar tokens, contraseñas ni correos completos de intentos fallidos.
- **Dockerfile y compose de producción:** usuario no root, `prisma migrate deploy` como paso previo, sin `.env` en la imagen.
- **Rama por defecto `develop`** y protección de `main` (solo PR desde `develop`).

## Prioridad media: completan los formularios oficiales

### B-06 · Borrado y cancelación de solicitudes; notificaciones de estado
- `DELETE /solicitudes/:id` para borradores del autor; cancelación opcional de solicitudes `RECIBIDA`.
- Correo al solicitante cuando el personal del INE cambia el estado (mejor esfuerzo, sin datos sensibles).

### B-07 · Requisitos del producto
- Alta y edición de `RequisitoSolicitud` (nombre, valor, unidad, modo `EXACTO/PREFERIDO/MINIMO`, fuente `MANUAL/...`) por producto, con aprobación por personal del INE (`aprobadoPor`). No sustituye la ficha del producto solicitado.

### B-08 · Formulario S.11: proveedores propuestos por producto
- CRUD de `ProveedorSolicitud` (nombre/razón social, NIT, dirección, teléfono) y de la matriz `ProveedorSolicitudProducto`.
- Confirmación de cada empresa por el personal del INE.
- **Regla acordada:** al enviar, cada producto debe tener al menos tres empresas (por producto), sujeto a confirmación del INE.

### B-09 · Formularios S.21 y S.22: bienes y suministros importados
- `ComisionImportacion` (estado y fecha de conformación) y `RepresentanteSolicitante` (titular y suplente).
- `CotizacionImportacion` y `CotizacionProducto` (fabricante, país de origen, moneda, precio FOB total, flete, seguro y otros gastos como componentes separados) y `JustificacionSolicitud`.
- **Reglas:** importes `DECIMAL` como cadena en JSON; no mezclar estas cotizaciones con el historial de precios del catálogo de proveedores; validaciones al enviar según la decisión del INE sobre el mínimo de cotizaciones.
- **Dependencia:** decisión 1 de [estado-y-siguientes-pasos.md](./estado-y-siguientes-pasos.md#decisiones-pendientes-antes-de-cerrar-formularios).

### B-10 · Consulta y gestión del catálogo INE por HTTP
- `GET /referencias-ine` con filtros (texto con `pg_trgm` y `unaccent`, modalidad, categoría, rango de fechas y de precio) y paginación.
- Revisión de datos importados: `GET /importaciones-ine/:id/filas?estado=REVISAR`, y gestión de alias de modalidad (`GET/PATCH /alias-modalidad`, confirmar o rechazar, con revisor registrado).
- Carga HTTP del libro (`POST /importaciones-ine`, multipart, solo `ADMIN`) cuando existan almacenamiento privado (B-04) y límites operativos; hasta entonces se mantiene el CLI.
- **Pendiente de datos:** las 5 filas con precio `Sin Dato` esperan respuesta del INE.

## Prioridad baja o dependiente del INE

### B-11 · Catálogo de proveedores
- `GET/POST/PATCH /proveedores/yo/productos` y registro de precios con historial (`PrecioProveedor`), solo para el proveedor propietario.
- Importación de productos y precios del proveedor (`ImportacionProveedor`) con staging y validaciones, análoga a la del INE.

### B-12 · Estadísticas e informes
- Media, mediana, redondeo y comparativos entre fuentes.
- Generación de informes (PDF o XLSX) por solicitud.
- **Dependencia:** la resolución metodológica del INE debe revisarse manualmente; no implementar hasta confirmar las reglas de redondeo y de estadística.

### B-13 · Búsqueda externa e IA
- Módulo `integraciones` con una interfaz por proveedor, tiempos de espera, reintentos acotados y registro de cada consulta; las respuestas de terceros se tratan como datos no confiables.
- Coincidencia asistida entre productos solicitados y referencias; siempre con revisión humana y trazabilidad de la fuente.

### B-14 · Controles adicionales de seguridad
- Límites por cuenta además de los límites por IP.
- DPI/CUI: sigue sin recolectarse; solo se habilita tras la aprobación del aviso de privacidad, retención y eliminación por el INE (cifrado de aplicación, enmascarado en respuestas).
- Revisión de dependencias: `npm audit` reportó 2 vulnerabilidades moderadas transitivas (`exceljs` → `uuid`); evaluar `overrides` o reemplazar la librería.

## Orden recomendado

| # | Ítem | Desbloquea |
|---|---|---|
| 1 | B-05 (CI y readiness) y B-01 (primer admin, recuperación) | Operar y probar el sistema de extremo a extremo |
| 2 | B-02 y B-03 (usuarios, roles y auditoría) | Pantalla de administración del frontend |
| 3 | B-04 (adjuntos) | Cierre del S.00 |
| 4 | B-06 y B-07 | Seguimiento de solicitudes y requisitos |
| 5 | B-08 (S.11) | Subasta Electrónica Inversa |
| 6 | B-09 (S.21/S.22) | Bienes y Suministros Importados |
| 7 | B-10 (catálogo INE por HTTP) | Consulta de referencias desde el frontend |
| 8 | B-11 a B-14 | Fases posteriores, según respuestas del INE |

## Decisiones del INE que bloquean ítems

1. Mínimo de cotizaciones: por expediente o por producto (B-08, B-09). Se asumió **por producto**.
2. Tratamiento de Contrato Abierto en el portal (se asumió copia digital dirigida a la DGAE).
3. Recepción física: si el portal registra fecha y estado de entrega (se asumió que sí).
4. Estados y autorizaciones por rol en cada etapa (se aplicó el flujo documentado en el README).
5. Tipos documentales y tamaño máximo de adjuntos (B-04).
6. Dominios de correo permitidos para el registro (`REGISTRO_DOMINIOS_PERMITIDOS`).
7. Reglas estadísticas y de redondeo (B-12).
8. Aviso de privacidad y retención para DPI/CUI (B-14).

## Definición de «backend terminado»

El backend se considera terminado cuando B-01 a B-10 están implementados y probados, B-05 corre en CI, todos los endpoints figuran en OpenAPI con pruebas que lo verifican, el importador y las migraciones se validaron en el PostgreSQL de despliegue, y las decisiones 1 a 6 están confirmadas por el INE. B-11 a B-14 pueden entregarse en una segunda fase sin bloquear el uso del portal.
