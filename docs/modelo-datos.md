# Modelo de datos y normalización

## Alcance del análisis

Se revisaron el catálogo del INE, los formatos S.00, S.11, S.21 y S.22 y la información normativa compartida. El esquema diferencia la solicitud general, los productos solicitados, las empresas propuestas para Subasta Electrónica Inversa y el expediente de cotizaciones para bienes importados.

El diagrama ER con las 30 entidades persistidas y sus atributos está en [modelo-relacional-base-datos-v2.pdf](./modelo-relacional-base-datos-v2.pdf). Se generó desde [schema.prisma](../prisma/schema.prisma); identifica nombres de tablas y columnas, tipos, nulabilidad, claves e interrelaciones.

## Hallazgo sobre `Modalidad`

El libro `INE-Precios de Referencia` contiene 7,788 filas de datos y 12 columnas, además de una fila de título y otra de encabezados. Las columnas B y E tienen ambas el encabezado `Modalidad`; sus valores son idénticos en las 7,788 filas. Se conserva el registro original íntegro para poder reexaminar ambas columnas, aunque una sola modalidad normalizada basta para la consulta.

Las 7,788 filas contienen 503 cadenas distintas en la modalidad original y 497 después de normalizar mayúsculas, acentos y espacios. Las dos modalidades más frecuentes son `CONTRATO ABIERTO` (5,275 filas) y `Contrato Abierto` (608 filas). También aparecen variantes con códigos, errores de escritura, diferencias de acentuación y valores como `Sin Dato`.

Otros hallazgos que afectan el modelo:

- `NOG` tiene 526 valores distintos no vacíos ni `NA`; 513 de esos valores se repiten. Un NOG aparece en 451 filas. No es una clave única de producto ni de fila.
- `Vigencia hasta` está vacía en 6,594 filas. `Correlativo` y `Categoría` tienen una celda vacía cada una. Los demás campos no tienen celdas vacías en este archivo, aunque hay marcadores como `NA` y `Sin Dato`.
- 7,783 importes tienen tres decimales y los cinco restantes son enteros. El precio debe conservar tres decimales.

Por tanto, el mapeo normalizado separa:

1. `tipoModalidad`: catálogo canónico de Contrato Abierto, Subasta Electrónica Inversa y Bienes y Suministros Importados.
2. `referenciaContrato`: código separado solo cuando una regla revisada pueda identificarlo; no se presupone que una secuencia como `08-2021` sea un año.
3. `modalidadOriginal`: texto recibido, sin correcciones.
4. `aliasModalidad`: correspondencia revisable entre la variante original y el tipo canónico.

`Sin Dato`, `NA`, una celda vacía y un valor ilegible se conservan en la fila fuente y se representan como `NULL` en los campos normalizados. La normalización no debe sobrescribir el original.

El catálogo también confirma que `NOG`, `Evento`, `Correlativo` y `Producto` no forman por sí solos una clave natural segura. La carga conserva cada fila por número de fila y por lote; no deduplica registros entre archivos.

## Convenciones de almacenamiento

- Usar UUID para identificadores internos.
- Guardar importes como `DECIMAL(14,3)` y moneda como código ISO 4217 (`GTQ`, `USD`), nunca como `float`. El catálogo actual tiene 7,783 precios con tres decimales.
- Tratar `NOG`, correlativos y códigos de contrato como texto; pueden ser alfanuméricos, vacíos o tener ceros iniciales.
- Guardar fechas fuente (`fechaPublicacion`, `vigenciaHasta`) aparte de las fechas del sistema (`createdAt`, `updatedAt`, `importedAt`), todas con zona horaria definida para timestamps.
- Para celdas vacías, usar `NULL`; no convertirlas en cero, texto `NA` ni una fecha ficticia.
- Mantener la fila fuente en JSON y los campos normalizados en columnas relacionales. JSONB sirve para procedencia y atributos variables, no como sustituto del modelo consultable.
- Una fila incompleta puede preservarse en staging aunque no sea apta para estadísticas. Registrar estado y motivos de validación; las estadísticas excluyen importes nulos o inválidos sin borrar la fuente.
- No declarar una clave natural para referencias del INE usando solo `NOG`: el archivo revisado contiene 526 valores distintos y 513 aparecen más de una vez. El hash del archivo puede hacer idempotente la repetición exacta de una carga; la deduplicación entre archivos requiere reglas adicionales.

## Entidades y atributos

