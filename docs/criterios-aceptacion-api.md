# Criterios de aceptación para las APIs

## Alcance

El backend expone hoy 93 operaciones, descritas en OpenAPI; el estado de cada una está en [estado-y-siguientes-pasos.md](./estado-y-siguientes-pasos.md). Los escenarios siguientes son los criterios con los que se revisa cada endpoint y se convierten en pruebas automatizadas. Los casos que dependen de reglas de negocio deben confirmarse antes de convertirlos en contratos definitivos.

El inventario técnico de la superficie actual está en [API & Service Communication Contracts](../.github/modernize/assessment/engines/facts/api-service-contracts.md).

## Estado actual

| Caso | Criterio | Estado |
|---|---|---|
| `GET /api/v1/salud` | Responde HTTP 200 con `estado` y `servicio`; no revela configuración ni datos internos. | Implementado; cubierto por la prueba E2E existente. |
| CORS | Solo permite los orígenes configurados. | Configurado; falta una prueba de integración que verifique origen permitido y denegado. |
| Validación de entrada | El pipe global transforma los DTO y rechaza propiedades no declaradas; los errores salen como `VALIDACION_FALLIDA` (RFC 7807). | Implementado y ejercitado por los DTO de registro, invitaciones y solicitudes. |
| Límite general | El límite predeterminado es 100 solicitudes por minuto; salud lo omite. | Configurado; falta validar el comportamiento detrás del proxy de producción. |
| Autenticación, autorización y controles de propietario | Las rutas protegidas requieren identidad y permisos aplicables al recurso. | Implementado en solicitudes S.00 con pruebas unitarias y de humo; debe aplicarse a cada ruta nueva (adjuntos, S.11, S.21 y S.22). |
| Registro externo | Proveedores por invitación; solicitantes con verificación de correo y aprobación manual previa al envío. | Implementado y verificado contra PostgreSQL (ver README). Falta recuperación de contraseña. |

## Escenarios para futuras APIs

| ID | Escenario de aceptación | Resultado esperado |
|---|---|---|
| API-SEC-01 | Llamar a una ruta protegida sin credenciales, o con credenciales inválidas o vencidas. | La solicitud se rechaza con 401 y no devuelve datos protegidos. |
| API-SEC-02 | Un usuario autenticado solicita una acción que su rol no permite. | La solicitud se rechaza con 403; puede responder 404 cuando la política de privacidad o existencia del recurso lo requiera. |
| API-SEC-03 | Un proveedor consulta o modifica productos, precios o archivos pertenecientes a otro proveedor. | La autorización se comprueba sobre el recurso, no solo sobre el rol o el ID recibido; el acceso se deniega sin filtrar datos. |
| API-SEC-04 | Enviar cuerpo inválido, tipo incorrecto, propiedad desconocida o parámetros fuera del formato acordado. | Se devuelve 400 con un error estable y sin stack trace; no se persiste una operación parcial. |
| API-SEC-05 | Enviar texto con etiquetas o scripts como valor de un campo. | La API lo trata como dato JSON y no lo ejecuta ni lo devuelve como HTML. La interfaz debe renderizarlo como texto escapado. |
| API-SEC-06 | Buscar o filtrar con entradas que incluyan sintaxis SQL. | La entrada no altera la consulta ni permite leer o modificar registros fuera del alcance autorizado. |
| API-SEC-07 | Superar el límite aplicable a autenticación, invitaciones, importación o escritura. | Se responde 429 con una política documentada; la cuota y la ventana se definen por endpoint y riesgo. |
| API-SEC-08 | Enviar encabezados de IP falsificados directamente o a través del proxy/CDN configurado. | El límite se calcula usando únicamente la cadena de proxies confiables; encabezados no confiables no permiten evadirlo. |
| API-SEC-09 | Subir un archivo con extensión permitida pero contenido inválido, tipo no permitido o tamaño excesivo. | Se rechaza con 400, 413 o 415 según el caso; no queda publicado ni accesible como archivo estático. |
| API-SEC-10 | Descargar un adjunto con una identidad sin acceso a su solicitud o producto. | La descarga se deniega; los adjuntos se guardan en almacenamiento privado y no se exponen mediante una URL pública predecible. |
| API-SEC-11 | Obtener o actualizar un recurso mediante DTO de respuesta o petición. | Solo se exponen campos permitidos; nunca contraseñas, hashes, tokens, secretos ni claves internas de almacenamiento. |
| API-SEC-12 | Provocar un error inesperado en una operación. | Se devuelve un error genérico con identificador de correlación; no se exponen consultas, rutas del servidor, secretos ni trazas. |
| API-SEC-13 | Importar una hoja o archivo estructurado inválido o que excede los límites acordados. | La operación informa errores por fila o archivo, no genera escrituras parciales no confirmadas y conserva la fila original necesaria para auditoría. |
| API-SEC-14 | Completar una acción relevante, como cambiar estado, precio, usuario o archivo. | Se registra actor, fecha, acción y recurso; los registros no guardan credenciales, tokens ni contenido sensible innecesario. |
| API-SEC-15 | Crear o enviar una solicitud sin una cuenta autenticada, o intentar enviarla antes de verificar el correo y aprobar el perfil solicitante. | Se rechaza la operación; cada solicitud aceptada queda vinculada al usuario autenticado en `creadaPorId`. |
| API-SEC-16 | Intentar activar una cuenta de proveedor sin invitación válida o asignar roles privilegiados desde un registro público. | Se rechaza la operación; la asignación de roles administrativos corresponde al administrador. |
| API-SEC-17 | Un solicitante accede a una solicitud de otra institución o un proveedor a datos de otra empresa. | La autorización aplica por recurso y organización propietaria, además del rol. |
| API-SEC-18 | Consultar o registrar DPI/CUI. | El dato completo no aparece en respuestas, listados ni logs; se cifra en el servidor, se enmascara en la interfaz y solo lo revisa personal autorizado. La primera versión no almacena imagen del documento. |
| API-SEC-19 | Realizar una operación de escritura con sesión basada en cookie desde un origen no autorizado o sin la protección CSRF correspondiente. | La solicitud se rechaza; cookies `HttpOnly`, `Secure` en producción y `SameSite` adecuado no reemplazan la validación CSRF. |

