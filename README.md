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
      auth/                 Módulo inicial
      invitaciones/          Módulo inicial
      auditoria/            Módulo inicial
      adjuntos/             Módulo inicial
      integraciones/        Módulo inicial
  test/                     Pruebas de extremo a extremo
```

Los módulos identificados como iniciales definen la estructura de NestJS; sus operaciones de negocio aún no están implementadas.

## Alcance implementado

- Aplicación NestJS con prefijo global `/api/v1` y endpoint `GET /salud`.
- Validación de configuración al inicio: entorno, puerto, orígenes CORS y conexión a PostgreSQL.
- Validación global de solicitudes con rechazo de propiedades no declaradas.
- Helmet con Content Security Policy, protección contra framing, `X-Content-Type-Options`, `Referrer-Policy` y HSTS en producción.
- Límite general de 100 solicitudes por minuto.
- Conexión a PostgreSQL mediante Prisma y migración inicial para las tablas de invitaciones y auditoría.
- Compose con PostgreSQL 16 y las extensiones `pg_trgm`, `unaccent` y `vector`.
- Pruebas unitarias y de extremo a extremo para el endpoint de salud.

## Pendiente

Los módulos de autenticación, invitaciones, auditoría, adjuntos e integraciones aún no implementan sus operaciones. Tampoco están implementados el modelo de usuarios, roles, JWT, protección CSRF, límites por usuario, verificación de Turnstile, almacenamiento y validación de archivos, correo, búsqueda web, proveedores de IA, análisis de solicitudes ni generación de informes.

Antes de habilitar tráfico real detrás de un proxy, hay que configurar y verificar la obtención de la IP del cliente. El límite actual es general y no sustituye los controles específicos por usuario o por operación.

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

Las migraciones se mantienen en `prisma/migrations`. La migración inicial crea las tablas de invitaciones y auditoría; los cambios al esquema deben reflejarse en una migración versionada.