`?` indica campo opcional. Los nombres se muestran en `camelCase`, tal como pueden compartirse con el cliente web. La sección de importes y solicitudes corresponde al primer esquema Prisma; análisis y evidencia web siguen como diseño de una fase posterior.

### Identidad y acceso

| Entidad                   | Atributos iniciales                                                                                                                                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Usuario`                 | `id: UUID`, `email: string` único (normalizado por la aplicación), `passwordHash: string`, `nombre: string`, `estado: PENDIENTE_VERIFICACION \| PENDIENTE_APROBACION \| ACTIVO \| BLOQUEADO \| DESACTIVADO`, `proveedorId: UUID?`, `emailVerificadoEn: timestamp?`, `ultimoAccesoEn: timestamp?`, `createdAt`, `updatedAt` |
| `Rol`                     | `id: UUID`, `codigo: ADMIN \| TRABAJADOR_INE \| PROVEEDOR \| SOLICITANTE` único, `nombre: string`; la migración renombra `USUARIO` preservando el ID y sus asignaciones                                                                                                                                                    |
| `UsuarioRol`              | `usuarioId: UUID`, `rolId: UUID`, `asignadoEn: timestamp`, `asignadoPorId: UUID?`; clave única `(usuarioId, rolId)`                                                                                                                                                                                                        |
| `TokenVerificacionCorreo` | `id: UUID`, `usuarioId: UUID`, `tokenHash: string` único, `venceEn: timestamp`, `consumidoEn: timestamp?`, `creadaEn: timestamp`                                                                                                                                                                                           |
| `SesionUsuario`           | `id: UUID`, `usuarioId: UUID`, `tokenHash: string` único, `csrfTokenHash: string`, `venceEn: timestamp`, `revocadaEn: timestamp?`, `creadaEn`, `ultimoAccesoEn: timestamp?`                                                                                                                                                |
| `Proveedor`               | `id: UUID`, `nombreComercial: string`, `razonSocial: string?`, `correoContacto: string?`, `estado: ACTIVO \| INACTIVO`, `createdAt`, `updatedAt`                                                                                                                                                                           |
| `InvitacionProveedor`     | `id: UUID`, `proveedorId: UUID?`, `email: string`, `tokenHash: string` único, `venceEn: timestamp`, `aceptadaEn: timestamp?`, `creadaPorId: UUID?`, `creadaEn`                                                                                                                                                             |

La relación es de un proveedor a muchas cuentas; cada cuenta puede pertenecer como máximo a un proveedor. Las solicitudes requieren una cuenta y su autor se registra en `creadaPorId`. El rol `SOLICITANTE` identifica a la persona externa que presenta solicitudes por una institución; no debe confundirse con los tres roles principales (`ADMIN`, `TRABAJADOR_INE` y `PROVEEDOR`). La migración renombra el rol genérico `USUARIO` a `SOLICITANTE` conservando sus asignaciones.

La política acordada es invitar a los proveedores desde el INE. Las personas solicitantes podrán iniciar el registro, verificar su correo y quedarán pendientes de aprobación manual antes de enviar solicitudes. Las cuentas de personal INE deben ser provisionadas por un administrador. El proveedor solo gestiona su propia empresa, productos y precios; el solicitante solo sus solicitudes; el trabajador INE gestiona solicitudes e investigación, pero no asigna roles.

El esquema ya incluye institución y perfil para preparar el flujo de revisión, pero todavía no existen registro, verificación de correo ni aprobación por endpoints:

| Entidad persistida       | Atributos iniciales                                                                                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InstitucionSolicitante` | `id: UUID`, `nombreOficial: string`, `nit: string?`, `createdAt`, `updatedAt`                                                                                                                                                           |
| `PerfilSolicitante`      | `id: UUID`, `usuarioId: UUID` único, `institucionId: UUID`, `cargo: string?`, `dpiCifrado: string?`, `estadoRevision: PENDIENTE \| VERIFICADO \| RECHAZADO`, `revisadoPorId: UUID?`, `revisadoEn: timestamp?`, `createdAt`, `updatedAt` |

`SolicitudPrecio.institucionSolicitante` conserva su valor histórico; `institucionSolicitanteId` agrega una relación opcional para normalizar solicitudes nuevas. El campo `dpiCifrado` es solo persistencia: todavía no hay captura, cifrado de aplicación, enmascaramiento ni revisión vía API. No se almacenará una imagen del documento. La política de privacidad, finalidad, acceso, retención y eliminación debe aprobarse antes de recolectar el dato en producción.

