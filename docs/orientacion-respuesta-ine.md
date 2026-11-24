# Orientación del proyecto según la respuesta del INE

**Fecha:** 24 de noviembre de 2026  
**Propósito:** alinear al equipo sobre el alcance de la propuesta, priorizar una primera entrega y separar las indicaciones recibidas de los puntos que todavía requieren definición.

## Resumen

La respuesta de la Dirección de Precios e Índices de Referencia (DPIR) confirma que la propuesta puede abarcar Contrato Abierto, Subasta Electrónica Inversa y Bienes y Suministros Importados, pero recomienda iniciar con **Contrato Abierto**. Esta modalidad concentra la mayor cantidad de solicitudes y el trabajo de recolección y análisis de datos.

La primera versión debe apoyar el trabajo técnico-estadístico del INE: recibir y revisar solicitudes, organizar la investigación de mercado, facilitar el análisis, preparar el informe y dar seguimiento a la entrega oficial. No debe representar el proceso de convocatoria, evaluación o adjudicación que corresponde a otras instancias.

## Qué confirmó el INE

### Prioridad de modalidades

1. **Primera etapa: Contrato Abierto.**
2. **Etapas posteriores:** Subasta Electrónica Inversa y Bienes y Suministros Importados.
3. La ampliación debe hacerse gradualmente, después de validar el flujo inicial con personal del INE.

### Participación del INE en Contrato Abierto

Según la respuesta recibida, el flujo técnico de la DPIR comprende:

1. **Solicitud:** la presenta la entidad requirente.
2. **Revisión:** el INE verifica que la descripción técnica sea adecuada y que la cantidad y unidad de medida estén definidas correctamente.
3. **Investigación:** se recolecta información de mercado, incluyendo boletas de precios y el directorio de proveedores relacionados con los productos.
4. **Análisis:** el analista consolida y valida la información, e identifica datos atípicos que puedan afectar los resultados.
5. **Informe:** se elabora un informe técnico y un oficio con los precios de referencia por producto.
6. **Entrega:** se remiten oficialmente los resultados a la dirección de adquisiciones correspondiente, antes de la apertura de plicas, según la respuesta del INE.

Si la documentación está incompleta o presenta inconsistencias, el INE comunica observaciones a la entidad requirente para que las atienda antes de continuar.

La respuesta menciona coordinación con GUATECOMPRAS y con un enlace de la dirección de adquisiciones, pero no especifica integraciones, intercambio automatizado de datos ni responsabilidades operativas de esos sistemas. No se deben incluir esas integraciones como alcance confirmado.

### Formularios y modalidades

- **Contrato Abierto:** la respuesta no identifica qué formato específico debe presentarse para iniciar o tramitar esta modalidad. Hay que solicitar confirmación y los formatos vigentes.
- **Subasta Electrónica Inversa:** el formato S.11 corresponde específicamente a esta modalidad.
- **Bienes y Suministros Importados:** se utilizan S.00, S.21 y S.22. Un expediente puede incluir varios productos. Cuando participan varios proveedores, el INE recomienda un juego de formularios por proveedor para facilitar el análisis; también acepta información consolidada si los productos, proveedores y datos quedan claramente identificados.

### Otros criterios recibidos

- Para Bienes y Suministros Importados, el requisito general es presentar tres cotizaciones. Si no se consiguen, puede presentarse una justificación formal con evidencia y un oficio de aval suscrito por la máxima autoridad de la entidad solicitante. La respuesta menciona como ejemplo la existencia de un único proveedor capaz de suministrar el producto.
- La entrega **física y en CD sigue vigente**. También se realiza una entrega digital; la respuesta no indica que esta sustituya la entrega física o en CD.
- En las cotizaciones de bienes importados deben presentarse los valores originales sin descuentos. El flete y el seguro deben reflejar quién los contratará y cómo se ofrecen comercialmente.
- Para investigar el mercado, el INE consulta empresas privadas relacionadas con los insumos y otras entidades pertinentes. No se especificaron sitios web, proveedores autorizados ni mecanismos de extracción automatizada.

## Alcance recomendado para la primera versión

### Objetivo

Crear una herramienta de apoyo para el expediente técnico de Contrato Abierto, que mantenga la solicitud, las revisiones, la evidencia de investigación, el análisis y la entrega trazables y accesibles únicamente a las personas autorizadas.

### Flujo funcional inicial

| Etapa | Apoyo que podría brindar el portal | Aspectos por confirmar con el INE |
|---|---|---|
| Solicitud | Registrar la entidad requirente, los productos y sus datos; adjuntar los documentos que el INE solicite. | Formato de ingreso, campos obligatorios, documentos iniciales y quién puede presentar la solicitud. |
| Revisión | Mostrar los datos técnicos de cada producto y registrar observaciones, subsanaciones y responsable. | Criterios completos, plazos y cómo se comunica la prevención a la entidad. |
| Investigación | Organizar boletas, proveedores consultados, fechas, respuestas y documentos fuente. | Formato de las boletas, directorio vigente, cobertura geográfica y reglas de contacto/consulta. |
| Análisis | Consolidar datos por producto y conservar validaciones y observaciones sobre valores atípicos. | Metodología oficial, reglas de exclusión, estadísticos, redondeo y aprobación del resultado. |
| Informe | Preparar el expediente de resultados y conservar sus versiones y responsables. | Plantilla oficial, firmantes, aprobaciones internas y campos requeridos en informe y oficio. |
| Entrega | Registrar la fecha, destinatario, medio, documentos entregados y constancia disponible. | Canal oficial, destinatarios, evidencia de recepción y relación con la entrega digital, física y en CD. |

