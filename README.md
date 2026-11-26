# Synapse — Portal de Precios de Referencia

> **Demo en línea:** [synapse.realiquezisaac.workers.dev](https://synapse.realiquezisaac.workers.dev/)

Plataforma para consultar precios de referencia y gestionar solicitudes de investigación de precios. La solución incluye una interfaz web en React y Vite, una API en NestJS y una base de datos PostgreSQL administrada con Prisma.

La API se aloja en el plan gratuito de Render y puede suspenderse tras un período de inactividad. Si la primera carga tarda hasta un minuto, espere y vuelva a cargar la página.

## Problema que resuelve y público objetivo

El portal centraliza la consulta del catálogo de precios de referencia del INE y la gestión de solicitudes de investigación de precios. El personal autorizado puede tramitar expedientes, documentar consultas y validaciones, y generar exportaciones. Está dirigido a personal del INE —administración, jefaturas y analistas—, proveedores y entidades solicitantes.

La plataforma apoya los procesos de consulta y gestión; no sustituye las decisiones del personal del INE ni determina automáticamente un precio oficial. Los datos deben interpretarse conforme a las definiciones y metadatos publicados por el INE.

### Acceso a la demo

Las cuentas siguientes son de demostración y pertenecen a una base de evaluación. No las utilice para información real. Copie y pegue cada contraseña sin espacios adicionales.

| Rol | Correo | Contraseña |
|---|---|---|
| Administración | `demo.admin@evaluacion.invalid` | `1p;05H72!y;c` |
| Jefatura | `demo.jefe@evaluacion.invalid` | `C7a34J+A!UUF` |
| Analista | `demo.analista@evaluacion.invalid` | `18D0bL8nug!n` |
| Proveedor | `demo.proveedor@evaluacion.invalid` | `)58!)-W@d2CT` |
| Solicitante | `demo.solicitante@evaluacion.invalid` | `o%)1531%>I_=` |

### Datos utilizados

| Conjunto de datos | Uso | Procedencia y fecha |
|---|---|---|
| Catálogo oficial de precios de referencia del INE, en formato Excel | Fuente principal para las búsquedas de productos y precios de referencia del portal. | Portal público del [INE](https://www.ine.gob.gt/). El archivo importado se descargó el lunes 23 de noviembre de 2026. |
| Registros de evaluación | Cuentas sintéticas para probar los distintos permisos y flujos. | Base de evaluación; no representa personas ni entidades reales. |

## Despliegue de la demo

### Arquitectura

```text
Navegador
  └─ Cloudflare Workers + Static Assets (React/Vite)
       └─ /api/* → Worker reenvía las solicitudes a la API NestJS en Render
                      ├─ PostgreSQL 18 con pgvector en Neon
                      └─ Brevo (SMTP, puerto 2525) → destinatarios de los correos
```

El reenvío de `/api/*` permite que el navegador use el mismo dominio para la interfaz y la API, lo cual es necesario para las cookies de sesión. El frontend se sirve como archivos estáticos; la API, la base de datos y el servicio de correo se alojan por separado.

### Tecnologías del despliegue

| Tecnología | Uso |
|---|---|
| Cloudflare Workers y Static Assets | Publicación del frontend y reenvío de `/api/*` a la API. |
| Wrangler 4 | Herramienta de despliegue en Cloudflare. |
| React y Vite | Interfaz web. |
| NestJS sobre Node.js | API del backend. |
| Render (Web Service gratuito) | Alojamiento de la API. Puede suspenderse por inactividad. |
| Neon (PostgreSQL 18) y pgvector | Base de datos administrada y extensión vectorial de PostgreSQL. |
| Prisma 7 | Acceso a datos, generación del cliente y migraciones. |
| GitHub | Repositorio desde el que Render obtiene el backend. |
| Brevo (SMTP relay) | Envío de correos de la aplicación mediante SMTP. |

El proyecto utiliza servicios con planes gratuitos en la nube; la disponibilidad, límites y tiempos de respuesta dependen de esos proveedores. El entorno local descrito más abajo usa PostgreSQL 16 con Docker Compose, mientras que la base desplegada usa PostgreSQL 18 en Neon.

### Despliegue de la API en Render

- Repositorio: `Synapse-INE/Backend-synapse`; rama: `develop`.
- Tipo de servicio: Web Service gratuito.
- Build: `npm ci --include=dev && npm run build`
- Start: `npm run start:prod`
- Variables configuradas: `NODE_ENV`, `NODE_VERSION`, `DATABASE_URL`, `CORS_ORIGINS`, `SESSION_TTL_SECONDS`, `SESSION_COOKIE_NAME`, `SESSION_COOKIE_SAME_SITE`, `SWAGGER_ENABLED`, `FRONTEND_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM`.

`DATABASE_URL` es una variable de entorno privada y no debe copiarse a este README ni publicarse. La API usa la conexión con pooler de Neon; para migraciones e importación se emplea la conexión directa, sin `-pooler`.

### Despliegue del frontend en Cloudflare Workers

El Worker reenvía las rutas de API al servicio de Render (`https://synapse-api-ug91.onrender.com`). La configuración de assets de Wrangler sirve `dist` como aplicación de página única y ejecuta el Worker primero para `/api/*`. En producción, `.env.production` define `VITE_API_URL=/` para que el frontend use el mismo dominio.

Desde la carpeta `Frontend-Synapse`:

```powershell
npm ci
npm run build
npx wrangler login
npx wrangler deploy
```

La URL pública del frontend es `https://synapse.realiquezisaac.workers.dev/`. Configure `CORS_ORIGINS` en Render con ese origen, sin `/` al final.

### Base de datos desplegada en Neon

La base de evaluación se creó como `synapse_demo` en AWS US East 1 y utiliza la extensión `vector`. En el despliegue se aplicaron las migraciones con `npm run db:migrate:deploy` y se prepararon cuentas con `npm run seed:demo` y las variables de entorno `DEMO_SEED_*` y `DEMO_*_PASSWORD`. La importación del catálogo se ejecuta desde una computadora con el repositorio del backend; el archivo XLSX no se sube a Render.

No agregue cadenas de conexión, contraseñas de la base ni llaves de acceso al repositorio o a este documento.

### Envío de correos con Brevo

La API genera los mensajes de la aplicación —por ejemplo, los enlaces de verificación de cuenta— y los envía a Brevo mediante SMTP. El plan gratuito de Render bloquea la salida por los puertos SMTP 25, 465 y 587; Brevo admite el puerto 2525, por lo que puede usarse sin cambiar el código de la aplicación.

Para configurar el servicio:

1. Cree una cuenta en Brevo y verifique el número de teléfono.
2. Verifique la dirección que se utilizará como remitente.
3. En la configuración SMTP de Brevo, obtenga el valor de inicio de sesión y genere una clave SMTP.
4. En Render, defina estas variables de entorno para el servicio de la API:

   ```dotenv
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=2525
   SMTP_SECURE=false
   SMTP_USER=<login-smtp-de-brevo>
   SMTP_PASSWORD=<clave-smtp-de-brevo>
   SMTP_FROM=Portal de Precios <remitente-verificado>
   FRONTEND_URL=https://synapse.realiquezisaac.workers.dev
   ```

`SMTP_USER` es el inicio de sesión SMTP de Brevo, no la dirección del remitente. `SMTP_PASSWORD` es una credencial secreta y no debe subirse al repositorio. `SMTP_FROM` debe utilizar una dirección verificada. Guarde los cambios y redespliegue la API.

Los mensajes pueden llegar a la carpeta de spam. El plan gratuito de Brevo permite hasta 300 envíos al día. Las cuentas `@evaluacion.invalid` son direcciones reservadas y no reciben correo; para probar los flujos de correo se necesita una dirección real.

### Limitaciones conocidas de la demo

- Turnstile usa una clave de prueba, sin protección real contra bots.
- No se configuró almacenamiento persistente para adjuntos. Si se guardan en disco, pueden perderse cuando el servicio se reinicia o se suspende.


### Importar el catálogo Excel en producción

La importación se ejecuta desde una computadora con el repositorio del backend; el archivo no se sube a Render. Los siguientes comandos son para PowerShell.

**Requisitos:** dependencias instaladas (`npm ci`), cliente de Prisma generado (`npm run db:generate`), migraciones aplicadas y archivo `.xlsx` con los encabezados en la fila 2 y los datos desde la fila 3. Se lee la primera hoja del libro.

**Columnas obligatorias:** Correlativo, Modalidad, NOG, Evento, Producto, Características, Presentación, Precio de referencia Q, Fecha de publicación, Categoría y Vigencia hasta.

1. Entrar a la carpeta del backend:

   ```powershell
   cd <ruta-del-proyecto>\backend
   ```
2. Definir `DATABASE_URL` con la conexión **directa** (sin `-pooler`) a la base `synapse_demo`. No pegue ni guarde el valor de conexión en el README:

   ```powershell
   $env:DATABASE_URL="<conexion-directa-de-neon>"
   ```
3. Verificar el destino. El host debe terminar en `neon.tech` sin `-pooler` y la ruta debe ser `/synapse_demo`:

   ```powershell
   ([uri]$env:DATABASE_URL).Host
   ([uri]$env:DATABASE_URL).AbsolutePath
   ```
4. Antes de importar, comprobar en `src/modules/referencias-ine/importador-ine.service.ts` que la transacción de cada lote dentro de `importar` termina con estas opciones:

   ```typescript
   return { aceptadas, observaciones, rechazadas };
   }, { maxWait: 20000, timeout: 600000 });
   ```

   El límite predeterminado de 5 segundos puede ser insuficiente para una transacción con una base remota.
5. Ejecutar la importación:

   ```powershell
   npm run import:ine -- --archivo "C:\ruta\al\catalogo.xlsx"
   ```
6. Espere a que finalice sin cerrar la terminal. El comando no muestra progreso; en Neon se puede observar cómo aumentan las filas de importación en bloques de 100.
7. Revise el resultado en la terminal y en la aplicación publicada. El estado `PARCIAL` indica filas con observaciones o rechazadas.

**Si la importación falla:** el importador reconoce cada archivo por su contenido. Si ya existe un registro de ese archivo, incluso con estado `FALLIDA`, no lo vuelve a cargar. Los lotes completados antes del error permanecen guardados. Antes de reintentar, revise y elimine el registro fallido y sus filas asociadas únicamente en la base correcta; no ejecute dos importaciones del mismo archivo a la vez.

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
| `PATCH` | `/solicitudes/:id`                         | Edita un borrador o una subsanación.                               | `SOLICITANTE` autor, sesión y CSRF   |
| `POST`  | `/solicitudes/:id/enviar`                  | Valida y envía la solicitud al INE.                                | `SOLICITANTE` autor, sesión y CSRF   |
| `POST`  | `/solicitudes/:id/estado`                  | Avanza el expediente o lo rechaza.                                 | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |
| `POST`  | `/solicitudes/:id/asignar`                 | Asigna el expediente a personal activo del INE.                    | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |
| `POST`  | `/solicitudes/:id/comentarios`             | Agrega una observación o devuelve el expediente.                   | Sesión y CSRF                        |
| `POST`  | `/solicitudes/:id/reenviar`                | Reenvía la corrección al INE.                                      | `SOLICITANTE` autor, sesión y CSRF   |
| `POST`  | `/solicitudes/:id/consultas`               | Registra una boleta de investigación.                              | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |
| `PATCH` | `/solicitudes/:id/consultas/:consultaId`   | Corrige una boleta y conserva el valor anterior en el historial.  | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |
| `POST`  | `/solicitudes/:id/atipicos`                | Marca o retira un precio atípico.                                  | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |
| `POST`  | `/solicitudes/:id/validaciones`            | Registra el precio que confirma el analista.                       | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |
| `POST`  | `/solicitudes/:id/informes`                | Crea un borrador de informe u oficio.                              | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |
| `POST`  | `/solicitudes/:id/informes/:informeId/emitir` | Emite ese borrador.                                             | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |
| `POST`  | `/solicitudes/:id/entregas`                | Registra una entrega con su constancia.                            | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |
| `GET`   | `/fuentes-consulta`                        | Lista el registro de fuentes de Guatemala.                         | `TRABAJADOR_INE`/`ADMIN`, sesión     |
| `POST`  | `/fuentes-consulta`                        | Agrega una fuente con dominio `.gt`, si lo tiene.                  | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |
| `PATCH` | `/fuentes-consulta/:id`                    | Actualiza o desactiva una fuente.                                  | `TRABAJADOR_INE`/`ADMIN`, sesión y CSRF |
| `GET`   | `/referencias-ine`                         | Busca en el catálogo interno importado.                            | `TRABAJADOR_INE`/`ADMIN`, sesión     |
| `GET`   | `/personal-ine`                            | Lista el personal activo que puede recibir un expediente.          | `TRABAJADOR_INE`/`ADMIN`, sesión     |
| `GET`   | `/notificaciones`                          | Lista los avisos de quien inició sesión.                           | Sesión                               |
| `POST`  | `/notificaciones/:id/leer`                 | Marca un aviso propio como leído.                                  | Sesión y CSRF                        |
| `POST`  | `/notificaciones/leer-todas`               | Marca como leídos los avisos propios pendientes.                   | Sesión y CSRF                        |

Esta tabla lista los endpoints principales; el contrato completo son **96 operaciones**, todas descritas en el documento OpenAPI (ver más abajo), incluidas las de adjuntos, colaboradores, pausa y cancelación de solicitudes. 

Endpoints de cuentas, administración, formularios y catálogo añadidos al cerrar el backend:

| Método   | Ruta                                                              | Descripción                                                              | Acceso                                  |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| `GET`    | `/salud/listo`                                                    | Readiness: comprueba PostgreSQL (503 si no responde).                    | Público                                 |
| `POST`   | `/auth/olvide-contrasena`                                         | Pide un enlace de restablecimiento (202 genérico).                       | Público                                 |
| `POST`   | `/auth/restablecer-contrasena`                                    | Elige nueva contraseña con el token; cierra todas las sesiones.          | Público con token                       |
| `POST`   | `/auth/cambiar-contrasena`                                        | Cambia la contraseña con la actual; cierra las demás sesiones.           | Sesión y CSRF                           |
| `POST`   | `/administracion/usuarios`                                        | Crea personal del INE (`ADMIN`, `JEFE`, `TRABAJADOR_INE`) con enlace de activación. | `ADMIN`, sesión y CSRF        |
| `GET`    | `/administracion/usuarios/:id`                                    | Detalle de una cuenta.                                                   | `ADMIN`                                 |
| `POST`   | `/administracion/usuarios/:id/bloquear` y `/desbloquear`          | Bloquea (revoca sesiones) o desbloquea una cuenta.                       | `ADMIN`, sesión y CSRF                  |
| `PUT`    | `/administracion/usuarios/:id/roles`                              | Reemplaza los roles de una cuenta.                                       | `ADMIN`, sesión y CSRF                  |
| `GET`    | `/administracion/auditoria`                                       | Bitácora con filtros por actor, acción, recurso, IP y fechas.            | `ADMIN`                                 |
| `GET/POST` | `/solicitudes/:id/requisitos` (+ `PATCH`/`DELETE` `/:requisitoId`) | Requisitos del producto; la entidad edita, el INE decide en `/:requisitoId/decision`. | Autor / personal INE      |
| `GET/POST` | `/solicitudes/:id/proveedores-propuestos` (+ `PATCH`/`DELETE`)   | Empresas propuestas por producto (S.11); el INE confirma o descarta en `/:propuestoId/decision`. | Autor / personal INE |
| `GET`    | `/solicitudes/:id/importacion`                                    | Comisión, representantes, cotizaciones y justificaciones (S.21/S.22).    | Sesión                                  |
| `PUT`    | `/solicitudes/:id/importacion/representantes/:tipo`               | Representante `TITULAR` o `SUPLENTE`.                                    | Autor, sesión y CSRF                    |
| `POST`   | `/solicitudes/:id/importacion/cotizaciones` (+ `DELETE`)          | Cotizaciones de importación con FOB, flete, seguro y otros gastos.       | Autor, sesión y CSRF                    |
| `POST`   | `/solicitudes/:id/importacion/estado-comision`                    | Estado de la comisión (`EN_CONFORMACION`, `CONFORMADA`, `FINALIZADA`).   | Personal INE, sesión y CSRF             |
| `GET/POST` | `/solicitudes/:id/justificaciones` (+ `DELETE` `/:justificacionId`) | Justificaciones firmadas por la autoridad.                             | Autor, sesión y CSRF                    |
| `GET/POST` | `/importaciones-ine`                                            | Lista las importaciones y carga un libro XLSX (multipart, máx. 50 MB).   | `ADMIN`, sesión y CSRF                  |
| `GET`    | `/importaciones-ine/:id/filas`                                    | Filas de una importación, p. ej. `?estado=REVISAR`.                      | `ADMIN`                                 |
| `POST`   | `/importaciones-ine/:id/reprocesar`                               | Reaplica los alias confirmados a las filas almacenadas.                  | `ADMIN`, sesión y CSRF                  |
| `GET/PATCH` | `/alias-modalidad` y `/alias-modalidad/:id`                    | Lista y confirma o descarta alias de modalidad pendientes.               | `ADMIN`, sesión y CSRF                  |

Exportación del catálogo de precios (`JEFE`, `TRABAJADOR_INE`, `ADMIN`; sesión, sin CSRF por ser `GET`):

| Método | Ruta                              | Descripción                                                                                   |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET`  | `/exportaciones/precios/datos`    | JSON con filas y columnas para que el frontend genere su propio PDF (máx. 20 000 filas).       |
| `GET`  | `/exportaciones/precios/excel`    | Descarga `.xlsx` con hoja `Precios` y hoja `Información` (máx. 50 000 filas).                  |
| `GET`  | `/exportaciones/precios/pdf`      | Descarga PDF horizontal con filtros y paginación (máx. 3 000 filas).                           |

Filtros comunes (query): `texto`, `categoria`, `producto`, `nog`, `fecha` (día exacto, no se combina con el rango), `desde`, `hasta` (`AAAA-MM-DD`) y `soloVigentes=true`. Solo se exportan referencias con precio. Si la consulta supera el máximo del formato responde 422 `EXPORTACION_DEMASIADO_GRANDE` en lugar de truncar en silencio. Los precios van como cadena decimal con tres decimales (en Excel, como número). Las celdas de texto que empiezan con `=`, `+`, `-` o `@` se neutralizan contra la inyección de fórmulas. Cada exportación queda en la auditoría (`EXPORTACION_PRECIOS`) con formato, número de filas, filtros e IP.

Reglas de los formularios: solo el autor modifica requisitos, empresas, representantes, cotizaciones y justificaciones, y solo con la solicitud en borrador o devuelta; las decisiones son del personal del INE. Al **enviar**, en Subasta Electrónica Inversa cada producto necesita al menos tres empresas propuestas no descartadas, y en Bienes y Suministros Importados hacen falta representante titular y suplente y tres cotizaciones por producto, salvo una justificación `COTIZACIONES_INSUFICIENTES`. Los importes viajan como cadenas decimales. El mínimo de tres por producto es una decisión asumida que el INE debe confirmar.

La autenticación utiliza sesiones opacas almacenadas en PostgreSQL. El navegador recibe el token de sesión mediante una cookie `HttpOnly`; la base de datos conserva su hash, no el valor original. Las contraseñas se verifican con Argon2id. Las solicitudes autenticadas que modifican estado requieren protección CSRF.

La API valida los DTO de entrada y rechaza propiedades no declaradas. Aplica un límite general de 100 solicitudes por minuto y de cinco intentos de inicio de sesión por minuto. Helmet configura cabeceras de seguridad; CORS permite credenciales solo desde los orígenes configurados. La confianza en proxies se limita a rangos CIDR definidos por configuración.

### Persistencia y datos de dominio

El esquema Prisma y sus migraciones definen entidades para:

- Usuarios, roles, sesiones, verificación de correo e instituciones de solicitantes.
- Proveedores, productos, historial de precios e importaciones de proveedores.
- Importaciones y referencias del catálogo oficial de precios del INE.
- Solicitudes de precio y sus productos, requisitos, adjuntos, proveedores propuestos, comisiones y cotizaciones asociadas a los formularios S.00, S.11, S.21 y S.22.

La migración de identidad conserva las asignaciones existentes al transformar el rol genérico `USUARIO` en `SOLICITANTE`. Los importes de referencia utilizan precisión decimal para preservar los valores de la fuente.

El esquema de persistencia no implica que cada entidad tenga una ruta HTTP disponible. Las rutas implementadas se describen en las tablas de API de este README y en el contrato OpenAPI; las entidades sin una ruta documentada no deben considerarse accesibles por HTTP.

### Importación del catálogo INE

El catálogo puede procesarse mediante el comando de consola `npm run import:ine`. El importador acepta archivos XLSX, verifica extensión, firma y tamaño, conserva filas y encabezados originales y registra los valores normalizados y sus observaciones. Las modalidades no reconocidas quedan disponibles para revisión; la deduplicación de cargas idénticas se basa en SHA-256, no en NOG.

```powershell
npm run import:ine -- --archivo "C:\ruta\al\catalogo.xlsx" --usuario-id <uuid-del-actor>
```

El parámetro `--usuario-id` es opcional para una carga técnica. Este comando permite importar desde consola. Además, la API ofrece la ruta administrativa `POST /api/v1/importaciones-ine` para cargar un libro XLSX; la ruta y el CLI registran y procesan importaciones, pero esta guía de despliegue describe el uso del CLI desde la computadora del equipo.

### Componentes de integración y autorización

El proyecto incluye un adaptador SMTP configurable y componentes compartidos para autorización por rol y propiedad de recursos. Los flujos de correo requieren que SMTP esté configurado; en la demo se utiliza Brevo mediante el puerto 2525.

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

### Cuentas para evaluación

El perfil opcional `evaluation` crea cuentas sintéticas para los cinco roles del sistema: `ADMIN`, `JEFE`, `TRABAJADOR_INE`, `PROVEEDOR` y `SOLICITANTE`. Los usuarios proveedor y solicitante reciben también sus relaciones de perfil necesarias para acceder a las vistas correspondientes. Sus correos usan el dominio reservado `.invalid` y no reciben mensajes.

Este seed no se ejecuta al iniciar la API. Para usarlo, configura secretos únicos de al menos 12 caracteres en las variables `DEMO_*_PASSWORD`, define `POSTGRES_DB` y `DEMO_SEED_DATABASE_NAME` con el mismo nombre dedicado terminado en `_evaluation` o `_demo`, y establece:

```dotenv
DEMO_SEED_ENABLED=true
DEMO_SEED_ENVIRONMENT=isolated-evaluation
DEMO_SEED_CONFIRMATION=SEED_ISOLATED_EVALUATION_DATABASE
```

Desde la carpeta `backend`, ejecuta `docker compose -p synapse-evaluation --env-file .env -f infra/docker-compose.yml --profile evaluation up --build -d` solo con una base y volumen dedicados. El nombre del proyecto mantiene los volúmenes separados del despliegue normal; si ya hay otro backend local, deténlo antes porque ambos usan los puertos 3000 y 5432. El seed crea las cuentas una vez; en ejecuciones posteriores verifica el estado y los roles sin cambiar contraseñas ni reparar registros alterados. El perfil normal de Compose no ejecuta esta tarea. No habilites estas variables para una base compartida o con datos reales.

Para desarrollo local con menos consumo de memoria, configura un archivo ignorado `.env.evaluation` con `POSTGRES_PORT=5433`, las variables anteriores, credenciales distintas por rol y `DATABASE_URL` apuntando a `localhost:5433`. Inicia solo PostgreSQL con `docker compose -p synapse-evaluation --env-file .env.evaluation -f infra/docker-compose.yml up -d database`. Una vez, carga el archivo en el entorno de PowerShell y ejecuta:

```powershell
Get-Content .env.evaluation | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2], 'Process')
  }
}
npm run db:generate
npm run db:migrate:deploy
npm run seed:demo
```

Para iniciar o reiniciar la API después, usa `npm run start:evaluation`. Así se mantiene la API local en el puerto 3000 sin reconstruir su imagen.

### Solicitudes de precio (S.00)

| Método y ruta | Rol | Descripción |
|---|---|---|
| `POST /api/v1/solicitudes` | `SOLICITANTE` | Crea un borrador ligado al usuario y a su institución; admite cabecera y lista de productos. |
| `GET /api/v1/solicitudes` · `GET /api/v1/solicitudes/:id` | Todos los roles de trabajo | El solicitante ve sus borradores y lo enviado por su institución; el personal del INE ve lo enviado. Lo ajeno responde 404. |
| `PATCH /api/v1/solicitudes/:id` | `SOLICITANTE` autor | Edita un `BORRADOR` o un expediente en `PENDIENTE_SUBSANACION`; si se envía `productos`, reemplaza la lista. |
| `POST /api/v1/solicitudes/:id/enviar` | `SOLICITANTE` autor | Valida la cabecera y cada producto (especificaciones, unidad y cantidad > 0). Si falta algo responde 422 `SOLICITUD_INCOMPLETA` con `errors[{field,message}]`. |
| `POST /api/v1/solicitudes/:id/estado` | `TRABAJADOR_INE`, `ADMIN` | `RECIBIDA → EN_REVISION → EN_INVESTIGACION → EN_ANALISIS → EN_INFORME → EN_ENTREGA → COMPLETADA`, y `RECHAZADA` desde esas etapas. |
| `POST /api/v1/solicitudes/:id/asignar` | `JEFE`, `ADMIN` | El jefe asigna el expediente a un trabajador activo. No cambia el estado. |
| `POST /api/v1/solicitudes/:id/comentarios` | Roles de trabajo | Observación visible. Solo el INE escribe notas internas o devuelve (`devolver: true` → `PENDIENTE_SUBSANACION`). |
| `POST /api/v1/solicitudes/:id/reenviar` | `SOLICITANTE` autor | Vuelve a validar y pasa de `PENDIENTE_SUBSANACION` a `RECIBIDA`. Conserva responsable y fecha del primer envío. |
| `POST /api/v1/solicitudes/:id/consultas` | `TRABAJADOR_INE`, `ADMIN` | Boleta en `EN_INVESTIGACION` o `EN_ANALISIS`. La fuente tiene que estar activa. El precio lo escribe la persona. |
| `PATCH /api/v1/solicitudes/:id/consultas/:consultaId` | `TRABAJADOR_INE`, `ADMIN` | Corrige la boleta. El valor anterior queda en el historial y no modifica el precio ya confirmado. |
| `GET /api/v1/personal-ine` | `JEFE`, `TRABAJADOR_INE`, `ADMIN` | Identificador y nombre de los trabajadores activos, para que el jefe elija responsable. |
| `GET /api/v1/notificaciones` | Roles de trabajo | Avisos propios. Quien hizo la acción no se avisa. Una nota interna no llega a la entidad. |
| `POST /api/v1/solicitudes/:id/validaciones` | `TRABAJADOR_INE`, `ADMIN` | Precio oficial del analista en `EN_ANALISIS`. `confirmar: true` lo deja vigente. No hay fórmula. |
| `POST /api/v1/solicitudes/:id/informes` y `.../emitir` | `TRABAJADOR_INE`, `ADMIN` | Borrador y emisión humana de informe técnico u oficio. El destinatario es texto. |
| `POST /api/v1/solicitudes/:id/entregas` | `TRABAJADOR_INE`, `ADMIN` | Entrega `DIGITAL`, `FISICA` o `CD`, con destinatario y constancia textual. El PDF de constancia es opcional. |
| `POST /api/v1/solicitudes/:id/pausar` · `/reanudar` | `TRABAJADOR_INE`, `ADMIN` | Pausa interna `EN_ESPERA`. Reanudar vuelve al estado anterior. No es una devolución a la entidad. |
| `POST /api/v1/solicitudes/:id/cancelar` | `SOLICITANTE` autor | Anula un expediente enviado que todavía no está en entrega ni cerrado. |
| `DELETE /api/v1/solicitudes/:id` | `SOLICITANTE` autor | Elimina un `BORRADOR`. Un expediente enviado no se borra. |
| `POST` · `DELETE /api/v1/solicitudes/:id/colaboradores` | `JEFE`, `ADMIN` | El jefe suma un trabajador que trabaja el expediente junto al responsable. |
| `POST` · `GET` · `DELETE /api/v1/solicitudes/:id/adjuntos` | Según el archivo | PDF de hasta 10 MB. El de la solicitud solo en `BORRADOR`. La evidencia y la constancia no bloquean el avance. |
| `GET /api/v1/referencias-ine?texto=` | `TRABAJADOR_INE`, `ADMIN` | Búsqueda del catálogo ya importado. No adopta el precio. |
| `GET`/`POST`/`PATCH /api/v1/fuentes-consulta` | `TRABAJADOR_INE`, `ADMIN` | Registro de fuentes. El dominio, si existe, termina en `.gt`. |

Cada solicitud enviada tiene un tiempo de atención de 15 días corridos, contados desde el envío en hora de Guatemala. No es una meta ni dispara recordatorios: al cumplirse queda vencida y el expediente se puede seguir trabajando. Los días en que la entidad corrige no consumen ese tiempo. Una pausa interna del INE sí cuenta, porque quien solicitó sigue esperando. La bandeja del INE muestra primero lo que lleva más tiempo esperando. El campo `atencion` trae la fecha límite, los días restantes y la situación.

Cada solicitud nace con código `PR-año-######`. El detalle incluye comentarios (las notas internas solo las ve el INE) e historial; ese historial no se borra al corregir ni al reenviar. Para pasar a informe, cada producto necesita un precio confirmado por el analista. Para pasar a entrega, basta con emitir el documento del expediente: reúne el informe técnico, el oficio y la estadística. La gráfica se congela en ese momento. Para completar, hace falta al menos una entrega. La entidad ve los documentos emitidos y las entregas cuando el expediente queda `COMPLETADA`. Un borrador puede estar incompleto; solo al enviar o reenviar se exigen modalidad, unidad ejecutora, fecha del formulario, enlace, autoridad y productos. Las cantidades y los precios viajan como cadena decimal y la fecha como `YYYY-MM-DD`.