### Catálogo de proveedores

| Entidad                    | Atributos iniciales                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ProductoProveedor`        | `id: UUID`, `proveedorId: UUID`, `codigoProveedor: string?`, `nombre: string`, `descripcion: string?`, `presentacion: string?`, `categoriaOriginal: string?`, `atributos: JSON?`, `estado: BORRADOR \| PUBLICADO \| PAUSADO \| RETIRADO`, `createdAt`, `updatedAt` |
| `PrecioProveedor`          | `id: UUID`, `productoProveedorId: UUID`, `monto: decimal`, `moneda: string` (por defecto `GTQ`), `fechaPrecio: date?`, `vigenciaHasta: date?`, `registradoPorId: UUID?`, `createdAt`                                                                               |
| `ImportacionProveedor`     | `id: UUID`, `proveedorId: UUID`, `nombreArchivo: string`, `sha256: string`, `formato: XLSX \| CSV \| JSON`, `estado: EN_PROCESO \| COMPLETADA \| PARCIAL \| FALLIDA`, contadores de filas, `iniciadaEn`, `completadaEn: timestamp?`, `usuarioId: UUID?`            |
| `FilaImportacionProveedor` | `id: UUID`, `importacionId: UUID`, `numeroFila: int`, `datosOriginales: JSON`, `estado: PENDIENTE \| NORMALIZADA \| REVISAR \| RECHAZADA`, `errores: JSON?`, `createdAt`                                                                                           |

Cada actualización de precio agrega un registro a `PrecioProveedor`; no sobrescribe el histórico. La fecha más reciente se obtiene ordenando por `createdAt`, que es una fecha del sistema; `fechaPrecio` y `vigenciaHasta` son datos declarados por el proveedor. El precio es obligatorio para publicar, aunque en el catálogo oficial puede faltar en una fila histórica.

`codigoProveedor` sirve para reconciliar una carga con el mismo artículo del proveedor cuando exista un código estable. Si no existe, la coincidencia se presenta para revisión y no se debe actualizar un producto automáticamente solo porque el nombre se parece.

`atributos` permite capturar propiedades específicas de distintas categorías, por ejemplo memoria y procesador para una computadora, concentración y presentación para un medicamento o potencia para una bomba. Se recomienda conservar también `descripcion` como texto fuente. Los atributos que deban filtrarse o compararse se validan y estructuran por categoría; no conviene crear columnas globales para cada categoría.

### Catálogo oficial del INE

| Entidad              | Atributos iniciales                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ImportacionINE`     | `id: UUID`, `nombreArchivo: string`, `sha256: string` único, `formato: XLSX \| CSV \| JSON`, `estado: EN_PROCESO \| COMPLETADA \| PARCIAL \| FALLIDA`, `encabezadosOriginales: JSON?`, contadores de filas, `iniciadaEn`, `completadaEn: timestamp?`, `usuarioId: UUID?`                                                                                                                                                                                 |
| `FilaImportacionINE` | `id: UUID`, `importacionId: UUID`, `numeroFila: int`, `datosOriginales: JSON`, `estado: PENDIENTE \| NORMALIZADA \| REVISAR \| RECHAZADA`, `errores: JSON?`, `createdAt`; clave única `(importacionId, numeroFila)`                                                                                                                                                                                                                                      |
| `TipoModalidad`      | `id: UUID`, `codigo: string` único, `nombre: string`, `activo: boolean`                                                                                                                                                                                                                                                                                                                                                                                  |
| `AliasModalidad`     | `id: UUID`, `valorOriginal: string`, `claveNormalizada: string`, `tipoModalidadId: UUID?`, `estado: PENDIENTE \| CONFIRMADO \| DESCARTADO`, `revisadoPorId: UUID?`, `createdAt`                                                                                                                                                                                                                                                                          |
| `ReferenciaINE`      | `id: UUID`, `filaImportacionId: UUID`, `tipoModalidadId: UUID?`, `modalidadOriginal: string?`, `referenciaContrato: string?`, `nog: string?`, `eventoOriginal: string?`, `correlativo: string?`, `producto: string?`, `caracteristicas: string?`, `presentacion: string?`, `precioReferencia: decimal?`, `moneda: string` (por defecto `GTQ`), `fechaPublicacion: date?`, `vigenciaHasta: date?`, `categoriaOriginal: string?`, `createdAt`, `updatedAt` |

