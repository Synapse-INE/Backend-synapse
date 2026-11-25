# Portal de Precios de Referencia

Backend del Portal de Precios de Referencia, desarrollado con NestJS y TypeScript. Utiliza PostgreSQL como motor de persistencia y Prisma para el modelado de datos y la gestión de migraciones.

## Tecnologías

- Node.js 22.12 o posterior
- NestJS y TypeScript
- PostgreSQL 16
- Prisma ORM
- Docker Compose

## Alcance implementado

### API y autenticación

La API utiliza el prefijo `/api/v1` y actualmente ofrece:

| Método  | Ruta                                       | Descripción                                                        | Acceso                               |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `GET`   | `/salud`                                   | Comprueba la disponibilidad de la API.                             | Público                              |
| `POST`  | `/auth/iniciar-sesion`                     | Autentica una cuenta activa y con correo verificado.               | Público                              |
| `GET`   | `/auth/yo`                                 | Devuelve la identidad y los roles de la sesión actual.             | Sesión                               |
| `GET`   | `/auth/csrf`                               | Renueva el token CSRF de la sesión.                                | Sesión                               |
| `POST`  | `/auth/cerrar-sesion`                      | Revoca la sesión y elimina la cookie.                              | Sesión y CSRF                        |
| `POST`  | `/auth/registro-solicitante`               | Registra un solicitante (respuesta 202 genérica).                  | Público                              |
| `POST`  | `/auth/verificar-correo`                   | Verifica el correo con un token de un solo uso.                    | Público                              |
| `POST`  | `/auth/reenviar-verificacion`              | Reenvía el enlace de verificación.                                 | Público                              |
| `POST`  | `/auth/aceptar-invitacion`                 | Crea la cuenta de un proveedor invitado.                           | Público con token                    |
| `POST`  | `/invitaciones`                            | Invita a un proveedor existente o nuevo.                           | `ADMIN`, sesión y CSRF               |
| `GET`   | `/solicitantes/pendientes`                 | Lista solicitantes pendientes de revisión.                         | `ADMIN`                              |
| `POST`  | `/solicitantes/:usuarioId/aprobar`         | Aprueba y activa al solicitante.                                   | `ADMIN`, sesión y CSRF               |
| `POST`  | `/solicitantes/:usuarioId/rechazar`        | Rechaza y desactiva al solicitante.                                | `ADMIN`, sesión y CSRF               |
| `POST`  | `/solicitudes`                             | Crea un borrador de solicitud S.00.                                | `SOLICITANTE`, sesión y CSRF         |
| `GET`   | `/solicitudes`                             | Lista solicitudes según el alcance del usuario.                    | Sesión                               |
| `GET`   | `/solicitudes/:id`                         | Consulta una solicitud con sus productos.                          | Sesión                               |
| `PATCH` | `/solicitudes/:id`                         | Edita un borrador.                                                 | `SOLICITANTE` autor, sesión y CSRF   |
| `POST`  | `/solicitudes/:id/enviar`                  | Valida y envía la solicitud al INE.                                | `SOLICITANTE` autor, sesión y CSRF   |
| `POST`  | `/solicitudes/:id/estado`                  | Cambia el estado de la solicitud.                                  | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |

Hay 19 endpoints, todos descritos en el documento OpenAPI (ver más abajo). Lo que falta para terminar el backend está en [docs/backlog-backend.md](./docs/backlog-backend.md).

La autenticación utiliza sesiones opacas almacenadas en PostgreSQL. El navegador recibe el token de sesión mediante una cookie `HttpOnly`; la base de datos conserva su hash, no el valor original. Las contraseñas se verifican con Argon2id. Las solicitudes autenticadas que modifican estado requieren protección CSRF.

La API valida los DTO de entrada y rechaza propiedades no declaradas. Aplica un límite general de 100 solicitudes por minuto y de cinco intentos de inicio de sesión por minuto. Helmet configura cabeceras de seguridad; CORS permite credenciales solo desde los orígenes configurados. La confianza en proxies se limita a rangos CIDR definidos por configuración.

### Persistencia y datos de dominio

El esquema Prisma y sus migraciones definen entidades para:

- Usuarios, roles, sesiones, verificación de correo e instituciones de solicitantes.
- Proveedores, productos, historial de precios e importaciones de proveedores.
- Importaciones y referencias del catálogo oficial de precios del INE.
- Solicitudes de precio y sus productos, requisitos, adjuntos, proveedores propuestos, comisiones y cotizaciones asociadas a los formularios S.00, S.11, S.21 y S.22.

La migración de identidad conserva las asignaciones existentes al transformar el rol genérico `USUARIO` en `SOLICITANTE`. Los importes de referencia utilizan precisión decimal para preservar los valores de la fuente.

