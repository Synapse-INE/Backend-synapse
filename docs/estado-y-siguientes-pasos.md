# Estado del proyecto y siguientes pasos

**Corte:** 25 de noviembre de 2026
**Propósito:** compartir el alcance actual con frontend y coordinar el trabajo pendiente. La distribución se hace por carga y disponibilidad de créditos de IA, no por nombres ni por roles numerados.

## Resumen ejecutivo

El backend (NestJS, PostgreSQL y Prisma) ya cubre el acceso completo y el primer formulario oficial: inicio de sesión con sesiones opacas y CSRF, registro de solicitantes con verificación de correo y aprobación manual, invitaciones de proveedores, auditoría con IP, errores RFC 7807, solicitudes S.00 con borrador, envío validado y estados, y el importador CLI del catálogo INE validado contra PostgreSQL. Se suman recuperación y cambio de contraseña, primer administrador por comando, administración de usuarios y roles, consulta filtrada de la auditoría, el ciclo del expediente (adjuntos, informes, entregas), los formularios de requisitos, S.11 y S.21/S.22, y la carga y revisión del catálogo INE por HTTP. Las 93 operaciones están descritas en OpenAPI para que el frontend, que se desarrolla por separado, trabaje contra un contrato verificable. Lo que falta para dar el backend por terminado está priorizado en [backlog-backend.md](./backlog-backend.md).

## Estado actual

| Área | Estado |
|---|---|
| Estructura | NestJS, PostgreSQL, Prisma, endpoint de salud, Swagger opcional y configuración base listos. |
| Seguridad base | Validación de entrada, Helmet, CORS con credenciales, límites de peticiones por IP y por cuenta, sesiones opacas en cookie HttpOnly, CSRF, guard de roles y control de propiedad aplicados a las rutas de negocio. |
| Cuentas | Registro de solicitantes, verificación de correo, aprobación, invitaciones de proveedor, primer administrador por comando, recuperación y cambio de contraseña, alta de personal, bloqueo y roles. |
| Auditoría | Se escribe con actor, acción, recurso e IP y se consulta con filtros por actor, acción, recurso, IP y fechas. |
| Solicitudes S.00 | Borrador, edición, envío validado, ciclo completo del expediente, adjuntos, borrado, cancelación y avisos. Los adjuntos se guardan en disco: falta la implementación para almacenamiento de objetos en producción. |
| Formularios S.11, S.21 y S.22 | Requisitos, empresas propuestas, comisión, cotizaciones de importación y justificaciones, con las reglas de mínimo al enviar. El mínimo de tres por producto es una decisión asumida del INE. |
| Excel del INE | Importador CLI y reprocesado validados contra PostgreSQL: 7,788 filas, 7,783 normalizadas y 5 en revisión por precio `Sin Dato`. Carga, revisión de filas y alias, y reprocesado disponibles por HTTP (`ADMIN`). |
| Migraciones | Aplicadas y verificadas en PostgreSQL 16 local, sin deriva contra el esquema. Falta validarlas en el entorno de despliegue. |
| Contrato HTTP | OpenAPI con las 93 operaciones, esquemas de entrada, errores y seguridad; una prueba e2e impide documentación desactualizada. |
| Frontend | Desarrollo independiente; consume `/api/v1/openapi.json` (con `SWAGGER_ENABLED=true`). |
| Operación | CI en cada PR, readiness `/salud/listo`, `x-request-id` y registro por petición, imagen sin privilegios con `HEALTHCHECK`. Falta, en GitHub, dejar `develop` como rama por defecto y proteger `main`. |

Verificación vigente: `npm run build`, `npm run lint`, `npm test` (144 pruebas), `npm run test:e2e` (119 pruebas), `npx prisma validate` y `prisma migrate diff` sin deriva. El registro, la revisión, las invitaciones y las solicitudes se probaron además de extremo a extremo contra PostgreSQL real. El envío de correo con un SMTP real no se ha probado.

## Entregas registradas en este corte

### Autenticación, autorización y protección de solicitudes

- Se mantiene `SesionUsuario` con la migración `20261124030000_identity_access_sessions`. La base de datos conserva hashes SHA-256 de los tokens de sesión y CSRF; la cookie de sesión es `HttpOnly`, revocable y tiene expiración configurable.
- `POST /api/v1/auth/iniciar-sesion`, `GET /api/v1/auth/yo`, `GET /api/v1/auth/csrf` y `POST /api/v1/auth/cerrar-sesion` están disponibles. Las contraseñas se verifican con Argon2id y el error de credenciales es genérico.
- Las rutas son privadas por defecto. Salud e inicio de sesión son explícitamente públicos; `AuthGuard` valida sesión y CSRF para solicitudes que modifican estado. El guard de roles y el helper de propiedad están listos para aplicarse a las operaciones de negocio.
- La confianza en proxy se configura mediante `TRUSTED_PROXY_CIDRS` con CIDR validados; no se activa automáticamente.