Las tablas `ImportacionINE`, `FilaImportacionINE`, `TipoModalidad`, `AliasModalidad` y `ReferenciaINE` están definidas en Prisma. La fila fuente se conserva con sus encabezados y valores ordenados, incluidas las dos columnas `Modalidad`, aunque en el archivo sus valores coinciden en todas las filas. Los campos `NOG`, `Evento`, `Correlativo` y `Categoría` se guardan como texto, no como identificadores internos ni claves únicas.

Los valores faltantes de la fuente permanecen nulos. En este archivo los 7,788 precios están presentes; `precioReferencia` sigue siendo nullable para permitir futuras importaciones incompletas sin perder la fila original. Las filas sin un importe válido se marcan para revisión y se excluyen de estadísticas de precios.

El esquema no crea todavía una entidad `ProcesoCompra`: los datos perfilados no justifican una clave natural basada en NOG. Cualquier separación de procesos requiere validar otra clave estable.

### Solicitudes, análisis e informes

#### Entidades persistidas

| Entidad                      | Atributos iniciales                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SolicitudPrecio`            | `id: UUID`, `titulo: string`, `institucionSolicitante: string`, `institucionSolicitanteId: UUID?`, `unidadEjecutora: string?`, `modalidad: CONTRATO_ABIERTO \| SUBASTA_ELECTRONICA_INVERSA \| BIENES_SUMINISTROS_IMPORTADOS?`, `fechaFormulario: date?`, `enlaceNombre: string?`, `enlaceCargo: string?`, `autoridadNombre: string?`, `autoridadCargo: string?`, `descripcion: string`, `estado`, `creadaPorId: UUID`, `createdAt`, `updatedAt` |
| `ProductoSolicitud`          | `id: UUID`, `solicitudId: UUID`, `numero: int`, `nombre: string`, `codigoSiges: string?`, `especificacionesTecnicas: string?`, `unidadMedida: string?`, `cantidad: decimal?`, `createdAt`, `updatedAt`                                                                                                                                                                                                                                          |
| `RequisitoSolicitud`         | `id: UUID`, `solicitudId: UUID`, `nombre: string`, `valor: string`, `unidad: string?`, `modo: EXACTO \| PREFERIDO \| MINIMO`, `obligatorio: boolean`, `fuente: MANUAL \| IA`, `aprobadoPorId: UUID?`, `createdAt`, `updatedAt`                                                                                                                                                                                                                  |
| `SolicitudAdjunto`           | `id: UUID`, `solicitudId: UUID`, `tipo: TipoAdjuntoSolicitud`, `productoSolicitudId: UUID?`, `cotizacionId: UUID?`, `justificacionId: UUID?`, `nombreOriginal: string`, `objectKey: string`, `mimeVerificado: string`, `tamanoBytes: int`, `sha256: string`, `subidoPorId: UUID?`, `createdAt`                                                                                                                                                  |
| `ComisionImportacion`        | `id: UUID`, `solicitudId: UUID` único, `estado: PENDIENTE \| EN_CONFORMACION \| CONFORMADA \| FINALIZADA`, `formadaEn: timestamp?`, `createdAt`, `updatedAt`                                                                                                                                                                                                                                                                                    |
| `RepresentanteSolicitante`   | `id: UUID`, `comisionId: UUID`, `tipo: TITULAR \| SUPLENTE`, `nombre: string`, `correo: string`, `telefono: string`, `direccionNotificaciones: string`, `createdAt`, `updatedAt`; único `(comisionId, tipo)`                                                                                                                                                                                                                                    |
| `CotizacionImportacion`      | `id: UUID`, `comisionId: UUID`, `numero: int`, `numeroCotizacion: string?`, `proveedorNombre: string`, `sitioWeb: string?`, `correoProveedor: string?`, `codigoPaisTelefono: string?`, `telefonoProveedor: string?`, `fechaConsulta: date?`, `createdAt`                                                                                                                                                                                        |
| `CotizacionProducto`         | `id: UUID`, `cotizacionId: UUID`, `productoSolicitudId: UUID`, `especificacionesCotizacion: string?`, `fabricante: string?`, `paisOrigen: string?`, `moneda: string`, `precioFobTotal: decimal`, `flete: decimal?`, `seguro: decimal?`, `otrosGastos: decimal?`, `createdAt`; único `(cotizacionId, productoSolicitudId)`                                                                                                                       |
| `JustificacionSolicitud`     | `id: UUID`, `solicitudId: UUID`, `productoSolicitudId: UUID?`, `tipo: COTIZACIONES_INSUFICIENTES \| NO_UTILIZA_CATALOGO_SIGES`, `motivo: string`, `autoridadNombre: string`, `autoridadCargo: string`, `creadaPorId: UUID?`, `createdAt`                                                                                                                                                                                                        |
| `ProveedorSolicitud`         | `id: UUID`, `solicitudId: UUID`, `proveedorId: UUID?`, `nombreRazonSocial: string`, `nit: string?`, `direccion: string?`, `telefono: string?`, `estado: PENDIENTE \| CONFIRMADO \| DESCARTADO`, `confirmadoPorId: UUID?`, `confirmadoEn: timestamp?`, `createdAt`                                                                                                                                                                               |
| `ProveedorSolicitudProducto` | `proveedorSolicitudId: UUID`, `productoSolicitudId: UUID`, `createdAt`; clave compuesta                                                                                                                                                                                                                                                                                                                                                         |

`SolicitudPrecio` recoge los datos generales del S.00 y separa la modalidad del texto libre de la descripción. La modalidad puede quedar nula en registros antiguos o sin clasificar; el servicio debe exigirla para nuevas solicitudes. `ProductoSolicitud` permite varios bienes por solicitud y almacena los campos de producto, código SIGES, especificación, unidad y cantidad.

El S.11 corresponde a Subasta Electrónica Inversa: vincula cada producto con las empresas que lo comercializan. `ProveedorSolicitud` conserva los datos de contacto como una instantánea del expediente y puede asociarse a un proveedor ya registrado. Su estado registra la confirmación del INE; la validación de al menos tres empresas por producto es una regla de aplicación.

Para Bienes y Suministros Importados, `ComisionImportacion` organiza el expediente, sus representantes titular y suplente, y las cotizaciones. Cada cotización tiene líneas por producto con especificación ofertada, fabricante, origen, moneda, precio FOB total para la cantidad solicitada, flete, seguro y otros gastos. El formato indica que FOB corresponde a la cantidad total solicitada y que los precios unitarios no deben incluir descuentos; la validación del expediente debe respetar esas reglas. El total comparativo se calcula a partir de los componentes y no se guarda como dato redundante. La moneda se almacena explícitamente; la regla de presentar las cotizaciones en USD se verifica al validar el expediente.

`JustificacionSolicitud` registra el motivo y la autoridad que respalda la falta de cotizaciones suficientes o el uso de productos sin código SIGES. El oficio firmado se conserva como adjunto tipificado. El número mínimo de cotizaciones se valida en la aplicación; el esquema conserva suficientes relaciones para contar cotizaciones por expediente y por producto sin asumir una regla más estricta que la confirmada por el INE.

`SolicitudAdjunto.tipo` identifica formatos S.00, S.11, S.21 y S.22, solicitudes formales, nombramientos, justificaciones, cotizaciones, fichas técnicas y fotografías. Los binarios se guardan en almacenamiento privado; PostgreSQL contiene metadatos y referencias. Los formatos compartidos indican entregar información digital editable, impresa y, para bienes importados, en CD. Hasta que el INE confirme que una entrega enteramente digital es suficiente, se propone registrar el método y estado de recepción física/CD; el portal no debe presentarse como sustituto de esos requisitos oficiales.

El portal gestionará la solicitud de precio de referencia relacionada con Contrato Abierto, no el proceso de adquisiciones que corresponde a la DGAE. La solicitud formal dirigida a la DGAE puede adjuntarse como antecedente cuando corresponda; el portal no sustituye ni representa el flujo de esa Dirección.

#### Seguimiento de entrega (propuesta)

Mientras el INE mantenga los requisitos de entrega física y en CD, el expediente necesita registrar el estado de recepción. Para no cerrar la puerta a la digitalización, el método también contempla entrega digital:

| Entidad propuesta     | Atributos iniciales                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RecepcionDocumental` | `id: UUID`, `solicitudId: UUID`, `metodoEntrega: DIGITAL \| FISICA \| CD`, `estado: PENDIENTE \| RECIBIDA \| OBSERVADA`, `recibidaEn: timestamp?`, `registradaPorId: UUID?`, `observaciones: string?`, `createdAt`, `updatedAt` |

