# Portal de Precios de Referencia

API inicial del Portal de Precios de Referencia. El backend está construido con NestJS y TypeScript; utiliza PostgreSQL como base de datos y Prisma para el acceso a datos y las migraciones.

## Requisitos

- Node.js 22.12 o posterior
- npm
- Docker Desktop con el motor Linux activo

## Inicio con Docker

Desde la raíz de este repositorio:

```powershell
Copy-Item .env.example .env
docker compose --env-file .env -f infra/docker-compose.yml up --build
```

La API queda disponible en `http://localhost:3000/api/v1`. La base de datos se publica únicamente en `localhost:5432`. Para comprobar que la API inició:

```powershell
curl.exe http://localhost:3000/api/v1/salud
```

La respuesta esperada es:

```json
{
  "estado": "ok",
  "servicio": "portal-precios-api"
}
```

## Desarrollo local

Inicia PostgreSQL con Docker o con una instalación local. Desde la raíz del repositorio:

```powershell
npm ci
npm run db:generate
npm run db:migrate:dev
npm run start:dev
```

La configuración local se define en `.env`. `.env.example` contiene los valores de referencia; usa una contraseña propia y no subas `.env` al repositorio.

## Estructura

```text
.
  infra/
    docker-compose.yml      API y PostgreSQL
    postgres/init/          Extensiones de PostgreSQL
  src/
    common/auth/            Contexto, roles y autorización de propiedad
    infrastructure/
      database/             Conexión y servicio de Prisma
      mail/                 Adaptador SMTP configurable
    modules/
      health/               Estado de la API
      auth/                 Sesiones y autenticación de navegador
      invitaciones/         Módulo inicial
      auditoria/            Módulo inicial
      adjuntos/             Módulo inicial
      integraciones/        Módulo inicial
      referencias-ine/      Importación y normalización del catálogo oficial
  prisma/                   Esquema y migraciones
  test/                     Pruebas de extremo a extremo
```

Los módulos de invitaciones, auditoría, adjuntos e integraciones conservan estructura inicial; sus operaciones HTTP aún no están implementadas. Los controles compartidos de rol y propiedad están disponibles para los siguientes módulos, pero todavía no hay endpoints funcionales que los consuman.

## Alcance implementado

- Aplicación NestJS con prefijo global `/api/v1` y endpoint `GET /salud`.
- Inicio y cierre de sesión, consulta del usuario autenticado y renovación del token CSRF.
- Sesiones opacas revocables con expiración; la base de datos conserva hashes de los tokens y el navegador recibe el token de sesión en cookie `HttpOnly`.
- Guard global de sesión para rutas privadas; salud e inicio de sesión son explícitamente públicos.
- Validación de credenciales con Argon2id y respuesta genérica ante credenciales incorrectas o cuentas no elegibles.
- Cookie `Secure` en producción y con `SameSite=None`, dominio configurable, CORS con credenciales y soporte de proxy condicionado a CIDRs configurados.
- Límite de cinco intentos de inicio de sesión por minuto, además del límite global.
- Validación de configuración al inicio: entorno, puerto, orígenes CORS y conexión a PostgreSQL.
- Validación global de solicitudes con rechazo de propiedades no declaradas.
- Helmet con Content Security Policy, protección contra framing, `X-Content-Type-Options`, `Referrer-Policy` y HSTS en producción.
- Límite general de 100 solicitudes por minuto.
- Adaptador SMTP configurable con validación explícita de remitente/servidor, STARTTLS obligatorio por defecto y transporte JSON sin envío externo en pruebas.
- Contexto de autorización con rol y ámbito de propiedad; guard global para roles y helper de comparación de propietario con denegación por defecto.
- Esquema Prisma y migraciones para usuarios, roles, proveedores, invitaciones, verificación de correo y bitácora.
- Catálogo de productos de proveedor con historial de precios e importaciones con filas fuente y estado de validación.
- Importaciones del catálogo del INE con conservación de encabezados y filas originales, modalidades canónicas y sus alias.
- Importador CLI XLSX para el catálogo INE: valida firma, tamaño y encabezados, conserva ambas columnas `Modalidad`, normaliza datos a staging y marca observaciones sin eliminar la fuente.
- Solicitudes vinculadas a una cuenta, con modalidad, productos, código SIGES y adjuntos tipificados.
- Persistencia para empresas propuestas por producto en Subasta Electrónica Inversa y expedientes de comisión, representantes y cotizaciones para bienes importados.
- Roles iniciales `ADMIN`, `TRABAJADOR_INE`, `PROVEEDOR` y `USUARIO`; la migración de identidad renombra `USUARIO` a `SOLICITANTE` preservando sus asignaciones.
- Persistencia de instituciones, perfiles y sesiones de solicitantes; la migración correspondiente aún debe aplicarse y validarse en PostgreSQL.
- Importes `DECIMAL(14,3)` para conservar la precisión observada en el catálogo oficial.
- Fechas de creación y actualización separadas de las fechas declaradas por las fuentes; PostgreSQL actualiza `updated_at` mediante triggers.
- Compose con PostgreSQL 16 y las extensiones `pg_trgm`, `unaccent` y `vector`.
- Pruebas unitarias y de extremo a extremo para salud y ciclo de sesión.