El esquema de persistencia no implica que cada entidad tenga una ruta HTTP disponible. Los endpoints de administración de usuarios, auditoría, adjuntos y formularios todavía no forman parte de la API implementada.

### Importación del catálogo INE

El catálogo puede procesarse mediante el comando de consola `npm run import:ine`. El importador acepta archivos XLSX, verifica extensión, firma y tamaño, conserva filas y encabezados originales y registra los valores normalizados y sus observaciones. Las modalidades no reconocidas quedan disponibles para revisión; la deduplicación de cargas idénticas se basa en SHA-256, no en NOG.

```powershell
npm run import:ine -- --archivo "C:\ruta\al\catalogo.xlsx" --usuario-id <uuid-del-actor>
```

El parámetro `--usuario-id` es opcional para una carga técnica. La importación se ejecuta por consola; no hay una ruta HTTP de carga de archivos.

### Componentes de integración y autorización

El proyecto incluye un adaptador SMTP configurable y componentes compartidos para autorización por rol y propiedad de recursos. Estos componentes constituyen la base técnica para los flujos de negocio; las rutas HTTP de invitaciones, administración y solicitudes no están incluidas en la versión actual.

### Registro, verificación e invitaciones

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

### Solicitudes de precio (S.00)

| Método y ruta | Rol | Descripción |
|---|---|---|
| `POST /api/v1/solicitudes` | `SOLICITANTE` | Crea un borrador ligado al usuario y a su institución; admite cabecera y lista de productos. |
| `GET /api/v1/solicitudes` · `GET /api/v1/solicitudes/:id` | Todos los roles de trabajo | El solicitante ve sus borradores y lo enviado por su institución; el personal del INE ve lo enviado. Lo ajeno responde 404. |
| `PATCH /api/v1/solicitudes/:id` | `SOLICITANTE` autor | Edita un borrador; si se envía `productos`, reemplaza la lista. |
| `POST /api/v1/solicitudes/:id/enviar` | `SOLICITANTE` autor | Valida la cabecera y cada producto (especificaciones, unidad y cantidad > 0). Si falta algo responde 422 `SOLICITUD_INCOMPLETA` con `errors[{field,message}]`. |
| `POST /api/v1/solicitudes/:id/estado` | `TRABAJADOR_INE`, `ADMIN` | `RECIBIDA → EN_REVISION → EN_ANALISIS → COMPLETADA`, y `RECHAZADA` desde cualquiera de las anteriores; el motivo queda en la auditoría. |

Un borrador puede estar incompleto; solo al enviar se exigen modalidad, unidad ejecutora, fecha del formulario, enlace, autoridad y productos. Las cantidades viajan como cadena decimal y la fecha como `YYYY-MM-DD`. Los adjuntos privados y los formularios S.11, S.21 y S.22 siguen pendientes.

### Errores y auditoría de acceso

Todos los errores HTTP se devuelven como `application/problem+json` (RFC 7807) con `type`, `title`, `status`, `detail`, `instance` y un `code` estable. Los errores de validación usan `VALIDACION_FALLIDA` y listan `errors: [{ field, message }]`. El inicio de sesión, el intento fallido y el cierre de sesión se registran en `eventos_auditoria` con la IP del cliente; configura `TRUSTED_PROXY_CIDRS` para que la IP sea fiable detrás de un proxy.

## Inicio con Docker

Requisitos: Node.js 22.12 o posterior, npm y Docker Desktop con el motor Linux activo.

Desde la carpeta `backend`:

```powershell
Copy-Item .env.example .env
```

Configura en `.env` una contraseña local para PostgreSQL y levanta los servicios:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up --build
```

La API queda disponible en `http://localhost:3000/api/v1`; PostgreSQL se publica solo en `localhost:5432`. El contenedor de la API aplica las migraciones al iniciar.

Comprueba el estado del servicio:

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

No uses credenciales reales en el entorno local ni publiques el archivo `.env`.

## Desarrollo local

Con PostgreSQL disponible y `DATABASE_URL` configurada en `.env`, desde `backend` ejecuta:

```powershell
npm ci
npm run db:generate
npm run db:migrate:dev
npm run start:dev
```

Para desplegar migraciones ya versionadas:

```powershell
npm run db:migrate:deploy
```

## Importar el catálogo INE

Con la base de datos migrada y las variables del archivo `.env` configuradas, importa un XLSX mediante:

```powershell
npm run import:ine -- --archivo "C:\ruta\al\catalogo.xlsx" --usuario-id <uuid-del-actor>
```