Puede haber varios registros por solicitud para documentar entregas o correcciones. Esta entidad no está todavía en Prisma; su obligatoriedad y la aceptación de entrega digital deben confirmarse con el INE.

#### Entidades previstas para fases posteriores

| Entidad                 | Atributos iniciales                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AnalisisSolicitud`     | `id: UUID`, `solicitudId: UUID`, `estado: PENDIENTE \| EN_CURSO \| COMPLETADO \| PARCIAL \| FALLIDO`, `iniciadoPorId: UUID?`, `iniciadoEn`, `completadoEn: timestamp?`, `versionReglas: string?`                                                 |
| `ResultadoCoincidencia` | `id: UUID`, `analisisId: UUID`, `origen: INE \| PROVEEDOR \| WEB`, `referenciaINEId: UUID?`, `productoProveedorId: UUID?`, `evidenciaWebId: UUID?`, `semaforo: VERDE \| AMARILLO \| ROJO`, `puntuacion: decimal?`, `motivos: JSON?`, `createdAt` |
| `EvidenciaWeb`          | `id: UUID`, `analisisId: UUID`, `url: string`, `dominio: string`, `titulo: string?`, `precio: decimal?`, `moneda: string?`, `consultadoEn: timestamp`, `estado: PENDIENTE \| VALIDADO \| DESCARTADO`, `datosFuente: JSON?`                       |
| `InformeSolicitud`      | `id: UUID`, `solicitudId: UUID`, `objectKey: string`, `sha256: string`, `generadoPorId: UUID?`, `metodologiaVersion: string?`, `createdAt`                                                                                                       |

El análisis asistido, las coincidencias, la búsqueda web y la generación de informes no están persistidos ni implementados todavía. La IA puede proponer requisitos o coincidencias, pero su aprobación requiere un usuario responsable y una decisión trazable.

### Auditoría

| Entidad           | Atributos iniciales                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `EventoAuditoria` | `id: UUID`, `actorId: UUID?`, `accion: string`, `recurso: string`, `recursoId: string?`, `metadatos: JSON?`, `createdAt` |

La tabla de auditoría ya tiene una relación opcional con `Usuario`; al desactivar o borrar una cuenta histórica, el evento permanece y su referencia al actor se vuelve nula.

## Estadísticas y calidad de datos

- Para media, mediana y moda, incluir solo valores numéricos válidos, en la moneda y unidad comparable. Si una unidad o presentación cambia el significado del precio, debe formar parte de los criterios de comparación.
- No usar `NULL` como cero ni `Sin Dato` como una categoría de negocio. Reportar cuántas filas se excluyeron y por qué.
- Conservar por separado el valor fuente, su valor normalizado y el resultado de la regla aplicada. Las correcciones deben ser repetibles y trazables.
- Guardar fechas fuente y fechas de sistema en columnas diferentes para que la antigüedad del dato no se confunda con la vigencia declarada.
- En el catálogo perfilado, la vigencia falta en 6,594 de 7,788 filas; no completar esas fechas automáticamente ni excluir esas referencias del almacenamiento.
- Añadir índices después de perfilar consultas reales. Un catálogo de 7,788 filas es pequeño para PostgreSQL; la prioridad es importación idempotente, búsqueda indexada y consultas de calidad, no una clave inferida ni una base NoSQL.

## Seguridad de persistencia e importación

- Nunca guardar contraseñas en texto claro; usar un hash resistente como Argon2id. Guardar solo hashes de tokens de invitación.
- Aplicar autorización por rol y por propietario del proveedor en cada consulta de sus productos, precios y adjuntos.
- Validar archivos por tamaño, tipo real y esquema; guardar archivos fuera de la ruta pública. Conservar hash y fila de origen para auditoría.
- Restringir los datos personales de representantes, autoridades y contactos de proveedores a personal autorizado; la base no tiene cifrado de campo ni enmascaramiento configurados.
- Tratar el DPI/CUI como dato sensible: cifrarlo en la aplicación, enmascararlo en respuestas y logs, limitar su lectura a revisores autorizados y no almacenar copia del documento en la primera versión.
- Validar que un producto, cotización o justificación enlazados a un adjunto pertenezcan a la misma solicitud. Esta regla corresponde a la capa de servicio y aún no está implementada.
- Usar Prisma o consultas parametrizadas. Evitar SQL concatenado con texto recibido del usuario y no aceptar nombres de tablas o columnas proporcionados por el cliente.
- Escapar contenido al representarlo en el frontend. La persistencia en PostgreSQL no sustituye la protección contra XSS.
- No exponer correo, NIT, tokens, contenido privado de adjuntos ni metadatos sensibles en logs o informes públicos.