## Requisitos para pruebas y despliegue

- Implementar pruebas unitarias para reglas de autorización y pruebas E2E para códigos HTTP, errores, DTO y límites.
- Cubrir acceso anónimo, rol incorrecto, propietario distinto y recurso inexistente; no comprobar únicamente el caso exitoso.
- Mantener CORS limitado a los orígenes de despliegue. Habilitar credenciales de navegador solo si el mecanismo de sesión lo requiere y se han definido las protecciones CSRF.
- Diseño recomendado para React: sesión opaca en cookie `HttpOnly`, `Secure` en producción y `SameSite` apropiado, con protección CSRF para escrituras. No guardar tokens de sesión en `localStorage`. Configurar el dominio mediante `COOKIE_DOMAIN` por entorno (sin valor fijo en desarrollo) y los orígenes mediante `CORS_ORIGINS`; la configuración actual todavía no habilita credenciales CORS ni define dominio de cookie.
- Antes de publicar detrás de Cloudflare u otro proxy, configurar y probar explícitamente la confianza de proxy. No confiar en `X-Forwarded-For` recibido desde clientes directos.
- Terminar TLS en el punto de entrada público y verificar HTTPS/HSTS en producción; el proceso local no sustituye esa configuración.
- Almacenamiento de adjuntos privado, validación de tipo por contenido además de extensión, límites de tamaño y autorización en cada descarga.
- Verificar identidad manualmente antes de habilitar envíos. DPI/CUI es dato personal: recolectar solo lo necesario, cifrarlo en la aplicación, restringir su lectura, enmascararlo y definir aviso de privacidad y retención antes del despliegue.
- Acordar un formato uniforme de errores sin detalles internos y sin registrar contraseñas, tokens, secretos ni cuerpos completos de solicitudes sensibles.

## Decisiones necesarias antes de fijar contratos

1. Confirmar con el INE el alcance del DPI/CUI, aviso de privacidad, retención y proceso de revisión manual antes de recolectarlo en producción.
2. Elegir el proveedor de correo y configurar remitente y credenciales para verificación e invitaciones.
3. Acordar tipos y tamaños máximos de archivos y el servicio privado donde se almacenarán.
4. Definir cuotas por endpoint y rangos de proxy confiable para el despliegue detrás de Cloudflare.
5. Confirmar si el mínimo de tres cotizaciones para bienes importados aplica por expediente o producto; mantenerlo configurable hasta entonces.
6. Confirmar con el INE si la entrega digital reemplazará oficialmente la entrega física/CD; hasta entonces registrar método, fecha y estado de recepción.
7. Configurar `COOKIE_DOMAIN` y `CORS_ORIGINS` cuando se conozcan los dominios reales; no fijarlos en el código.

## Coordinación

El flujo de coordinación puede usar estos escenarios para revisar formularios, preparar pruebas manuales y verificar que cada PR incluya evidencia. El flujo de implementación debe convertir los criterios aplicables en pruebas automatizadas junto con cada endpoint; cada criterio aplica a las rutas que ya existen y a las que se añadan.