Supuestos de esta etapa, porque el INE no confirmó plantilla ni fórmula: el resumen del informe es un borrador editable, no un formato oficial; la evidencia de la boleta y la constancia en PDF se pueden adjuntar, pero su ausencia no frena el expediente; marcar un atípico es una decisión de la persona; el destinatario no queda fijo en DIGAE ni en DGAE. Los formularios S.11, S.21 y S.22 siguen pendientes.

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

## Operación

- **Primer administrador:** `npm run crear-admin -- --email <correo> [--nombre "<nombre>"]`. La contraseña se pide por entrada oculta (o se toma de `ADMIN_PASSWORD`); nunca va por argumento ni se imprime. El comando se niega si ya existe un administrador, y el resto de las cuentas del personal se crean desde `POST /administracion/usuarios`.
- **Recuperación de cuenta:** el enlace de restablecimiento vence a las `RESET_TOKEN_TTL_HOURS` (1 por defecto), es de un solo uso e invalida los anteriores; el de activación de personal vence con `INVITATION_TTL_HOURS`.
- **Salud:** `GET /salud` indica que el proceso vive; `GET /salud/listo` además comprueba PostgreSQL y es la sonda de disponibilidad (la imagen la usa como `HEALTHCHECK`).
- **Trazabilidad de peticiones:** cada respuesta lleva `x-request-id` (se conserva el que envíe el proxy si es válido) y se registra una línea JSON por petición con método, ruta sin parámetros, estado y duración; nunca cookies, cuerpos ni la cadena de consulta. Los errores no previstos devuelven un `application/problem+json` genérico (`ERROR_INTERNO`) y el detalle solo queda en el log.
- **Límite por cuenta:** además del límite por IP, tras 10 inicios de sesión fallidos en 15 minutos contra el mismo correo se responde 429 (`CUENTA_LIMITADA`).
- **Imagen de producción:** el `Dockerfile` corre como usuario `node`, sin `.env` en la imagen y con un volumen para los adjuntos (`ALMACENAMIENTO_DIR`); en `infra/docker-compose.yml` la API espera a que el servicio `migrate` termine.

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

