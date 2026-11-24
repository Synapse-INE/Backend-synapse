# Estado del proyecto y siguientes pasos

**Corte:** 23 de noviembre de 2026
**Propósito:** compartir el alcance actual con frontend y coordinar el trabajo pendiente. La distribución se hace por carga y disponibilidad de créditos de IA, no por nombres ni por roles numerados.

## Resumen ejecutivo

El backend ya tiene una base NestJS con PostgreSQL y Prisma, y un modelo de datos que considera el catálogo oficial del INE y los formularios S.00, S.11, S.21 y S.22. Aún no están implementados los servicios de negocio, los endpoints de solicitudes ni el importador del Excel. El frontend puede comenzar a diseñar sus formularios a partir de los objetos persistidos descritos abajo, mientras se acuerdan las reglas pendientes y el contrato HTTP.

## Estado actual

| Área | Estado |
|---|---|
| Estructura | NestJS, PostgreSQL, Prisma, endpoint de salud y configuración base listos. |
| Seguridad base | Validación de solicitudes, Helmet, CORS con credenciales, límite general por IP, login con Argon2id, JWT en cookie HttpOnly, refresh rotativo, CSRF y guards de rol listos. Los controles por propietario siguen pendientes. |
| Modelo de datos | 27 modelos persistidos para identidad, proveedores, importaciones, referencias INE y solicitudes multproducto. |
| Migraciones | Esquema y migraciones preparados; aplicados en una prueba temporal compatible con PostgreSQL. |
| Excel del INE | Perfilado realizado e importador CLI XLSX disponible; conserva staging, encabezados repetidos, filas originales, alias revisables y motivos de validación. |
| Formularios oficiales | Sus campos están representados en el modelo; faltan validaciones, flujos y endpoints. |
| Frontend | Puede iniciar el diseño de formularios con el contrato de datos de este documento; no hay todavía API funcional de solicitudes. |
| Publicación | El modelo y las migraciones están confirmados en la rama de trabajo y sincronizados con su remoto. La entrega de auth e importador INE se registra en [trazabilidad.md](./trazabilidad.md) (rama `feat/auth-importerExcel`). |

Verificaciones pasadas: Prisma format/validate/generate, pruebas unitarias, pruebas E2E, build, lint y una prueba de migraciones con PGlite. La prueba no sustituye una validación contra el PostgreSQL del entorno de despliegue. La configuración de Docker Compose valida, pero no se verificó un despliegue real.

## Entregas registradas en este corte

### Autenticación, autorización y protección de solicitudes

- Se añadió `SesionAutenticacion` y la migración `20261124030000_auth_sessions`. Solo se almacenan hashes SHA-256 del refresh token y del token CSRF; un refresh rotado o reutilizado revoca las sesiones activas del usuario.
- `POST /api/v1/auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` y `GET /auth/csrf` ya están disponibles. Las contraseñas se verifican con Argon2id, el access token dura 15 minutos y tanto access como refresh se entregan en cookies `HttpOnly`, `SameSite=Strict`.
- Los endpoints son privados por defecto mediante guards globales. `GET /salud` y los pasos de inicio o renovación de sesión están marcados explícitamente como públicos. `@Autorizado(...)` compone la verificación de rol; el guard CSRF global protege toda operación insegura que no tenga una excepción explícita.
- Todas las operaciones que cambien estado requieren el header configurado `AUTH_CSRF_HEADER_NAME` con el mismo valor que la cookie CSRF; la renovación comprueba además el hash vinculado a la sesión. Los errores HTTP siguen RFC 7807 con `code` estable.
- Se añadió IP opcional a los eventos de auditoría y se auditan login, refresh y logout. El proxy solo se confía cuando `CF_TRUSTED_PROXY=true`; dicha variable debe habilitarse únicamente si el acceso directo al API está restringido.

### Importador del catálogo oficial INE

- Se añadió el comando `npm run import:ine -- --archivo <ruta.xlsx> [--usuario-id <uuid>]`. Comprueba extensión, firma ZIP/XLSX, límite de tamaño, encabezados requeridos y SHA-256 antes de crear el lote.
- Cada fila se guarda completa en `FilaImportacionINE.datosOriginales`, incluyendo las dos columnas `Modalidad`; no se deduplica por NOG, correlativo ni producto. La repetición exacta de un archivo devuelve el lote existente por hash.
- La normalización conserva los originales y usa columnas consultables para importes con tres decimales, fechas, marcadores `NA`/`Sin Dato`, modalidades canónicas y alias pendientes de revisión. Las filas con valores problemáticos quedan en `REVISAR` con códigos de validación, sin borrarlas ni forzar valores inventados.
- El proceso es deliberadamente CLI por ahora: no expone rutas de archivos del servidor ni carga multipart hasta contar con un flujo HTTP protegido, almacenamiento privado y reglas operativas confirmadas.