Si cambian las reglas de normalización, `npm run reprocesar:ine [-- --importacion-id <uuid>]` las reaplica a las filas ya almacenadas a partir de sus datos originales, sin volver a leer el libro. Reglas vigentes: la fecha `30/11/-0001` es el marcador de «sin fecha» del libro y deja `fecha_publicacion` en `NULL` sin observación; `Contrato Abierto [Número] NN-AAAA` se confirma como `CONTRATO_ABIERTO` y guarda `NN-AAAA` en `referencia_contrato`; un precio `Sin Dato` mantiene la fila en `REVISAR`.

El comando compila con `nest build` y ejecuta `dist/scripts/importar-referencias-ine.js`; no usa `tsx` porque este no emite los metadatos de decoradores que Nest necesita para la inyección. En Windows, `npm run` divide las rutas con espacios: usa una ruta sin espacios o ejecuta `node dist/scripts/importar-referencias-ine.js --archivo "<ruta>"` tras compilar.

`--usuario-id` es opcional para una carga técnica. El hash SHA-256 hace idempotente una repetición exacta del mismo archivo; si ya existe, el comando devuelve el resumen del lote previo. Las filas con observaciones se conservan en staging y las referencias sin un importe válido quedan fuera de futuras estadísticas de precios.

## Instalación y migraciones

Tras actualizar desde `develop` ejecuta `npm install` (se añadieron `nodemailer` y `@electric-sql/pglite`; sin ello `npm run build` falla). La migración de sesiones vigente es `20261124030000_identity_access_sessions`; una base que haya aplicado la antigua `20261124030000_auth_sessions` (rama `feat/auth-importerExcel`, reemplazada por la auth de sesiones opacas) debe recrearse en desarrollo, porque ese nombre ya no existe en el historial. Para compilar o generar el cliente Prisma se requiere `DATABASE_URL` definido.

## Documentación OpenAPI

Swagger está deshabilitado por defecto. Para habilitarlo en desarrollo, establece `SWAGGER_ENABLED=true` en `.env` y reinicia la API:

- Interfaz Swagger UI: `http://localhost:3000/api/v1/docs`
- Especificación OpenAPI JSON: `http://localhost:3000/api/v1/openapi.json`

La especificación describe los 19 endpoints implementados (salud, autenticación, registro e invitaciones, revisión de solicitantes y solicitudes S.00), sus esquemas de entrada generados desde los DTO, los códigos de error `application/problem+json` y los dos mecanismos de seguridad: la cookie de sesión y el encabezado `x-csrf-token`. Puede importarse en Postman desde la URL JSON. Una prueba e2e (`test/openapi.e2e-spec.ts`) falla si un endpoint nuevo no se documenta o si se documenta uno que no existe. En producción, mantén `SWAGGER_ENABLED=false` salvo que la documentación esté protegida.

## Pruebas y calidad

```powershell
npm run build
npm test -- --maxWorkers=1
npm run test:e2e -- --maxWorkers=1
npm run lint
npx prisma validate
```

## Pendiente

Lo que falta para terminar el backend (primer administrador y recuperación de cuenta, administración de usuarios, consulta de auditoría, adjuntos privados, formularios S.11, S.21 y S.22, catálogo INE por HTTP, estadísticas e informes) está priorizado en [docs/backlog-backend.md](./docs/backlog-backend.md), con alcance, reglas y dependencias de cada ítem. El importador del catálogo se ejecuta por CLI; no expone una carga HTTP.

Para enviar correo fuera de pruebas configura `SMTP_HOST` y `SMTP_FROM`; `SMTP_USER` y `SMTP_PASSWORD` son opcionales, pero deben darse juntos. `SMTP_SECURE=false` exige STARTTLS y `true` usa TLS implícito. Antes de habilitar tráfico real detrás de un proxy, configura `TRUSTED_PROXY_CIDRS` con los rangos correctos y verifica la IP efectiva del cliente: la auditoría y los límites de peticiones dependen de ella.

## Estructura principal

```text
backend/
  docs/                 Documentación del modelo y del proyecto
  infra/                Docker Compose e inicialización de PostgreSQL
  prisma/               Esquema y migraciones
  src/
    common/             Contexto de autenticación y autorización compartida
    infrastructure/     Base de datos, correo, seguridad y OpenAPI
    modules/             Salud, autenticación, registro, invitaciones, solicitantes, solicitudes, auditoría e importación INE
    scripts/             Comandos operativos
  test/                  Pruebas unitarias y de extremo a extremo
```

El [modelo de datos](./docs/modelo-datos.md) describe entidades y decisiones de normalización. La definición completa de campos y relaciones está en [schema.prisma](./prisma/schema.prisma); los contratos HTTP publicados corresponden a las rutas documentadas por OpenAPI.
