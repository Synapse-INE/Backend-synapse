# Guía de MVP: Contrato Abierto

**Estado:** propuesta funcional para revisión del equipo; las rutas nuevas y las ampliaciones de datos de este documento aún no están implementadas.  
**Base:** orientación recibida de la DPIR, esquema actual del backend NestJS y patrones del sistema de tickets Django compartido por el equipo.

## Para salir del bloqueo

No hace falta diseñar ahora las tres modalidades ni todo el sistema. La primera versión debe resolver un flujo concreto para Contrato Abierto:

1. La entidad requirente registra la solicitud y sus productos.
2. El personal del INE revisa los datos y solicita correcciones cuando sea necesario.
3. El INE registra la investigación de mercado y la evidencia consultada.
4. El analista consolida y valida la información.
5. Se prepara el informe y oficio.
6. Se registra la entrega oficial y sus documentos de respaldo.

El sistema de tickets sirve como referencia de interacción y seguimiento, no como modelo de negocio a copiar literalmente. Cada solicitud de precio debe ser el expediente central; los productos, archivos, comentarios y eventos pertenecen a ese expediente.

## Adaptación del backend de tickets

El backend de referencia, en [`tickets/`](../../Front-Pruebas-main/Front-Pruebas-main/tickets), aporta patrones útiles para el expediente:

- ticket creado por una persona y asignable a una persona responsable;
- bandejas distintas para quien reporta y para el equipo que atiende;
- estados y cambios de estado visibles en el historial;
- comentarios públicos y notas internas;
- adjuntos asociados al ticket y, en ocasiones, a un comentario;
- notificaciones y filtros por estado, responsable y fechas.

Para Precios de Referencia conviene reutilizar **bandejas, asignación, timeline, comentarios/notas, notificaciones y adjuntos privados**. No trasladar categorías de IT, prioridades técnicas, proyectos, contenedores, recurrencias, planificación Gantt, carga móvil anónima ni las reglas multiempresa del sistema de tickets.

El frontend ya existe. Esta guía no pretende diseñar sus vistas ni replicarlas: define el modelo de datos y los comportamientos de backend que deben alinearse con sus formularios y contratos actuales antes de portar los módulos necesarios a NestJS.

## Flujo y estados

Las seis etapas de trabajo confirmadas para Contrato Abierto son **Solicitud → Revisión → Investigación → Análisis → Informe → Entrega**. Para una interfaz tipo ticket, proponemos representar el avance con estados controlados:

| Estado propuesto | Uso |
|---|---|
| `BORRADOR` | La entidad prepara una solicitud aún no enviada. |
| `RECIBIDA` | El sistema recibió el expediente y sus archivos. |
| `EN_REVISION` | El personal del INE valida descripción técnica, cantidad, unidad y documentos. |
| `PENDIENTE_SUBSANACION` | El expediente espera información o correcciones de la entidad. |
| `EN_INVESTIGACION` | Se recopila información de mercado. |
| `EN_ANALISIS` | El analista valida y consolida la información, incluidos posibles valores atípicos. |
| `EN_INFORME` | Se prepara o revisa el informe técnico y el oficio. |
| `EN_ENTREGA` | Se gestiona la remisión y se registra su evidencia. |
| `COMPLETADA` | La entrega y el cierre del trámite quedaron registrados. |
| `RECHAZADA` | Resultado terminal, si el INE confirma que forma parte del flujo. |

Estos estados son una **propuesta de trabajo**, no un catálogo oficial. Antes de fijarlos en una migración se deben validar con la DPIR, especialmente `BORRADOR`, `PENDIENTE_SUBSANACION` y `RECHAZADA`. La transición debe depender del rol; una entidad solicitante no debe poder asignar responsables ni saltar etapas internas.

Cada transición debe conservar actor, fecha, estado anterior, estado nuevo y nota. Las observaciones que solicitan correcciones deben ser visibles para la entidad; las notas de trabajo interno, no.

## Modelo de datos

### Lo que ya está en Prisma

El esquema actual ya contiene:

- `SolicitudPrecio`: cabecera, modalidad, entidad solicitante, contacto, descripción, estado y cuenta que creó el expediente.
- `ProductoSolicitud`: varios productos asociados a una solicitud, con nombre, código SIGES opcional, especificación, unidad y cantidad.
- `SolicitudAdjunto`: metadatos de archivos asociados a la solicitud y opcionalmente a un producto; incluye tipo, nombre original, clave de almacenamiento, MIME verificado, tamaño, SHA-256 y cuenta que lo subió.
- `EventoAuditoria`: auditoría genérica por actor, acción, recurso, fecha y metadatos.

La relación opcional entre solicitante e institución también está en el esquema. Las rutas de solicitudes, revisión, investigación y documentos aún no están implementadas en NestJS.

### Esquema conceptual para el MVP

