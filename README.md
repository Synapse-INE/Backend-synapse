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
  prisma/                   Esquema y migraciones
  src/
    infrastructure/
      database/             Conexión y servicio de Prisma
    modules/
      health/               Estado de la API
      auth/                 Sesiones, JWT y guards reutilizables
      invitaciones/         Módulo inicial
      auditoria/            Módulo inicial
      adjuntos/             Módulo inicial
      integraciones/        Módulo inicial
      referencias-ine/      Importación y normalización del catálogo oficial
  test/                     Pruebas de extremo a extremo
```

Los módulos identificados como iniciales definen la estructura de NestJS; sus operaciones HTTP aún no están implementadas.

## Alcance implementado

- Aplicación NestJS con prefijo global `/api/v1` y endpoint `GET /salud`.
- Validación de configuración al inicio: entorno, puerto, orígenes CORS y conexión a PostgreSQL.
- Validación global de solicitudes con rechazo de propiedades no declaradas.
- Helmet con Content Security Policy, protección contra framing, `X-Content-Type-Options`, `Referrer-Policy` y HSTS en producción.
- Límite general de 100 solicitudes por minuto.
- Autenticación con Argon2id, access token de 15 minutos en cookie `HttpOnly`, refresh token rotativo persistido y detección de reutilización.
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` y `GET /auth/csrf`; CORS con credenciales y token CSRF de doble envío validado contra la sesión.
- Guards reutilizables `JwtAccessGuard`, `RolesGuard`, `CsrfGuard`, decoradores `@Roles()` y `@Autorizado()`; los roles se revalidan desde la base de datos en cada solicitud protegida.
- Errores HTTP en formato Problem Details con un `code` estable.
- Esquema Prisma y migraciones para usuarios, roles, proveedores, invitaciones, verificación de correo y bitácora.
- Catálogo de productos de proveedor con historial de precios e importaciones con filas fuente y estado de validación.
- Importaciones del catálogo del INE con conservación de encabezados y filas originales, modalidades canónicas y sus alias.
- Importador CLI XLSX para el catálogo INE: valida firma, tamaño y encabezados, conserva ambas columnas `Modalidad`, normaliza datos a staging y marca observaciones sin eliminar la fuente.
- Solicitudes vinculadas a una cuenta, con modalidad, productos, código SIGES y adjuntos tipificados.
- Persistencia para empresas propuestas por producto en Subasta Electrónica Inversa y expedientes de comisión, representantes y cotizaciones para bienes importados.
- Roles iniciales `ADMIN`, `TRABAJADOR_INE`, `PROVEEDOR` y `USUARIO`; tipos canónicos iniciales para modalidad de compra.
- Importes `DECIMAL(14,3)` para conservar la precisión observada en el catálogo oficial.
- Fechas de creación y actualización separadas de las fechas declaradas por las fuentes; PostgreSQL actualiza `updated_at` mediante triggers.
- Compose con PostgreSQL 16 y las extensiones `pg_trgm`, `unaccent` y `vector`.
- Pruebas unitarias y de extremo a extremo para el endpoint de salud.

## Pendiente

Aunque las entidades ya están definidas, todavía faltan los servicios HTTP de registro, verificación de correo, invitaciones, autorización por propietario del proveedor, adjuntos y gestión de solicitudes. El importador actual se ejecuta por CLI, no expone aún una carga HTTP. Los límites por usuario, Turnstile, correo, búsqueda web, proveedores de IA, análisis y generación de informes también están pendientes.

La normalización y los atributos de cada entidad se documentan en [docs/modelo-datos.md](./docs/modelo-datos.md). El catálogo perfilado tiene 7,788 filas; sus dos columnas `Modalidad` coinciden y NOG se repite, por lo que se conservan los datos originales sin usar NOG como clave. El esquema define persistencia, no los servicios de validación ni el reemplazo de la entrega física que exige el INE.

Antes de habilitar tráfico real detrás de un proxy, hay que configurar y verificar la obtención de la IP del cliente. El límite actual es general y no sustituye los controles específicos por usuario o por operación.

## Importar el catálogo INE

Con la base de datos migrada y las variables del archivo `.env` configuradas, importa un XLSX mediante:

```powershell
npm run import:ine -- --archivo "C:\Users\Carlos\Downloads\INE-Precios de Referencia.xlsx" --usuario-id <uuid-del-actor>
```

`--usuario-id` es opcional para una carga técnica. El hash SHA-256 hace idempotente una repetición exacta del mismo archivo; si ya existe, el comando devuelve el resumen del lote previo. Las filas con observaciones se conservan en staging y las referencias sin un importe válido quedan fuera de futuras estadísticas de precios.

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