### Verificación de esta entrega

- Ejecutados correctamente: `prisma validate`, `npm run build`, `npm test` (7 pruebas), `npm run test:e2e` (2 pruebas), `npm run lint` y `git diff --check`.
- La prueba del importador abre el XLSX oficial compartido y procesa sus 7,788 filas con un adaptador de persistencia simulado; se comprobaron las 12 columnas fuente y los dos encabezados `Modalidad`.
- No se pudo aplicar la migración ni ejecutar el importador contra PostgreSQL real en esta estación: no hay servicio accesible en `localhost:5432` y Docker no está disponible. Antes de desplegar se debe ejecutar `npm run db:migrate:deploy` con las variables de `.env` reales y realizar una carga de aceptación.

## Hallazgos del catálogo del INE

El archivo contiene 7,788 filas de datos:

- Las columnas B y E tienen el encabezado `Modalidad` y coinciden fila por fila. Se preservarán ambas en los datos originales; para consultas se normalizará una sola modalidad.
- Se encontraron 503 cadenas originales de modalidad y 497 variantes al normalizar mayúsculas, acentos y espacios.
- NOG no es una clave: hay 526 valores distintos no vacíos ni `NA`, y 513 aparecen repetidos. Uno aparece en 451 filas.
- `Vigencia hasta` está vacía en 6,594 filas. No se debe inventar una fecha ni descartar esas referencias.
- 7,783 precios tienen tres decimales y los cinco restantes son enteros; los importes usan `DECIMAL(14,3)`.

La fila original se debe conservar completa durante la futura importación. No usar NOG, correlativo, nombre ni una combinación no verificada como clave de deduplicación.

## Dónde consultar los objetos y atributos

- [Modelo de datos y normalización](./modelo-datos.md): explicación funcional, atributos, datos faltantes, formularios y decisiones de normalización.
- [Esquema Prisma](../prisma/schema.prisma): definición persistida de modelos, enums, tipos, nulabilidad y relaciones. Los nombres `camelCase` son la referencia inicial para el contrato JSON.
- [Arquitectura de datos](../.github/modernize/assessment/engines/facts/data-architecture.md): relaciones entre entidades y límites actuales de persistencia.
- [README del backend](../README.md): alcance implementado y pendientes de la API.

### Contrato inicial para frontend

| Objeto | Uso y campos principales |
|---|---|
| `SolicitudPrecio` | Cabecera: título, institución solicitante, modalidad, unidad ejecutora, fecha del formulario, enlace solicitante, autoridad que autoriza, descripción y estado. La modalidad es nullable para compatibilidad con solicitudes antiguas; debe exigirse en altas nuevas. |
| `ProductoSolicitud` | Lista repetible por solicitud: número, nombre, código SIGES, especificaciones técnicas, unidad de medida y cantidad. La cantidad y otros datos pueden estar vacíos en borradores; validar los requeridos al enviar. |
| `RequisitoSolicitud` | Atributos estructurados para análisis: nombre, valor, unidad, modo, fuente y estado de aprobación. No sustituye a la ficha del producto solicitado. |
| `ProveedorSolicitud` | Empresa propuesta para una solicitud: nombre/razón social, NIT, dirección, teléfono y estado de confirmación del INE. |
| `ProveedorSolicitudProducto` | Relación entre una empresa propuesta y los productos que comercializa; corresponde a la matriz del S.11. |
| `ComisionImportacion` | Expediente de comisión de una solicitud de Bienes y Suministros Importados: estado y fecha de conformación. |
| `RepresentanteSolicitante` | Titular o suplente: nombre, correo, teléfono y dirección para notificaciones. |
| `CotizacionImportacion` | Datos de una cotización: proveedor extranjero, número, sitio web, contacto y fecha de consulta. |
| `CotizacionProducto` | Detalle por producto cotizado: fabricante, país de origen, moneda, precio FOB total para la cantidad solicitada, flete, seguro y otros gastos. |
| `JustificacionSolicitud` | Justificación por cotizaciones insuficientes o por no usar el catálogo SIGES, incluyendo motivo y autoridad responsable. |
| `SolicitudAdjunto` | Metadatos de un archivo privado y tipo documental. Puede relacionarse con solicitud, producto, cotización o justificación. |

Los importes y cantidades decimales deben viajar como cadenas en JSON para evitar pérdida de precisión en JavaScript. Las fechas tipo `date` deben representarse como `YYYY-MM-DD`; timestamps como ISO 8601. La API aún debe formalizar estos formatos. El diseño prevé guardar el binario en almacenamiento privado, servicio que sigue pendiente; PostgreSQL conserva únicamente su clave y metadatos.

### Cómo se relacionan los formularios con el modelo