### Importador del catálogo oficial INE

- Se añadió el comando `npm run import:ine -- --archivo <ruta.xlsx> [--usuario-id <uuid>]`. Comprueba extensión, firma ZIP/XLSX, límite de tamaño, encabezados requeridos y SHA-256 antes de crear el lote.
- Cada fila se guarda completa en `FilaImportacionINE.datosOriginales`, incluyendo las dos columnas `Modalidad`; no se deduplica por NOG, correlativo ni producto. La repetición exacta de un archivo devuelve el lote existente por hash.
- La normalización conserva los originales y usa columnas consultables para importes con tres decimales, fechas, marcadores `NA`/`Sin Dato`, modalidades canónicas y alias pendientes de revisión. Las filas con valores problemáticos quedan en `REVISAR` con códigos de validación, sin borrarlas ni forzar valores inventados.
- El proceso es deliberadamente CLI por ahora: no expone rutas de archivos del servidor ni carga multipart hasta contar con un flujo HTTP protegido, almacenamiento privado y reglas operativas confirmadas.

### Verificación de esta entrega

- La prueba del importador genera un XLSX temporal representativo y verifica las 12 columnas fuente, los dos encabezados `Modalidad` y el importe normalizado. No depende de archivos en rutas locales.
- La carga real del catálogo en PostgreSQL no se ha ejecutado. Antes de desplegar se debe aplicar `npm run db:migrate:deploy` con variables de entorno reales y realizar una carga de aceptación.

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
- [Guía del MVP de Contrato Abierto](./guia-mvp-contrato-abierto.md): pantallas propuestas, flujo tipo ticket, entidades y rutas planificadas, distinguiendo lo existente de lo pendiente.
- [Esquema Prisma](../prisma/schema.prisma): definición persistida de modelos, enums, tipos, nulabilidad y relaciones. Los nombres `camelCase` son la referencia inicial para el contrato JSON.
- [Arquitectura de datos](../.github/modernize/assessment/engines/facts/data-architecture.md): relaciones entre entidades y límites actuales de persistencia.
- [Contrato actual de API](../.github/modernize/assessment/engines/facts/api-service-contracts.md): servicios, endpoint disponible, comunicación y controles de seguridad existentes.
- [Criterios de aceptación para APIs](./criterios-aceptacion-api.md): escenarios de seguridad y pruebas para los endpoints futuros; distingue lo configurado de lo pendiente.
- [Especificación de identidad y acceso](../.github/modernize/identity-access/spec.md) y [plan de implementación](../.github/modernize/identity-access/plan.md): requisitos confirmados, tareas y bloqueos de despliegue.
- [README del backend](../README.md): alcance implementado y pendientes de la API.
- [Solicitud de apoyo para continuar el backend](./solicitud-apoyo-backend-carlos.md): tareas trazables y criterios de seguridad para la siguiente etapa.

### Contrato inicial para frontend