```text
Usuario ──< SolicitudPrecio >── InstitucionSolicitante
                    │
                    ├──< ProductoSolicitud
                    ├──< SolicitudAdjunto >── opcional ProductoSolicitud
                    ├──< SolicitudComentario
                    └──< SolicitudHistorial

SolicitudPrecio ──< ConsultaMercado ──< PrecioConsultado >── ProductoSolicitud
SolicitudPrecio ──< InformeSolicitud
SolicitudPrecio ──< EntregaSolicitud
```

Las cuatro últimas entidades son candidatas para las fases de trabajo correspondientes; sus campos finales dependen de la metodología, las boletas y el proceso de entrega que confirme el INE.

| Entidad | Campos guía | Estado |
|---|---|---|
| `SolicitudPrecio` | `id`, `codigo`, `titulo`, `institucionSolicitanteId`, `creadaPorId`, `asignadaAId?`, `descripcion`, `modalidad`, `estado`, `createdAt`, `updatedAt` | Existe parcialmente. La entidad, productos, modalidad y estado están modelados; aún no existe código legible ni responsable asignado. |
| `ProductoSolicitud` | `id`, `solicitudId`, `numero`, `nombre`, `codigoSiges?`, `especificacionesTecnicas?`, `unidadMedida?`, `cantidad?` | Existe. Los campos opcionales permiten borradores; los requisitos de envío deben aplicarse en el servicio. |
| `SolicitudAdjunto` | `id`, `solicitudId`, `productoSolicitudId?`, `tipo`, `nombreOriginal`, `objectKey`, `mimeVerificado`, `tamanoBytes`, `sha256`, `subidoPorId`, `createdAt` | Existe. Guardar binarios fuera de PostgreSQL, en almacenamiento privado. |
| `SolicitudComentario` | `id`, `solicitudId`, `autorId`, `contenido`, `esInterno`, `createdAt` | No existe. Permite conversación y notas internas, con filtrado para que el solicitante nunca reciba notas internas. |
| `SolicitudHistorial` | `id`, `solicitudId`, `actorId?`, `accion`, `estadoAnterior?`, `estadoNuevo?`, `detalle?`, `createdAt` | No existe. Alimenta el timeline de negocio; `EventoAuditoria` permanece para auditoría técnica y de seguridad. |
| `ConsultaMercado` / `PrecioConsultado` | Solicitud, producto, fuente/empresa, fecha de consulta, unidad, moneda, precio reportado, resultado y evidencia | Por definir con el INE. No reutilizar las cotizaciones de importación para Contrato Abierto. |
| `InformeSolicitud` / `EntregaSolicitud` | Archivo/versionado del informe y oficio; destinatario, medio, fecha y constancia de cada entrega | Por definir con el INE. Considerar entrega digital, física y CD. |

### Archivos de solicitud

La pantalla debe contemplar un área para adjuntar la carta u oficio de solicitud y documentos de respaldo. **La respuesta del INE no confirmó que una carta dirigida al INE sea obligatoria para Contrato Abierto**; tampoco confirmó qué documento exacto inicia este flujo. Por ahora:

- permitir adjuntar documentos requeridos por el proceso, sin marcar como obligatorio un tipo aún no confirmado;
- solicitar al INE si la carta debe dirigirse a la DPIR/INE, a la DGAE/DIGAE o a ambas instancias y en qué momento;
- no confundir el oficio final de respuesta del INE con la solicitud inicial de la entidad;
- conservar la categoría del documento, su expediente, quién lo subió y cuándo;
- confirmar tipos permitidos, tamaño máximo, antivirus y política de retención antes de habilitar cargas reales.

`TipoAdjuntoSolicitud` actualmente contiene `SOLICITUD_FORMAL_DGAE` y `OTRO`, pero no una categoría específica para carta dirigida al INE. No asumir que `SOLICITUD_FORMAL_DGAE` representa una carta a la DPIR. Añadir categorías específicas mediante migración después de confirmar el inventario documental.

## Rutas API propuestas

Todas son rutas de diseño; salvo las de autenticación ya documentadas, aún no existen en la API NestJS.