Esta tabla expresa una propuesta de apoyo al flujo descrito; no significa que el INE haya aprobado los campos, estados, permisos o automatizaciones del portal.

## Límites importantes

- El portal se enfoca en la gestión técnica-estadística de precios de referencia que realiza la DPIR. No inicia ni administra la convocatoria de Contrato Abierto que corresponde a la dirección de adquisiciones.
- El portal no adjudica procesos ni reemplaza las decisiones de la Junta de Calificación.
- Un expediente digital no reemplaza la entrega física y en CD mientras el INE mantenga ese requisito.
- El analista del INE conserva la responsabilidad sobre la validación y el análisis. Una automatización o IA puede, si se autoriza en el futuro, asistir y presentar evidencia; no debe emitir por sí sola el precio oficial.
- No se debe asumir una fórmula de promedio, mediana, regla de descarte de atípicos, plazo de atención o canal de integración: la respuesta no los define.
- La respuesta no confirma un portal de autoservicio para proveedores ni autoriza a importar automáticamente precios desde páginas web.

## Implicaciones para el diseño del sistema

1. Modelar desde el inicio la modalidad de la solicitud, pero priorizar validaciones y experiencia de Contrato Abierto.
2. Mantener separados los datos de solicitud, productos, observaciones, consultas de mercado, respuestas de proveedores, análisis e informe. Evitar guardar todas las etapas en un único campo de texto o estado genérico.
3. Conservar la fuente de cada dato consultado: proveedor o entidad, fecha, producto, precio y unidad reportados, documento de respaldo y persona que registró o validó la información.
4. Permitir correcciones y reenvíos sin borrar el historial de observaciones ni sustituir silenciosamente la evidencia previa.
5. Diferenciar el informe técnico y oficio generados de la evidencia de su entrega; guardar quién preparó, revisó, aprobó y registró cada acción.
6. Mantener control de acceso por rol y expediente. Las solicitudes y documentos institucionales no deben ser públicos por defecto.
7. Diseñar la carga de archivos con almacenamiento privado, límites de tamaño y tipo, validación de contenido y registro de acceso.
8. No recolectar información personal que no sea necesaria para el trámite. La recolección de DPI/CUI sigue condicionada a la aprobación de finalidad, aviso, acceso, retención y eliminación.

## Decisiones para el equipo

- **Prioridad del producto:** Contrato Abierto primero; las otras dos modalidades quedan como ampliaciones.
- **Prioridad de implementación:** definir con DPIR el formulario de ingreso y sus validaciones; después construir una entrega vertical del flujo Solicitud → Revisión → Investigación → Análisis → Informe → Entrega.
- **Investigación inicial:** priorizar el registro de fuentes y evidencia que ya usa el INE (boletas y directorio de proveedores), no una búsqueda web automatizada.
- **Cálculos:** no codificar métodos estadísticos ni umbrales de datos atípicos hasta obtener la metodología aplicable y sus reglas de aprobación.
- **Entrega:** contemplar seguimiento digital, pero registrar también las entregas física y en CD mientras sigan vigentes.
- **Ampliación:** incorporar S.11, S.00/S.21/S.22 y las particularidades de las otras modalidades en fases separadas.

## Puntos que falta precisar con el INE

1. ¿Qué formulario, plantilla o canal inicia una solicitud de precio de referencia para Contrato Abierto? ¿Cuáles campos y documentos son obligatorios?
2. ¿La entidad requirente debe cargar la solicitud formal dirigida a la dirección de adquisiciones? ¿Qué evidencia espera recibir la DPIR?
3. ¿Cuáles son los estados oficiales, responsables por etapa, tiempos de atención y reglas para subsanar observaciones?
4. ¿Qué datos debe conservar cada boleta y qué versión del directorio de proveedores debe considerarse oficial?
5. ¿Qué metodología estadística, reglas de validación, tratamiento de datos atípicos y redondeo se aplican?
6. ¿Quién revisa y aprueba el precio de referencia y el informe antes de emitir el oficio?
7. ¿Qué canal se utiliza para la entrega digital y cómo se registra la entrega física y en CD?
8. En la respuesta aparecen las siglas **DGAE** y **DIGAE**. ¿Cuál es la denominación y sigla oficial que debe usarse en formularios, destinatarios y documentación del portal?
9. ¿Qué tratamiento y nivel de confidencialidad corresponde a la información recopilada antes y después de la emisión del precio de referencia?

## Próximos pasos sugeridos

1. Compartir este documento con frontend y backend para alinear el alcance de la primera versión.
2. Solicitar al INE los formatos y campos específicos para el flujo de Contrato Abierto, junto con la metodología de análisis que pueda compartirse.
3. Elaborar un diagrama detallado del proceso y validar actores, estados, documentos y notificaciones con la DPIR.
4. Convertir ese flujo validado en contratos de API y pantallas; mantener separados los campos confirmados y los pendientes.
5. Implementar una primera entrega de solicitud y revisión con auditoría y permisos; no avanzar a cálculos automáticos sin validar reglas y datos.
6. Revisar la entrega, seguridad y retención de documentos con el INE antes de habilitar datos reales.

## Referencia y alcance de esta nota

Este documento resume la respuesta compartida por el equipo el 24 de noviembre de 2026 y la convierte en orientación de producto. No sustituye la normativa, las guías, los formatos oficiales ni una validación formal del INE. Ante diferencias entre la respuesta recibida y la documentación vigente, se debe solicitar confirmación antes de convertir una interpretación en regla de negocio.