## Registro, verificación e invitaciones

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `POST /api/v1/auth/registro-solicitante` | Público | Crea una cuenta `SOLICITANTE` en `PENDIENTE_VERIFICACION` con su institución y perfil. Siempre responde 202 con el mismo mensaje, exista o no el correo. |
| `POST /api/v1/auth/verificar-correo` | Público | Consume un token de un solo uso (204) y deja la cuenta en `PENDIENTE_APROBACION`. |
| `POST /api/v1/auth/reenviar-verificacion` | Público | Emite un token nuevo e invalida los anteriores; respuesta genérica. |
| `POST /api/v1/invitaciones` | `ADMIN` | Invita a un proveedor existente (`proveedorId`) o nuevo (`nuevoProveedor`). Devuelve `correoEnviado`; nunca el token. |
| `POST /api/v1/auth/aceptar-invitacion` | Público con token | Crea la cuenta `PROVEEDOR` activa, ligada solo al proveedor invitado; la invitación no se reutiliza. |
| `GET /api/v1/solicitantes/pendientes` | `ADMIN` | Lista solicitantes con correo verificado pendientes de revisión. |
| `POST /api/v1/solicitantes/:usuarioId/aprobar` · `/rechazar` | `ADMIN` | Activa la cuenta o la desactiva; se audita revisor, fecha e IP. |

Un solicitante no puede iniciar sesión hasta verificar su correo **y** ser aprobado. Los tokens se guardan solo como hash SHA-256 y caducan (`EMAIL_TOKEN_TTL_HOURS`, `INVITATION_TTL_HOURS`). Configura `FRONTEND_URL` (enlaces de los correos) y, opcionalmente, `REGISTRO_DOMINIOS_PERMITIDOS` (por ejemplo `gob.gt`). El DPI/CUI no se recolecta.

## Solicitudes de precio (S.00)

| Método y ruta | Rol | Descripción |
|---|---|---|
| `POST /api/v1/solicitudes` | `SOLICITANTE` | Crea un borrador ligado al usuario y a su institución; admite cabecera y lista de productos. |
| `GET /api/v1/solicitudes` · `GET /api/v1/solicitudes/:id` | Todos los roles de trabajo | El solicitante ve sus borradores y lo enviado por su institución; el personal del INE ve lo enviado. Lo ajeno responde 404. |
| `PATCH /api/v1/solicitudes/:id` | `SOLICITANTE` autor | Edita un borrador; si se envía `productos`, reemplaza la lista. |
| `POST /api/v1/solicitudes/:id/enviar` | `SOLICITANTE` autor | Valida la cabecera y cada producto (especificaciones, unidad y cantidad > 0). Si falta algo responde 422 `SOLICITUD_INCOMPLETA` con `errors[{field,message}]`. |
| `POST /api/v1/solicitudes/:id/estado` | `TRABAJADOR_INE`, `ADMIN` | `RECIBIDA → EN_REVISION → EN_ANALISIS → COMPLETADA`, y `RECHAZADA` desde cualquiera de las anteriores; el motivo queda en la auditoría. |

Un borrador puede estar incompleto; solo al enviar se exigen modalidad, unidad ejecutora, fecha del formulario, enlace, autoridad y productos. Las cantidades viajan como cadena decimal y la fecha como `YYYY-MM-DD`. Los adjuntos privados y los formularios S.11, S.21 y S.22 siguen pendientes.

## Errores y auditoría de acceso

Todos los errores HTTP se devuelven como `application/problem+json` (RFC 7807) con `type`, `title`, `status`, `detail`, `instance` y un `code` estable. Los errores de validación usan `VALIDACION_FALLIDA` y listan `errors: [{ field, message }]`. El inicio de sesión, el intento fallido y el cierre de sesión se registran en `eventos_auditoria` con la IP del cliente; configura `TRUSTED_PROXY_CIDRS` para que la IP sea fiable detrás de un proxy.