### Entidad requirente

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/api/v1/solicitudes-precio/mias` | Listar únicamente solicitudes propias. |
| `POST` | `/api/v1/solicitudes-precio` | Crear borrador con cabecera y productos. El servidor asigna usuario y estado inicial. |
| `GET` | `/api/v1/solicitudes-precio/:id` | Ver un expediente propio y sus datos autorizados. |
| `PATCH` | `/api/v1/solicitudes-precio/:id/borrador` | Modificar un borrador propio. |
| `POST` | `/api/v1/solicitudes-precio/:id/enviar` | Validar campos y documentos requeridos y enviar al INE. |
| `POST` | `/api/v1/solicitudes-precio/:id/comentarios` | Responder una observación o enviar un mensaje visible al equipo del INE. |
| `POST` | `/api/v1/solicitudes-precio/:id/adjuntos` | Subir un archivo con autorización y validaciones. |

### Personal del INE

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/api/v1/ine/solicitudes` | Bandeja de solicitudes asignadas o permitidas, filtrable por estado, responsable y fecha. |
| `GET` | `/api/v1/ine/solicitudes/:id` | Ver el expediente con información interna autorizada. |
| `PATCH` | `/api/v1/ine/solicitudes/:id/asignacion` | Asignar o reasignar una persona responsable. |
| `POST` | `/api/v1/ine/solicitudes/:id/transiciones` | Solicitar subsanación o avanzar de etapa, con validación de transición y registro de historial. |
| `POST` | `/api/v1/ine/solicitudes/:id/comentarios` | Añadir una observación externa o nota interna según permiso. |
| `POST` | `/api/v1/ine/solicitudes/:id/investigacion` | Registrar una consulta de mercado cuando estén confirmados sus campos. |
| `POST` | `/api/v1/ine/solicitudes/:id/informes` | Registrar informe/oficio y su versión, cuando se confirme el formato. |
| `POST` | `/api/v1/ine/solicitudes/:id/entregas` | Registrar medio, fecha, destinatario y constancia de entrega. |

Los archivos deben descargarse mediante una ruta autenticada que compruebe el acceso al expediente y emita el contenido o un enlace temporal privado. No enviar `objectKey` ni URL permanente al frontend. No crear endpoints de carga anónima del sistema de tickets para este trámite.

## Contratos de formulario iniciales

### Borrador de solicitud

```json
{
  "titulo": "Solicitud de precio de referencia",
  "institucionSolicitanteId": "uuid",
  "descripcion": "Motivo o contexto de la solicitud",
  "modalidad": "CONTRATO_ABIERTO",
  "productos": [
    {
      "numero": 1,
      "nombre": "Nombre del producto",
      "codigoSiges": null,
      "especificacionesTecnicas": "Descripción técnica",
      "unidadMedida": "Unidad",
      "cantidad": "500"
    }
  ]
}
```

Este JSON es orientativo, no un contrato publicado. `titulo`, campos de entidad/contacto, obligatoriedad de SIGES y adjuntos deben ajustarse al formulario de Contrato Abierto que confirme el INE. Cantidades y precios decimales se transmiten como cadenas para conservar precisión. El `creadaPorId`, código, timestamps y estado los asigna el servidor; el cliente no puede enviar roles, responsable interno ni estado arbitrario.

## Orden de trabajo

1. **Alinear formulario y documentos:** obtener del INE el formulario de Contrato Abierto, lista de documentos y reglas para subsanaciones. Diseñar la carga de archivos en la pantalla, pero no exigir una carta específica sin confirmación.
2. **Cerrar el contrato de solicitud:** definir campos, tipos, validaciones de borrador/envío y respuesta de errores para `SolicitudPrecio` y `ProductoSolicitud`.
3. **Implementar el expediente tipo ticket:** mis solicitudes, bandeja INE, asignación, observaciones públicas/internas, historial y notificaciones. Mantener autorización por rol y propiedad.
4. **Implementar carga segura de documentos:** almacenamiento privado, MIME verificado, límites, antivirus y metadatos; separar la carta inicial, evidencia de investigación e informe final.
5. **Precisar investigación y análisis:** acordar formato de boleta, campos de precios, metodología y tratamiento de atípicos antes de crear tablas finales o cálculos.
6. **Implementar informe y entrega:** registrar versiones y entrega digital/física/CD sin afirmar que el portal sustituye el procedimiento oficial.
7. **Añadir las otras modalidades en fases posteriores:** reutilizar el expediente y sus controles, incorporando formularios y reglas específicos de S.11, S.00, S.21 y S.22 donde correspondan.

## Decisiones que el equipo puede tomar desde ahora

- La solicitud funciona como expediente/ticket y puede contener varios productos.
- Cada solicitud tiene propietario solicitante, responsable interno opcional, estado y actividad visible.
- Los archivos pertenecen a la solicitud y opcionalmente a un producto; el informe y la evidencia también se relacionan con el expediente.
- El historial de negocio y las notas de usuario se conservan; una edición no borra el rastro.
- Contrato Abierto es la única modalidad prioritaria para la primera entrega.
- No se automatizan precios, valores atípicos ni publicación oficial sin metodología aprobada.

## Referencias

- [Orientación basada en la respuesta del INE](./orientacion-respuesta-ine.md)
- [Modelo de datos actual](./modelo-datos.md)
- [Esquema Prisma](../prisma/schema.prisma)
- [Contrato HTTP actual](../.github/modernize/assessment/engines/facts/api-service-contracts.md)
- [Sistema de tickets de referencia: modelos](../../Front-Pruebas-main/Front-Pruebas-main/tickets/models.py)
- [Sistema de tickets de referencia: rutas](../../Front-Pruebas-main/Front-Pruebas-main/tickets/urls.py)