La especificación describe las 96 operaciones implementadas (salud, autenticación y recuperación de cuenta, registro e invitaciones, administración, solicitudes y sus formularios, fuentes de consulta, catálogo interno y su revisión, avisos, personal del INE y catálogo de proveedores), sus esquemas de entrada generados desde los DTO, los códigos de error `application/problem+json` y los dos mecanismos de seguridad: la cookie de sesión y el encabezado `x-csrf-token`. Puede importarse en Postman desde la URL JSON. Una prueba e2e (`test/openapi.e2e-spec.ts`) falla si un endpoint nuevo no se documenta o si se documenta uno que no existe. En producción, mantén `SWAGGER_ENABLED=false` salvo que la documentación esté protegida.

## Pruebas y calidad

```powershell
npm run build
npm test -- --maxWorkers=1
npm run test:e2e -- --maxWorkers=1
npm run lint
npx prisma validate
```

## Pendiente

Lo que queda del backend (almacenamiento de adjuntos para producción, importación de productos del proveedor, búsqueda externa e IA, y las decisiones del INE que bloquean reglas). El catálogo también se puede cargar y revisar por HTTP (`/importaciones-ine`, `/alias-modalidad`), con el mismo importador del CLI.

Para enviar correo fuera de pruebas configura `SMTP_HOST` y `SMTP_FROM`; `SMTP_USER` y `SMTP_PASSWORD` son opcionales, pero deben darse juntos. `SMTP_SECURE=false` exige STARTTLS y `true` usa TLS implícito. En la demo, Brevo está configurado como relay SMTP en el puerto 2525. Antes de habilitar tráfico real detrás de un proxy, configura `TRUSTED_PROXY_CIDRS` con los rangos correctos y verifica la IP efectiva del cliente: la auditoría y los límites de peticiones dependen de ella.

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