- **S.00:** datos generales y productos de la solicitud, incluidos código SIGES, especificación, unidad y cantidad. Los campos del enlace y de la autoridad se guardan en la cabecera. La plantilla compartida presenta opciones para Subasta Electrónica Inversa y Bienes y Suministros Importados.
- **S.11:** lista empresas por producto y requiere al menos tres empresas por producto, sujeto a confirmación del INE. Se representa con `ProveedorSolicitud` y `ProveedorSolicitudProducto`.
- **S.21/S.22:** expediente de cotizaciones para bienes importados. Los precios se conservan por producto y moneda, con componentes separados; no se mezcla esta cotización con el historial de precios del catálogo de proveedores.
- **Contrato Abierto:** la nota indica que la solicitud inicial se dirige por escrito a la DGAE. El portal puede conservar una copia, pero el esquema actual no modela el proceso de la DGAE como un flujo interno del INE.
- **Entrega física:** los formatos indican entregar información digital editable e impresa; para bienes importados se menciona además CD. El portal no debe presentarse como sustituto de esa entrega.

## Decisiones que hay que confirmar antes de cerrar formularios

1. Si el mínimo de tres cotizaciones para bienes importados aplica al expediente completo o a cada producto. El esquema permite contar ambas cosas, pero no fuerza una regla no confirmada.
2. Qué experiencia y documentación se requiere en el portal para Contrato Abierto, ya que el S.00 compartido enumera Subasta e Importados y la solicitud inicial de Contrato Abierto se dirige a la DGAE.
3. Si el portal solo conservará la copia digital de entregas físicas o también registrará su fecha y estado de recepción.
4. Qué estados y autorizaciones debe poder cambiar cada rol en cada etapa.

La resolución metodológica PDF compartida solo permitió extraer texto de manera limitada; las reglas estadísticas y de redondeo deben revisarse manualmente antes de implementar medias, medianas o informes.

## Siguientes pasos

| Orden | Trabajo | Resultado esperado |
|---|---|---|
| 1 | Compartir este documento y el modelo de datos con frontend; acordar campos, enum, nulabilidad y formatos JSON. | Formularios alineados con las entidades persistidas, sin asumir endpoints inexistentes. |
| 2 | Resolver las cuatro decisiones anteriores con el equipo y, cuando corresponda, con el INE. | Reglas de envío y estados claros antes de codificar validaciones. |
| 3 | Completar registro, verificación de correo, invitaciones y autorización por propietario sobre la base de auth/guards ya implementada. | Acceso seguro completo para los demás flujos. |
| 4 | Exponer y operar el importador del catálogo INE ya implementado por CLI, si se confirma una carga HTTP segura. | Importación validable, reintentable y sin deduplicación por NOG. |
| 5 | Implementar solicitudes, productos, adjuntos privados y auditoría de cambios. | Flujo S.00 con validación de borrador/envío y acceso controlado. |
| 6 | Implementar la matriz S.11 y confirmación de empresas por producto. | Propuesta de proveedores trazable y revisable por personal autorizado. |
| 7 | Implementar el expediente de comisión y captura de cotizaciones S.21/S.22. | Representantes, documentos, cotizaciones y componentes de costo por producto. |
| 8 | Validar estadísticas, búsqueda externa, IA e informes como fases posteriores. | Resultados comparables y auditables; no mezclar cotizaciones ni fuentes sin validación. |
| 9 | Revisar seguridad, pruebas integrales, despliegue y documentación de operación. | PR revisado y versión lista para desplegar. |

## Reparto por disponibilidad de créditos de IA

La distribución propuesta evita asignar trabajo por nombres o etiquetas de puesto:

- **Flujo de implementación con mayor disponibilidad de créditos:** abordar las tareas de mayor contexto y generación de código: autenticación y guards, importador del Excel, servicios y endpoints de solicitudes, flujos S.11/S.21/S.22 y sus pruebas. Trabajar por entregas verticales pequeñas y presentar cada una para revisión; la disponibilidad de IA no sustituye validación humana.
- **Flujo de coordinación con menor disponibilidad de créditos:** compartir el contrato de datos con frontend, recopilar las decisiones pendientes, preparar casos de aceptación, revisar que los formularios correspondan a los formatos, probar manualmente los flujos y revisar los PR. Son tareas valiosas con menor consumo de IA y reducen retrabajo.
- **Equipo frontend:** avanzar en las pantallas de cabecera y lista de productos; después, separar la matriz de empresas S.11 y el expediente de cotizaciones de bienes importados. Acordar con backend los DTO y errores antes de integrar. No construir aún pantallas de IA, búsqueda web o informes como si ya existieran.

## Criterio para declarar terminada cada etapa

Cada entrega debe incluir migración si cambia la persistencia, validaciones de entrada, autorización por rol y propiedad, pruebas del flujo, documentación del contrato y una revisión de errores y archivos adjuntos. Las operaciones todavía no implementadas deben reportarse como pendientes, no como funcionalidad lista.
