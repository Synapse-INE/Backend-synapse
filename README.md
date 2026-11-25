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

| Método | Ruta                   | Descripción                                            | Acceso              |
| ------ | ---------------------- | ------------------------------------------------------ | ------------------- |
| `GET`  | `/salud`               | Comprueba la disponibilidad de la API.                 | Público             |
| `POST` | `/auth/iniciar-sesion` | Autentica una cuenta activa y con correo verificado.   | Público             |
| `GET`  | `/auth/yo`             | Devuelve la identidad y los roles de la sesión actual. | Requiere sesión     |
| `GET`  | `/auth/csrf`           | Renueva el token CSRF de la sesión.                    | Requiere sesión     |
| `POST` | `/auth/cerrar-sesion`  | Revoca la sesión y elimina la cookie.                  | Sesión y token CSRF |

La autenticación utiliza sesiones opacas almacenadas en PostgreSQL. El navegador recibe el token de sesión mediante una cookie `HttpOnly`; la base de datos conserva su hash, no el valor original. Las contraseñas se verifican con Argon2id. Las solicitudes autenticadas que modifican estado requieren protección CSRF.

La API valida los DTO de entrada y rechaza propiedades no declaradas. Aplica un límite general de 100 solicitudes por minuto y de cinco intentos de inicio de sesión por minuto. Helmet configura cabeceras de seguridad; CORS permite credenciales solo desde los orígenes configurados. La confianza en proxies se limita a rangos CIDR definidos por configuración.

### Persistencia y datos de dominio

El esquema Prisma y sus migraciones definen entidades para:

- Usuarios, roles, sesiones, verificación de correo e instituciones de solicitantes.
- Proveedores, productos, historial de precios e importaciones de proveedores.
- Importaciones y referencias del catálogo oficial de precios del INE.
- Solicitudes de precio y sus productos, requisitos, adjuntos, proveedores propuestos, comisiones y cotizaciones asociadas a los formularios S.00, S.11, S.21 y S.22.

La migración de identidad conserva las asignaciones existentes al transformar el rol genérico `USUARIO` en `SOLICITANTE`. Los importes de referencia utilizan precisión decimal para preservar los valores de la fuente.

El esquema de persistencia no implica que cada entidad tenga una ruta HTTP disponible. Los endpoints de registro, verificación de correo, invitaciones, administración y formularios todavía no forman parte de la API implementada.

### Importación del catálogo INE

El catálogo puede procesarse mediante el comando de consola `npm run import:ine`. El importador acepta archivos XLSX, verifica extensión, firma y tamaño, conserva filas y encabezados originales y registra los valores normalizados y sus observaciones. Las modalidades no reconocidas quedan disponibles para revisión; la deduplicación de cargas idénticas se basa en SHA-256, no en NOG.

```powershell
npm run import:ine -- --archivo "C:\ruta\al\catalogo.xlsx" --usuario-id <uuid-del-actor>
```

El parámetro `--usuario-id` es opcional para una carga técnica. La importación se ejecuta por consola; no hay una ruta HTTP de carga de archivos.

### Componentes de integración y autorización

El proyecto incluye un adaptador SMTP configurable y componentes compartidos para autorización por rol y propiedad de recursos. Estos componentes constituyen la base técnica para los flujos de negocio; las rutas HTTP de invitaciones, administración y solicitudes no están incluidas en la versión actual.

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

La especificación describe los endpoints implementados de salud y autenticación. Puede importarse en Postman desde la URL JSON. En producción, mantén la documentación deshabilitada salvo que su acceso esté protegido.

## Pruebas y calidad

```powershell
npm run build
npm test -- --maxWorkers=1
npm run test:e2e -- --maxWorkers=1
npm run lint
npx prisma validate
```

## Estructura principal

```text
backend/
  docs/                 Documentación del modelo y del proyecto
  infra/                Docker Compose e inicialización de PostgreSQL
  prisma/               Esquema y migraciones
  src/
    common/             Contexto de autenticación y autorización compartida
    infrastructure/     Base de datos, correo, seguridad y OpenAPI
    modules/             Módulos de salud, autenticación e importación INE
    scripts/             Comandos operativos
  test/                  Pruebas unitarias y de extremo a extremo
```

El [modelo de datos](./docs/modelo-datos.md) describe entidades y decisiones de normalización. La definición completa de campos y relaciones está en [schema.prisma](./prisma/schema.prisma); los contratos HTTP publicados corresponden a las rutas documentadas por OpenAPI.