| Objeto                            | Uso y campos principales                                                                                                                                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SolicitudPrecio`                 | Cabecera: título, institución solicitante, modalidad, unidad ejecutora, fecha del formulario, enlace solicitante, autoridad que autoriza, descripción y estado. La modalidad es nullable para compatibilidad con solicitudes antiguas; debe exigirse en altas nuevas. |
| `Usuario` y `Rol`                 | Toda persona que complete o envíe un formulario debe tener cuenta. Se conservan los tres roles principales y se renombra el rol genérico `USUARIO` a `SOLICITANTE` para las personas externas.                                                                        |
| `InstitucionSolicitante`          | Institución asociada a solicitantes: nombre oficial, NIT opcional y timestamps. Persistida en Prisma; no tiene endpoints.                                                                                                                                             |
| `PerfilSolicitante`               | Usuario, institución, cargo y estado de revisión manual. El campo DPI/CUI es opcional; captura, cifrado, enmascaramiento y revisión no están implementados y su uso en producción sigue bloqueado por la política de privacidad.                                      |
| `SesionUsuario`                   | Sesión del servidor con hash del token y del CSRF, vencimiento, revocación y usuario asociado. La API entrega el token de sesión en cookie HttpOnly.                                                                                                                  |
| Endpoints de autenticación        | `POST /api/v1/auth/iniciar-sesion`, `GET /api/v1/auth/yo`, `GET /api/v1/auth/csrf` y `POST /api/v1/auth/cerrar-sesion`. No hay registro ni endpoints de solicitudes todavía.                                                                                          |
| `ProductoSolicitud`               | Lista repetible por solicitud: número, nombre, código SIGES, especificaciones técnicas, unidad de medida y cantidad. La cantidad y otros datos pueden estar vacíos en borradores; validar los requeridos al enviar.                                                   |
| `RequisitoSolicitud`              | Atributos estructurados para análisis: nombre, valor, unidad, modo, fuente y estado de aprobación. No sustituye a la ficha del producto solicitado.                                                                                                                   |
| `ProveedorSolicitud`              | Empresa propuesta para una solicitud: nombre/razón social, NIT, dirección, teléfono y estado de confirmación del INE.                                                                                                                                                 |
| `ProveedorSolicitudProducto`      | Relación entre una empresa propuesta y los productos que comercializa; corresponde a la matriz del S.11.                                                                                                                                                              |
| `ComisionImportacion`             | Expediente de comisión de una solicitud de Bienes y Suministros Importados: estado y fecha de conformación.                                                                                                                                                           |
| `RepresentanteSolicitante`        | Titular o suplente: nombre, correo, teléfono y dirección para notificaciones.                                                                                                                                                                                         |
| `CotizacionImportacion`           | Datos de una cotización: proveedor extranjero, número, sitio web, contacto y fecha de consulta.                                                                                                                                                                       |
| `CotizacionProducto`              | Detalle por producto cotizado: fabricante, país de origen, moneda, precio FOB total para la cantidad solicitada, flete, seguro y otros gastos.                                                                                                                        |
| `JustificacionSolicitud`          | Justificación por cotizaciones insuficientes o por no usar el catálogo SIGES, incluyendo motivo y autoridad responsable.                                                                                                                                              |
| `SolicitudAdjunto`                | Metadatos de un archivo privado y tipo documental. Puede relacionarse con solicitud, producto, cotización o justificación.                                                                                                                                            |
| `RecepcionDocumental` (propuesta) | Método de entrega (`DIGITAL`, `FISICA`, `CD`), estado, fecha y usuario que registra la recepción. Permite mantener trazabilidad de entregas que el material vigente del INE aún exige en físico/CD. Todavía no existe en Prisma.                                      |

Los importes y cantidades decimales deben viajar como cadenas en JSON para evitar pérdida de precisión en JavaScript. Las fechas tipo `date` deben representarse como `YYYY-MM-DD`; timestamps como ISO 8601. La API aún debe formalizar estos formatos. El diseño prevé guardar el binario en almacenamiento privado, servicio que sigue pendiente; PostgreSQL conserva únicamente su clave y metadatos.

Para autenticarse desde navegador, el cliente debe enviar solicitudes con credenciales para conservar la cookie `ine_session`. El inicio de sesión devuelve el token CSRF en el cuerpo; `GET /api/v1/auth/csrf` puede emitir uno nuevo e invalida el anterior. Los métodos que modifican datos deben enviar el valor en `x-csrf-token`. El token de sesión no se devuelve en JSON.

El alta de proveedores se realiza por invitación del INE. Las personas solicitantes pueden registrarse, verificar su correo y quedan pendientes de aprobación manual antes de enviar formularios. La captura de DPI/CUI no demuestra por sí sola la identidad: la verificación será manual, sin guardar una imagen del documento en la primera versión.

### Cómo se relacionan los formularios con el modelo

- **S.00:** datos generales y productos de la solicitud, incluidos código SIGES, especificación, unidad y cantidad. Los campos del enlace y de la autoridad se guardan en la cabecera. La plantilla compartida presenta opciones para Subasta Electrónica Inversa y Bienes y Suministros Importados.
- **S.11:** lista empresas por producto y requiere al menos tres empresas por producto, sujeto a confirmación del INE. Se representa con `ProveedorSolicitud` y `ProveedorSolicitudProducto`.
- **S.21/S.22:** expediente de cotizaciones para bienes importados. Los precios se conservan por producto y moneda, con componentes separados; no se mezcla esta cotización con el historial de precios del catálogo de proveedores.
- **Contrato Abierto:** la nota indica que la solicitud inicial se dirige por escrito a la DGAE. El portal puede conservar una copia, pero el esquema actual no modela el proceso de la DGAE como un flujo interno del INE.
- **Entrega física:** los formatos indican entregar información digital editable e impresa; para bienes importados se menciona además CD. El portal no debe presentarse como sustituto de esa entrega.

## Decisiones acordadas

- Los usuarios solicitantes deben autenticarse para completar o enviar formularios; el autor se conserva en `creadaPorId`.
- Se conserva la matriz de tres roles principales y se renombra `USUARIO` a `SOLICITANTE` para cuentas externas vinculadas a una institución, preservando asignaciones existentes.
- Los proveedores son invitados por el INE. Los solicitantes se registran, verifican correo y esperan revisión manual antes de enviar.
- La primera versión registra solo el número DPI/CUI, sin imagen, con revisión manual. El acceso al número completo debe restringirse, cifrarse y enmascararse.
- El portal gestiona solicitudes de precio de referencia para Contrato Abierto, no el proceso de adquisiciones que corresponde a la DGAE.
- Se contempla registrar método, fecha y estado de recepción física/CD mientras esos requisitos sigan vigentes.
- El número mínimo de cotizaciones se mantiene configurable y sin una restricción fija en base de datos hasta confirmar la regla con el INE.

## Decisiones pendientes antes de cerrar formularios

Mientras el INE no responda se aplican las suposiciones listadas en [backlog-backend.md](./backlog-backend.md#decisiones-del-ine-que-bloquean-ítems).

1. Confirmar con el INE si el mínimo de tres cotizaciones para bienes importados aplica al expediente completo o a cada producto. El esquema debe seguir permitiendo ambas opciones.
2. Confirmar con el INE si aceptará oficialmente entrega digital; hasta entonces no retirar la recepción física/CD.
3. Definir aviso de privacidad, finalidad, retención y eliminación del DPI/CUI antes de recolectarlo en producción.
4. Confirmar correo institucional/SMTP para verificación e invitaciones, límites de carga de archivos y dominios de frontend/API para configurar cookies y CORS en despliegue.
5. Formalizar estados y transiciones de cada trámite con el personal del INE.

La resolución metodológica PDF compartida solo permitió extraer texto de manera limitada; las reglas estadísticas y de redondeo deben revisarse manualmente antes de implementar medias, medianas o informes.

## Siguientes pasos

El detalle de cada ítem (alcance, endpoints, reglas y dependencias) está en [backlog-backend.md](./backlog-backend.md).

| Orden | Trabajo | Resultado esperado |
|---|---|---|
| 1 | CI y readiness (B-05); primer administrador y recuperación de contraseña (B-01). | Operar y probar el sistema de extremo a extremo; ningún PR rompe la compilación. |
| 2 | Administración de usuarios y roles (B-02); consulta de auditoría (B-03). | Datos para la pantalla de administración del frontend. |
| 3 | Adjuntos privados (B-04). | Cierre del formulario S.00. |
| 4 | Borrado y notificaciones (B-06); requisitos del producto (B-07). | Seguimiento completo de la solicitud. |
| 5 | Matriz de proveedores S.11 (B-08). | Subasta Electrónica Inversa con tres empresas por producto. |
| 6 | Comisión y cotizaciones S.21/S.22 (B-09). | Bienes y Suministros Importados. |
| 7 | Catálogo INE por HTTP (B-10). | Consulta de referencias y revisión de alias y filas desde el frontend. |
| 8 | Catálogo de proveedores, estadísticas e informes, búsqueda externa e IA, controles adicionales (B-11 a B-14). | Segunda fase, sujeta a las respuestas del INE. |
| Paralelo | Confirmar con el INE las decisiones pendientes y validar migraciones e importador en el PostgreSQL de despliegue. | Reglas cerradas antes de codificar los flujos que dependen de ellas. |

## Reparto por disponibilidad de créditos de IA

La distribución propuesta evita asignar trabajo por nombres o etiquetas de puesto:

- **Flujo de implementación con mayor disponibilidad de créditos:** abordar las tareas de mayor contexto y generación de código: autenticación y guards, importador del Excel, servicios y endpoints de solicitudes, flujos S.11/S.21/S.22 y sus pruebas. Trabajar por entregas verticales pequeñas y presentar cada una para revisión; la disponibilidad de IA no sustituye validación humana.
- **Flujo de coordinación con menor disponibilidad de créditos:** compartir el contrato de datos con frontend, recopilar las decisiones pendientes, preparar casos de aceptación, revisar que los formularios correspondan a los formatos, probar manualmente los flujos y revisar los PR. Son tareas valiosas con menor consumo de IA y reducen retrabajo.
- **Equipo frontend:** avanzar en las pantallas de cabecera y lista de productos; después, separar la matriz de empresas S.11 y el expediente de cotizaciones de bienes importados. Acordar con backend los DTO y errores antes de integrar. No construir aún pantallas de IA, búsqueda web o informes como si ya existieran.

## Criterio para declarar terminada cada etapa

Cada entrega debe incluir migración si cambia la persistencia, validaciones de entrada, autorización por rol y propiedad, pruebas del flujo, documentación del contrato y una revisión de errores y archivos adjuntos. Las operaciones todavía no implementadas deben reportarse como pendientes, no como funcionalidad lista.
