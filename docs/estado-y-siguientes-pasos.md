# Estado del proyecto y siguientes pasos

**Corte:** 24 de noviembre de 2026
**Propósito:** compartir el alcance actual con frontend y coordinar el trabajo pendiente. La distribución se hace por carga y disponibilidad de créditos de IA, no por nombres ni por roles numerados.

## Resumen ejecutivo

El backend ya tiene una base NestJS con PostgreSQL y Prisma, un modelo para el catálogo del INE y los formularios S.00, S.11, S.21 y S.22. Están implementados el inicio de sesión con sesiones opacas, el adaptador SMTP, los controles compartidos de rol y propiedad y un importador CLI del catálogo del INE. Aún faltan los flujos de registro, verificación de correo, invitaciones, revisión administrativa y los endpoints de solicitudes.

## Estado actual

| Área | Estado |
|---|---|
| Estructura | NestJS, PostgreSQL, Prisma, endpoint de salud y configuración base listos. |
| Seguridad base | Validación de solicitudes, Helmet, CORS con credenciales, límites globales y de inicio de sesión, sesiones opacas en cookie HttpOnly y protección CSRF implementados. Guard de roles y helper de propiedad listos; aún no hay endpoints de negocio que los apliquen. |
| Modelo de datos | Entidades persistidas para identidad, solicitantes, proveedores, importaciones, referencias INE y formularios multproducto. |
| Cuentas de solicitantes | Institución, perfil y estado de aprobación incluidos en Prisma. Registro, verificación y aprobación por endpoints pendientes. |
| Migraciones | La migración de identidad crea sesiones y perfiles y renombra `USUARIO` a `SOLICITANTE`. La prueba con PGlite no sustituye la aplicación y validación en PostgreSQL del entorno. |
| Excel del INE | Importador CLI XLSX disponible; conserva encabezados y filas originales, modalidades repetidas, alias y observaciones. La carga de aceptación en PostgreSQL está pendiente. |
| Formularios oficiales | Sus campos están representados en el modelo; faltan validaciones, flujos y endpoints. |
| Contrato HTTP y seguridad | Salud, inicio/cierre de sesión, usuario actual y token CSRF documentados; los flujos de registro, solicitudes y demás operaciones siguen pendientes. |
| Plan de identidad y acceso | Inicio de sesión, SMTP y controles comunes de rol/propiedad implementados. Registro, verificación, invitaciones, revisión administrativa y aplicación de políticas a endpoints siguen pendientes. |
| Frontend | Puede iniciar el diseño de formularios con el contrato de datos de este documento; todavía no hay API funcional de solicitudes. |
| Publicación | Verificar el estado del PR y confirmar que las migraciones y documentos vigentes estén incluidos antes de desplegar. |

Tras integrar los cambios pasaron `npm run build`, `npm test` (41 pruebas), `npm run test:e2e` (4 pruebas), `npm run lint`, `npx prisma validate` y `git diff --check`. La ejecución de pruebas se limitó a un worker por la memoria disponible. La prueba de migración con PGlite verifica el cambio de rol y la conservación de datos; no sustituye una validación en PostgreSQL del entorno de despliegue. No se verificó un despliegue real.

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

1. Confirmar con el INE si el mínimo de tres cotizaciones para bienes importados aplica al expediente completo o a cada producto. El esquema debe seguir permitiendo ambas opciones.
2. Confirmar con el INE si aceptará oficialmente entrega digital; hasta entonces no retirar la recepción física/CD.
3. Definir aviso de privacidad, finalidad, retención y eliminación del DPI/CUI antes de recolectarlo en producción.
4. Confirmar correo institucional/SMTP para verificación e invitaciones, límites de carga de archivos y dominios de frontend/API para configurar cookies y CORS en despliegue.
5. Formalizar estados y transiciones de cada trámite con el personal del INE.

La resolución metodológica PDF compartida solo permitió extraer texto de manera limitada; las reglas estadísticas y de redondeo deben revisarse manualmente antes de implementar medias, medianas o informes.

## Siguientes pasos

| Orden | Trabajo | Resultado esperado |
|---|---|---|
| 1 | Aplicar y verificar la migración de identidad en PostgreSQL; configurar y probar los CIDR de proxy del despliegue. | Esquema actualizado y obtención verificable de la IP cliente antes de tráfico real. |
| 2 | Compartir el modelo de datos y el contrato de autenticación con frontend; acordar campos, enums, nulabilidad y formatos JSON. | Integración de los formularios y del inicio/cierre de sesión sin asumir endpoints inexistentes. |
| 3 | Confirmar con el INE las decisiones abiertas sobre cotizaciones, entrega física, privacidad, correo y dominios. | Reglas y configuración claras antes de codificar flujos dependientes. |
| 4 | Implementar registro de solicitantes, verificación de correo e invitaciones de proveedores usando SMTP y tokens de un solo uso. | Onboarding institucional con estados, límites y consumo atómico de tokens. |
| 5 | Implementar revisión administrativa y auditoría; aplicar rol y propiedad a cada endpoint y mantener DPI/CUI bloqueado hasta aprobar privacidad. | Acceso seguro y trazable para los flujos de negocio. |
| 6 | Aplicar el importador CLI en un entorno PostgreSQL de aceptación y revisar alias y filas con observaciones. | Carga verificable, reintentable y sin deduplicación por NOG. No exponer carga HTTP sin controles y almacenamiento privado. |
| 7 | Implementar solicitudes, productos y adjuntos privados. | Flujo S.00 con validación de borrador/envío y acceso controlado. |
| 8 | Implementar la matriz S.11 y confirmación de empresas por producto. | Propuesta de proveedores trazable y revisable por personal autorizado. |
| 9 | Implementar el expediente de comisión y captura de cotizaciones S.21/S.22. | Representantes, documentos, cotizaciones y componentes de costo por producto. |
| 10 | Validar estadísticas, búsqueda externa, IA e informes como fases posteriores. | Resultados comparables y auditables; no mezclar cotizaciones ni fuentes sin validación. |
| 11 | Revisar seguridad, pruebas integrales, despliegue y documentación de operación. | PR revisado y versión lista para desplegar. |

## Reparto por disponibilidad de créditos de IA

La distribución propuesta evita asignar trabajo por nombres o etiquetas de puesto:

- **Flujo de implementación con mayor disponibilidad de créditos:** abordar las tareas de mayor contexto y generación de código: autenticación y guards, importador del Excel, servicios y endpoints de solicitudes, flujos S.11/S.21/S.22 y sus pruebas. Trabajar por entregas verticales pequeñas y presentar cada una para revisión; la disponibilidad de IA no sustituye validación humana.
- **Flujo de coordinación con menor disponibilidad de créditos:** compartir el contrato de datos con frontend, recopilar las decisiones pendientes, preparar casos de aceptación, revisar que los formularios correspondan a los formatos, probar manualmente los flujos y revisar los PR. Son tareas valiosas con menor consumo de IA y reducen retrabajo.
- **Equipo frontend:** avanzar en las pantallas de cabecera y lista de productos; después, separar la matriz de empresas S.11 y el expediente de cotizaciones de bienes importados. Acordar con backend los DTO y errores antes de integrar. No construir aún pantallas de IA, búsqueda web o informes como si ya existieran.

## Criterio para declarar terminada cada etapa

Cada entrega debe incluir migración si cambia la persistencia, validaciones de entrada, autorización por rol y propiedad, pruebas del flujo, documentación del contrato y una revisión de errores y archivos adjuntos. Las operaciones todavía no implementadas deben reportarse como pendientes, no como funcionalidad lista.