## Pendiente

Auditoría consultable, adjuntos y gestión de solicitudes aún no tienen endpoints. El importador del catálogo se ejecuta por CLI; no expone una carga HTTP. Los controles compartidos de autorización todavía deben aplicarse en cada operación de negocio y cubrirse con pruebas de integración. Para enviar correo fuera de pruebas se deben configurar `SMTP_HOST` y `SMTP_FROM`; las credenciales `SMTP_USER` y `SMTP_PASSWORD` son opcionales, pero deben proporcionarse juntas. `SMTP_SECURE=false` exige STARTTLS; usa `true` para TLS implícito. También están pendientes límites por cuenta, búsqueda web, proveedores de IA, análisis y generación de informes. La API usa sesiones con cookie y CSRF, no JWT.

La normalización y los atributos de cada entidad se documentan en [docs/modelo-datos.md](./docs/modelo-datos.md); el diagrama ER imprimible con todas las entidades y columnas está en [docs/modelo-relacional-base-datos-v2.pdf](./docs/modelo-relacional-base-datos-v2.pdf). La [guía del MVP de Contrato Abierto](./docs/guia-mvp-contrato-abierto.md) propone vistas, rutas y entidades para orientar la primera entrega; las rutas de solicitudes allí descritas aún no existen. El contrato HTTP disponible se describe en [api-service-contracts.md](./.github/modernize/assessment/engines/facts/api-service-contracts.md), y los controles para futuras rutas en [docs/criterios-aceptacion-api.md](./docs/criterios-aceptacion-api.md). Los principios de seguridad, datos y calidad están en [constitution.md](./.github/modernize/constitution.md). La [especificación y el plan de identidad](./.github/modernize/identity-access/plan.md) cubren tanto el flujo implementado como las tareas pendientes. El catálogo perfilado tiene 7,788 filas; sus dos columnas `Modalidad` coinciden y NOG se repite, por lo que se conservan los datos originales sin usar NOG como clave. El esquema define persistencia, no los servicios de validación ni el reemplazo de la entrega física que exige el INE.

Antes de habilitar tráfico real detrás de un proxy, hay que configurar `TRUSTED_PROXY_CIDRS` con los rangos correctos y verificar la IP efectiva del cliente. El límite actual es general más una restricción de inicio de sesión; no sustituye controles por cuenta para otras operaciones.

## Importar el catálogo INE

Con la base de datos migrada y las variables del archivo `.env` configuradas, importa un XLSX mediante:

```powershell
npm run import:ine -- --archivo "C:\ruta\al\catalogo.xlsx" --usuario-id <uuid-del-actor>
```

Si cambian las reglas de normalización, `npm run reprocesar:ine [-- --importacion-id <uuid>]` las reaplica a las filas ya almacenadas a partir de sus datos originales, sin volver a leer el libro. Reglas vigentes: la fecha `30/11/-0001` es el marcador de «sin fecha» del libro y deja `fecha_publicacion` en `NULL` sin observación; `Contrato Abierto [Número] NN-AAAA` se confirma como `CONTRATO_ABIERTO` y guarda `NN-AAAA` en `referencia_contrato`; un precio `Sin Dato` mantiene la fila en `REVISAR`.

`--usuario-id` es opcional para una carga técnica. El hash SHA-256 hace idempotente una repetición exacta del mismo archivo; si ya existe, el comando devuelve el resumen del lote previo. Las filas con observaciones se conservan en staging y las referencias sin un importe válido quedan fuera de futuras estadísticas de precios.

## Instalación y migraciones

Tras actualizar desde `develop` ejecuta `npm install` (se añadieron `nodemailer` y `@electric-sql/pglite`; sin ello `npm run build` falla). La migración de sesiones vigente es `20261124030000_identity_access_sessions`; una base que haya aplicado la antigua `20261124030000_auth_sessions` (rama `feat/auth-importerExcel`, reemplazada por la auth de sesiones opacas) debe recrearse en desarrollo, porque ese nombre ya no existe en el historial. Para compilar o generar el cliente Prisma se requiere `DATABASE_URL` definido.

## Verificación

```powershell
npm run build
npm test
npm run test:e2e
npm run lint
```

## Prisma

```powershell
npm run db:generate
npm run db:migrate:dev
npm run db:migrate:deploy
```

Las migraciones se mantienen en `prisma/migrations`. Los cambios al esquema deben reflejarse en una migración versionada.
