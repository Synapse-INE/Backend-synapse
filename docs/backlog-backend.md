# Backlog para cerrar el backend

**Corte:** 25 de noviembre de 2026
**Propósito:** lista de lo que queda para considerar terminado el backend. El frontend se desarrolla por separado y consume el contrato OpenAPI (`/api/v1/openapi.json`, ver el [README](../README.md#documentación-openapi)); cada entrega debe actualizar ese contrato y sus pruebas.

## Qué ya está hecho

| Ítem | Área | Estado |
|---|---|---|
| — | Autenticación, sesiones opacas, CSRF, roles y propiedad | Listo |
| — | Auditoría con IP y errores RFC 7807 (también para errores no previstos) | Listo |
| — | Registro, verificación de correo, invitaciones y revisión de solicitantes | Listo |
| — | Solicitudes S.00 y ciclo del expediente (consultas, validaciones, informes, entregas, pausa, cancelación, colaboradores, avisos) | Listo |
| B-01 | Primer administrador por comando, recuperación y cambio de contraseña | Listo |
| B-02 | Alta de personal, bloqueo y desbloqueo, roles | Listo |
| B-03 | Consulta de auditoría con filtros por actor, acción, recurso, IP y fechas | Listo |
| B-04 | Adjuntos privados de las solicitudes | **Parcial:** en disco local; falta almacenamiento de objetos para producción |
| B-05 | CI, readiness, `x-request-id` con registro por petición, imagen sin privilegios | **Parcial:** falta la configuración de GitHub (rama por defecto y protección de `main`) |
| B-06 | Borrado y cancelación de solicitudes; avisos | Listo (los avisos son internos; no hay correo por cambio de estado) |
| B-07 | Requisitos del producto con aprobación del INE | Listo |
| B-08 | Formulario S.11: empresas propuestas por producto | Listo |
| B-09 | Formularios S.21 y S.22: comisión, cotizaciones de importación, justificaciones | Listo |
| B-10 | Catálogo INE por HTTP: carga, filas, alias, reprocesado | Listo |
| B-11 | Catálogo de proveedores con historial de precios | **Parcial:** falta la importación masiva con staging |
| B-12 | Estadísticas e informes | Implementado (borrador de informe y estadísticas por expediente); la metodología espera confirmación del INE |
| B-14 | Límite de inicios de sesión por cuenta | **Parcial:** ver pendientes |

Cada ítem se considera terminado con: migración si cambia la persistencia, validación de entrada, autorización por rol **y** propiedad, auditoría, pruebas (unitarias y contra PostgreSQL), OpenAPI actualizado y una entrada en [trazabilidad.md](./trazabilidad.md).

## Pendiente

### B-04 · Adjuntos en producción
- Interfaz `AlmacenamientoPrivado` con la implementación actual en disco y otra compatible con S3 (requiere añadir el SDK y elegir proveedor).
- **Dependencia:** decisión del INE sobre tipos documentales y tamaño máximo; hoy se aceptan PDF de hasta 10 MB verificados por firma.
- Mientras tanto, en producción el directorio `ALMACENAMIENTO_DIR` debe ser un volumen persistente con copia de seguridad (el compose ya lo declara).

### B-05 · Configuración de GitHub (no es código)
- Dejar `develop` como rama por defecto y proteger `main` (solo PR desde `develop`, CI obligatoria). Evita que se repita la fusión de PR a `main` por error.

### B-06 · Correo por cambio de estado
- Los avisos viven en el portal. Si el INE quiere correo, enviar uno de mejor esfuerzo al solicitante sin datos sensibles.

### B-11 · Importación masiva de productos del proveedor
- Carga por lotes con staging y validaciones (`ImportacionProveedor`, `FilaImportacionProveedor`), análoga a la del INE. Los modelos existen; no hay código.

### B-13 · Búsqueda externa e IA
- Módulo `integraciones` (hoy vacío) con una interfaz por proveedor, tiempos de espera, reintentos acotados y registro de cada consulta; las respuestas de terceros se tratan como datos no confiables.
- Coincidencia asistida entre productos solicitados y referencias, siempre con revisión humana y trazabilidad de la fuente.
- **Dependencia:** elegir proveedor y credenciales; sin ellos no hay qué integrar.

### B-14 · Seguridad adicional
- DPI/CUI: sigue sin recolectarse; solo se habilita tras la aprobación del aviso de privacidad, retención y eliminación por el INE (cifrado de aplicación, enmascarado en respuestas).
- Revisión de dependencias: `npm audit` reportó 2 vulnerabilidades moderadas transitivas (`exceljs` → `uuid`); evaluar `overrides` o reemplazar la librería. Cambiar dependencias exige `npm ci` y no regenerar el lock en Windows (quita paquetes opcionales que la CI de Linux necesita).
- Prueba del envío de correo con un SMTP real.

## Decisiones del INE que bloquean o condicionan reglas

1. Mínimo de cotizaciones o empresas: por expediente o por producto (S.11, S.21). **Se aplica por producto** (3), con eximente `COTIZACIONES_INSUFICIENTES` en importados.
2. Tratamiento de Contrato Abierto en el portal (se asumió copia digital dirigida a la DGAE).
3. Recepción física: si el portal registra fecha y estado de entrega (se asumió que sí).
4. Estados y autorizaciones por rol en cada etapa (se aplicó el flujo documentado en el README).
5. Tipos documentales y tamaño máximo de adjuntos (B-04).
6. Dominios de correo permitidos para el registro (`REGISTRO_DOMINIOS_PERMITIDOS`).
7. Reglas estadísticas y de redondeo (B-12).
8. Aviso de privacidad y retención para DPI/CUI (B-14).
9. Las 5 filas del catálogo con precio `Sin Dato` y los alias de modalidad pendientes (se resuelven desde `/alias-modalidad`).

## Definición de «backend terminado»

Todo lo anterior marcado como listo, la configuración de GitHub aplicada, las decisiones 1, 5 y 7 respondidas por el INE y un despliegue de aceptación con PostgreSQL, SMTP y almacenamiento reales.
