# Base de datos: expediente de Contrato Abierto

Resumen de lo agregado sobre la base que ya existía (`solicitudes_precio`, productos, catálogo INE e identidad). No se creó un sistema de tickets aparte. El catálogo importado no se modificó.

## Cambios aplicados

Tres migraciones, en este orden:

1. `20261125170000_expediente_contrato_abierto`
2. `20261125183000_investigacion_informe_entrega`
3. `20261125193000_avisos`

### Expediente

Sobre `solicitudes_precio`:

- `codigo`, único, con formato `PR-año-######`. El consecutivo vive en `solicitud_correlativo`.
- `asignada_a_id`, responsable del INE. Asignar no cambia el estado.

Estados nuevos en `estado_solicitud`, agregados al final del tipo:

- `PENDIENTE_SUBSANACION`
- `EN_INVESTIGACION`
- `EN_INFORME`
- `EN_ENTREGA`

Se conservan `BORRADOR`, `RECIBIDA`, `EN_REVISION`, `EN_ANALISIS`, `COMPLETADA` y `RECHAZADA`.

Tablas nuevas:

- `solicitud_comentarios`: observación visible o nota interna.
- `solicitud_historial`: cada paso queda escrito. Corregir o reenviar no borra filas.

### Investigación, análisis, informe y entrega

- `fuentes_consulta`: registro cerrado de fuentes. El país solo puede ser `GT`. Si hay dominio, tiene que terminar en `.gt`. Ya queda cargada la fuente «Catálogo de precios de referencia del INE».
- `consultas_mercado` y `precios_consultados`: la boleta. Precio, moneda, unidad, producto del expediente, evidencia en texto y, si aplica, la fila del catálogo consultada. El precio lo escribe una persona. Enlazar el catálogo no copia ni adopta ese precio. Un precio puede marcarse como atípico.
- `validaciones_analisis`: un precio vigente por producto, con el criterio escrito por el analista. Confirmarlo lo deja como resultado oficial. No hay fórmula.
- `informes_solicitud`: versiones de informe técnico y oficio. El destinatario es texto libre. Emitir no borra los borradores anteriores.
- `entregas_solicitud`: una o varias entregas, con medio `DIGITAL`, `FISICA` o `CD`, destinatario y constancia en texto.

### Avisos

- `notificaciones`: aviso para quien creó el expediente y para quien lo tiene asignado. Quien realiza la acción no se avisa a sí mismo. Una nota interna no le llega a la entidad. Se pueden marcar como leídos.

## Lo que falta, y por qué

| Pendiente | Por qué no está en la base |
|---|---|
| Formularios S.11, S.21 y S.22 | Son otras modalidades. Este corte es solo Contrato Abierto. Las tablas de comisión e importación ya existían y no se usaron para este flujo. |
| Estadísticas, promedios o cálculo del precio | El INE no entregó la fórmula. El precio oficial lo escribe y confirma el analista. |
| Archivos de evidencia, informe y constancia | `solicitudes_adjuntos` ya guarda metadatos, pero no hay almacén ni tipos obligatorios confirmados. Por ahora la evidencia y la constancia son texto. |
| Recordatorios por vencimiento | No hay plazos definidos. Los avisos solo informan algo que ya ocurrió. |
| Plantilla oficial del informe | El texto guardado es un borrador armado con los datos del expediente, marcado como no oficial. |

La pantalla del portal no vive en este repositorio. Estas tablas y las rutas que las usan son lo que esa pantalla puede consumir.
