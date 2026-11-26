import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../../common/auth/auth-context.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  ApiLimite,
  ApiProblema,
  ApiProtegido,
} from '../../infrastructure/openapi/decoradores.js';
import {
  ActualizarSolicitudDto,
  AsignarSolicitudDto,
  CambiarEstadoDto,
  CrearComentarioDto,
  CorregirConsultaDto,
  CrearConsultaDto,
  CrearInformeDto,
  CrearSolicitudDto,
  ListarSolicitudesDto,
  MarcarAtipicoDto,
  RegistrarEntregaDto,
  RegistrarValidacionDto,
} from './solicitudes.dto.js';
import { AdjuntosService, type ArchivoRecibido } from './adjuntos.service.js';
import { SolicitudesService } from './solicitudes.service.js';

const EJEMPLO_SOLICITUD = {
  id: 'b89c6820-0292-47d5-bb7a-4e5e85bdc7c5',
  titulo: 'Guantes de nitrilo',
  descripcion: 'Compra anual',
  institucionSolicitante: 'Ministerio de Prueba',
  institucionSolicitanteId: 'aaaaaaaa-0000-4000-8000-000000000001',
  modalidad: 'CONTRATO_ABIERTO',
  unidadEjecutora: 'Unidad de Compras',
  fechaFormulario: '2026-11-24T00:00:00.000Z',
  enlaceNombre: 'Persona Enlace',
  enlaceCargo: 'Jefe de Compras',
  autoridadNombre: 'Persona Autoridad',
  autoridadCargo: 'Director',
  estado: 'BORRADOR',
  codigo: 'PR-2026-000001',
  creadaPorId: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
  asignadaAId: null,
  asignadaA: null,
  enviadaEn: null,
  createdAt: '2026-11-24T20:00:00.000Z',
  updatedAt: '2026-11-24T20:00:00.000Z',
  productos: [
    {
      id: '0b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      numero: 1,
      nombre: 'Guantes',
      codigoSiges: null,
      especificacionesTecnicas: 'Nitrilo talla M',
      unidadMedida: 'Caja',
      cantidad: '10.5',
    },
  ],
  comentarios: [],
  historial: [
    {
      id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      accion: 'Solicitud creada',
      estadoAnterior: null,
      estadoNuevo: 'BORRADOR',
      detalle: 'PR-2026-000001',
      createdAt: '2026-11-24T20:00:00.000Z',
      actor: { id: '497f6eca-6276-4993-bfeb-53cbbbba6f08', nombre: 'Ana Solicitante' },
    },
  ],
};

@Controller('solicitudes')
@Roles('SOLICITANTE', 'JEFE', 'TRABAJADOR_INE', 'ADMIN')
@ApiTags('Solicitudes de precio (S.00)')
export class SolicitudesController {
  constructor(
    private readonly solicitudes: SolicitudesService,
    private readonly adjuntos: AdjuntosService,
  ) {}

  @Post()
  @Roles('SOLICITANTE')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiProtegido({ csrf: true, roles: 'SOLICITANTE' })
  @ApiOperation({
    summary: 'Crear un borrador de solicitud',
    description:
      'Queda ligada al usuario y a su institución. Un borrador puede estar incompleto; ' +
      'los requisitos se validan al enviar. Las cantidades viajan como cadena decimal y la fecha como `YYYY-MM-DD`.',
  })
  @ApiCreatedResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(400, 'Datos inválidos (`VALIDACION_FALLIDA`).')
  @ApiProblema(422, 'La cuenta no tiene institución asociada (`SIN_INSTITUCION`).')
  @ApiLimite()
  crear(@Body() body: CrearSolicitudDto, @Req() request: AuthenticatedRequest) {
    return this.solicitudes.crear(body, request.auth, request.ip);
  }

  @Get()
  @ApiProtegido({ csrf: false })
  @ApiOperation({
    summary: 'Listar solicitudes',
    description:
      'El solicitante ve sus borradores y lo enviado por su institución. ' +
      'El personal del INE ve solo lo enviado, primero lo que lleva más tiempo de atención. `asignadasAMi=true` limita la lista al responsable. ' +
      'Cada expediente enviado trae `atencion`: 15 días corridos desde el envío. No es una meta. ' +
      'El conteo se detiene mientras la entidad corrige y sigue durante la espera interna del INE. ' +
      'Paginación con `limite` (1–100, por defecto 25) y `desplazamiento`.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        total: 1,
        solicitudes: [
          {
            id: EJEMPLO_SOLICITUD.id,
            codigo: EJEMPLO_SOLICITUD.codigo,
            titulo: EJEMPLO_SOLICITUD.titulo,
            modalidad: 'CONTRATO_ABIERTO',
            estado: 'RECIBIDA',
            asignadaAId: null,
            institucionSolicitante: 'Ministerio de Prueba',
            creadaPorId: EJEMPLO_SOLICITUD.creadaPorId,
            enviadaEn: '2026-11-24T21:00:00.000Z',
            createdAt: '2026-11-24T20:00:00.000Z',
            _count: { productos: 1 },
          },
        ],
      },
    },
  })
  listar(
    @Query() filtros: ListarSolicitudesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.listar(filtros, request.auth);
  }

  @Get(':id')
  @ApiProtegido({ csrf: false })
  @ApiOperation({ summary: 'Consultar una solicitud con sus productos' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(
    404,
    'No existe o no es visible para el usuario (`SOLICITUD_NO_ENCONTRADA`); no se distingue para no revelar su existencia.',
  )
  obtener(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.obtener(id, request.auth);
  }

  @Patch(':id')
  @Roles('SOLICITANTE')
  @ApiProtegido({ csrf: true, roles: 'SOLICITANTE' })
  @ApiOperation({
    summary: 'Editar un borrador o una subsanación',
    description:
      'Solo el autor, y solo en `BORRADOR` o `PENDIENTE_SUBSANACION`. Si se envía `productos`, reemplaza por completo la lista.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(400, 'Datos inválidos (`VALIDACION_FALLIDA`).')
  @ApiProblema(404, 'No existe o no es visible (`SOLICITUD_NO_ENCONTRADA`).')
  @ApiProblema(409, 'Ya fue enviada (`SOLICITUD_NO_EDITABLE`).')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ActualizarSolicitudDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.actualizar(id, body, request.auth, request.ip);
  }

  @Post(':id/enviar')
  @Roles('SOLICITANTE')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'SOLICITANTE' })
  @ApiOperation({
    summary: 'Enviar la solicitud al INE',
    description:
      'Exige modalidad, unidad ejecutora, fecha del formulario, enlace, autoridad y al menos un producto ' +
      'con especificaciones, unidad de medida y cantidad mayor que cero. Pasa a `RECIBIDA`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: { example: { ...EJEMPLO_SOLICITUD, estado: 'RECIBIDA' } },
  })
  @ApiProblema(404, 'No existe o no es visible (`SOLICITUD_NO_ENCONTRADA`).')
  @ApiProblema(409, 'Ya fue enviada (`SOLICITUD_NO_EDITABLE`).')
  @ApiProblema(
    422,
    'Faltan requisitos (`SOLICITUD_INCOMPLETA`); `errors` lista cada campo faltante.',
  )
  enviar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.enviar(id, request.auth, request.ip);
  }

  @Post(':id/estado')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Cambiar el estado de una solicitud',
    description:
      'Camino: `RECIBIDA → EN_REVISION → EN_INVESTIGACION → EN_ANALISIS → EN_INFORME → EN_ENTREGA → COMPLETADA`. ' +
      '`RECHAZADA` sale de cualquiera de esas etapas, salvo los estados terminales. ' +
      'Pasar a `EN_INFORME` exige un precio confirmado por el analista en cada producto. ' +
      'Pasar a `EN_ENTREGA` exige el documento del expediente emitido. Cerrar exige al menos una entrega con constancia. ' +
      'El jefe asigna primero a un trabajador. Después solo esa persona, un colaborador o un administrador puede avanzar. ' +
      'La devolución a la entidad no se hace aquí: va en el comentario con `devolver`. El `motivo` queda en el historial.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: { example: { ...EJEMPLO_SOLICITUD, estado: 'EN_REVISION' } },
  })
  @ApiProblema(404, 'No existe (`SOLICITUD_NO_ENCONTRADA`).')
  @ApiProblema(
    409,
    'Transición no permitida (`TRANSICION_NO_PERMITIDA`), análisis sin confirmar (`ANALISIS_INCOMPLETO`), documentos sin emitir (`INFORME_INCOMPLETO`) o entrega sin constancia (`ENTREGA_INCOMPLETA`).',
  )
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CambiarEstadoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.cambiarEstado(id, body, request.auth, request.ip);
  }

  @Post(':id/asignar')
  @Roles('JEFE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'JEFE, ADMIN' })
  @ApiOperation({
    summary: 'Asignar el expediente a un trabajador',
    description:
      'Solo el jefe. La persona debe estar activa y tener el rol `TRABAJADOR_INE`. No cambia el estado. ' +
      'No se asigna un expediente cerrado.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(404, 'No existe (`SOLICITUD_NO_ENCONTRADA`).')
  @ApiProblema(409, 'El expediente ya está cerrado (`SOLICITUD_CERRADA`).')
  @ApiProblema(422, 'La persona no es personal activo del INE (`PERSONA_NO_ASIGNABLE`).')
  asignar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AsignarSolicitudDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.asignar(id, body, request.auth, request.ip);
  }

  @Post(':id/comentarios')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Agregar una observación al expediente',
    description:
      'La entidad y el personal del INE escriben comentarios visibles. Solo el INE puede marcar `esInterno` ' +
      'o devolver el expediente (`devolver: true`), y esa devolución tiene que ser visible. ' +
      'Devolver pasa el estado a `PENDIENTE_SUBSANACION` desde revisión, investigación o análisis. Nada se borra.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(403, 'La entidad no escribe notas internas ni devuelve (`COMENTARIO_NO_PERMITIDO`).')
  @ApiProblema(404, 'No existe o no es visible (`SOLICITUD_NO_ENCONTRADA`).')
  @ApiProblema(409, 'Estado no admite la acción (`SOLICITUD_CERRADA` o `TRANSICION_NO_PERMITIDA`).')
  @ApiProblema(422, 'La devolución se marcó como interna (`DEVOLUCION_DEBE_SER_VISIBLE`).')
  comentar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CrearComentarioDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.comentar(id, body, request.auth, request.ip);
  }

  @Post(':id/reenviar')
  @Roles('SOLICITANTE')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'SOLICITANTE' })
  @ApiOperation({
    summary: 'Reenviar el expediente corregido',
    description:
      'Solo el autor y solo desde `PENDIENTE_SUBSANACION`. Vuelve a validar los mismos requisitos del envío ' +
      'y pasa a `RECIBIDA`. Conserva el responsable y la fecha del primer envío. El historial no se borra.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: { example: { ...EJEMPLO_SOLICITUD, estado: 'RECIBIDA' } },
  })
  @ApiProblema(404, 'No existe o no es visible (`SOLICITUD_NO_ENCONTRADA`).')
  @ApiProblema(409, 'No está pendiente de subsanación (`TRANSICION_NO_PERMITIDA`).')
  @ApiProblema(422, 'Sigue incompleta (`SOLICITUD_INCOMPLETA`).')
  reenviar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.reenviar(id, request.auth, request.ip);
  }

  @Post(':id/consultas')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Registrar una boleta de investigación',
    description:
      'Durante `EN_INVESTIGACION` o `EN_ANALISIS`. La fuente tiene que estar activa en el registro de Guatemala. ' +
      'El precio lo escribe quien registra la boleta; vincular una fila del catálogo no copia ni adopta ese precio.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(404, 'No existe (`SOLICITUD_NO_ENCONTRADA`).')
  @ApiProblema(409, 'La etapa no admite boletas (`ETAPA_NO_PERMITE_ACCION`).')
  @ApiProblema(
    422,
    'Fuente inactiva (`FUENTE_NO_PERMITIDA`), producto ajeno (`PRODUCTO_NO_PERTENECE`) o fila de catálogo inexistente (`REFERENCIA_NO_ENCONTRADA`).',
  )
  registrarConsulta(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CrearConsultaDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.registrarConsulta(id, body, request.auth, request.ip);
  }

  @Patch(':id/consultas/:consultaId')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Corregir una boleta ya registrada',
    description:
      'Durante `EN_INVESTIGACION` o `EN_ANALISIS`. El valor anterior queda en el historial. ' +
      'Corregir la boleta no cambia el precio que el analista ya confirmó.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'consultaId', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(404, 'La boleta no pertenece al expediente (`CONSULTA_NO_ENCONTRADA`).')
  @ApiProblema(409, 'La etapa no admite la corrección (`ETAPA_NO_PERMITE_ACCION`).')
  @ApiProblema(422, 'Sin cambios (`SIN_CAMBIOS`) o el precio no está en la boleta (`PRECIO_NO_ENCONTRADO`).')
  corregirConsulta(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('consultaId', ParseUUIDPipe) consultaId: string,
    @Body() body: CorregirConsultaDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.corregirConsulta(id, consultaId, body, request.auth, request.ip);
  }

  @Post(':id/atipicos')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Marcar o retirar un precio atípico',
    description:
      'Solo en `EN_ANALISIS` y solo sobre un precio ya registrado en una boleta de este expediente. No recalcula el precio.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(404, 'El precio no pertenece al expediente (`PRECIO_NO_ENCONTRADO`).')
  @ApiProblema(409, 'Fuera de análisis (`ETAPA_NO_PERMITE_ACCION`).')
  marcarAtipico(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MarcarAtipicoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.marcarAtipico(id, body, request.auth, request.ip);
  }

  @Post(':id/validaciones')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Registrar el precio de referencia que valida el analista',
    description:
      'Solo en `EN_ANALISIS`. Hay una validación vigente por producto; el historial conserva los cambios. ' +
      '`confirmar: true` la deja como resultado oficial. El sistema no propone ni calcula ese precio.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(409, 'Fuera de análisis (`ETAPA_NO_PERMITE_ACCION`).')
  @ApiProblema(422, 'El producto no pertenece al expediente (`PRODUCTO_NO_PERTENECE`).')
  registrarValidacion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RegistrarValidacionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.registrarValidacion(id, body, request.auth, request.ip);
  }

  @Get(':id/estadisticas')
  @Roles('JEFE', 'TRABAJADOR_INE', 'ADMIN')
  @ApiProtegido({ csrf: false, roles: 'JEFE, TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Calcular la media, la mediana y la moda del expediente',
    description:
      'Usa los precios de boleta que no están marcados como atípicos, en quetzales y en la misma unidad del producto. ' +
      'El resultado se vuelve a calcular hasta que se emite el documento; la copia emitida queda fija.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Medidas y gráfica por producto.' })
  @ApiProblema(404, 'La solicitud no existe o no es visible (`SOLICITUD_NO_ENCONTRADA`).')
  estadisticas(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.estadisticas(id, request.auth);
  }

  @Post(':id/informes')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Crear un borrador de informe técnico u oficio',
    description:
      'Solo en `EN_INFORME`. El documento reúne el informe técnico y el oficio. Si no se envía `resumen`, se arma con los datos guardados, incluida la interpretación de la media, la mediana y la moda. El analista puede corregirlo antes de emitirlo.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(409, 'Fuera de la etapa de informe (`ETAPA_NO_PERMITE_ACCION`).')
  crearInforme(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CrearInformeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.crearInforme(id, body, request.auth, request.ip);
  }

  @Post(':id/informes/:informeId/emitir')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Emitir un borrador de informe u oficio',
    description:
      'La emisión es una decisión de una persona. Congela la gráfica con los precios comparables de ese momento. Con un documento emitido ya se puede pasar a la entrega.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'informeId', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(404, 'El documento no pertenece al expediente (`INFORME_NO_ENCONTRADO`).')
  @ApiProblema(409, 'Ya emitido (`INFORME_YA_EMITIDO`) o faltan precios o el informe técnico (`ANALISIS_INCOMPLETO`, `INFORME_INCOMPLETO`).')
  emitirInforme(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('informeId', ParseUUIDPipe) informeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.emitirInforme(id, informeId, request.auth, request.ip);
  }

  @Post(':id/entregas')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Registrar una entrega oficial',
    description:
      'Solo en `EN_ENTREGA`. El medio puede ser `DIGITAL`, `FISICA` o `CD`. El destinatario es texto. ' +
      'La constancia textual sigue siendo el registro de la entrega. El PDF, si se adjunta, no es obligatorio. Puede haber varias entregas.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SOLICITUD } })
  @ApiProblema(409, 'Fuera de la etapa de entrega (`ETAPA_NO_PERMITE_ACCION`).')
  @ApiProblema(422, 'El documento citado no está emitido (`INFORME_NO_EMITIDO`).')
  registrarEntrega(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RegistrarEntregaDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.registrarEntrega(id, body, request.auth, request.ip);
  }

  @Post(':id/pausar')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Poner el expediente en espera del INE',
    description:
      'Pausa interna. No devuelve el caso a la entidad. Guarda el estado anterior para reanudarlo. ' +
      'No se pausa un borrador, una subsanación, un caso ya en espera ni uno cerrado.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(403, 'No es el responsable (`NO_ES_RESPONSABLE`).')
  @ApiProblema(409, 'El estado no admite la pausa (`TRANSICION_NO_PERMITIDA`).')
  pausar(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.solicitudes.pausar(id, request.auth, request.ip);
  }

  @Post(':id/reanudar')
  @Roles('TRABAJADOR_INE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'TRABAJADOR_INE, ADMIN' })
  @ApiOperation({
    summary: 'Reanudar un expediente en espera',
    description: 'Vuelve al estado que tenía antes de la pausa.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(409, 'No está en espera (`TRANSICION_NO_PERMITIDA`).')
  reanudar(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.solicitudes.reanudar(id, request.auth, request.ip);
  }

  @Post(':id/cancelar')
  @Roles('SOLICITANTE')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'SOLICITANTE' })
  @ApiOperation({
    summary: 'Anular un expediente enviado',
    description:
      'Solo quien lo creó. No anula un borrador (ese se elimina), ni un expediente en entrega o ya cerrado.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(409, 'Ya no se puede anular (`TRANSICION_NO_PERMITIDA`).')
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.solicitudes.cancelar(id, request.auth, request.ip);
  }

  @Delete(':id')
  @Roles('SOLICITANTE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiProtegido({ csrf: true, roles: 'SOLICITANTE' })
  @ApiOperation({
    summary: 'Eliminar un borrador',
    description: 'Solo el autor y solo mientras sigue en `BORRADOR`. Un expediente enviado se anula, no se borra.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(409, 'Ya fue enviado (`SOLO_BORRADOR`).')
  descartar(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.solicitudes.descartar(id, request.auth, request.ip);
  }

  @Post(':id/colaboradores')
  @Roles('JEFE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'JEFE, ADMIN' })
  @ApiOperation({
    summary: 'Agregar un colaborador',
    description:
      'Solo el jefe. El colaborador es un trabajador activo. Ve el expediente y puede trabajarlo junto con el responsable. El responsable sigue siendo uno.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProblema(409, 'Ya es el responsable (`YA_ES_RESPONSABLE`) o el expediente está cerrado (`SOLICITUD_CERRADA`).')
  @ApiProblema(422, 'No es personal activo (`PERSONA_NO_ASIGNABLE`).')
  agregarColaborador(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AsignarSolicitudDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.agregarColaborador(id, body, request.auth, request.ip);
  }

  @Delete(':id/colaboradores/:usuarioId')
  @Roles('JEFE', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiProtegido({ csrf: true, roles: 'JEFE, ADMIN' })
  @ApiOperation({ summary: 'Retirar un colaborador' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'usuarioId', format: 'uuid' })
  @ApiProblema(404, 'No colabora en el expediente (`COLABORADOR_NO_ENCONTRADO`).')
  quitarColaborador(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.solicitudes.quitarColaborador(id, usuarioId, request.auth, request.ip);
  }

  @Post(':id/adjuntos')
  @HttpCode(HttpStatus.CREATED)
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Adjuntar un PDF',
    description:
      'Solo PDF, hasta 10 MB. El de la solicitud lo agrega el autor en `BORRADOR` y queda fijo al enviarla. ' +
      'La evidencia de una boleta y la constancia de una entrega son opcionales: su ausencia no frena el expediente.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ schema: { example: { id: EJEMPLO_SOLICITUD.id, nombreOriginal: 'anexo.pdf', tamanoBytes: 1200 } } })
  @ApiProblema(422, 'No es PDF (`ARCHIVO_NO_PDF`), pesa más de 10 MB (`ARCHIVO_DEMASIADO_GRANDE`) o el expediente ya no admite el archivo (`ARCHIVO_NO_EDITABLE`).')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 10 * 1024 * 1024 } }))
  subirAdjunto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() archivo: ArchivoRecibido,
    @Body('consultaId') consultaId: string | undefined,
    @Body('entregaId') entregaId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adjuntos.guardar(
      id,
      archivo,
      { consultaId: uuidOpcional(consultaId, 'consultaId'), entregaId: uuidOpcional(entregaId, 'entregaId') },
      request.auth,
    );
  }

  @Get(':id/adjuntos')
  @ApiProtegido({ csrf: false })
  @ApiOperation({
    summary: 'Listar los PDF del expediente',
    description:
      'El INE ve todos. Quien lo pidió ve el PDF de la solicitud y, cuando el expediente está completado, la constancia de entrega. La evidencia de las boletas queda en el INE.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  listarAdjuntos(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.adjuntos.listar(id, request.auth);
  }

  @Get(':id/adjuntos/:adjuntoId')
  @ApiProtegido({ csrf: false })
  @ApiOperation({ summary: 'Descargar un PDF del expediente' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'adjuntoId', format: 'uuid' })
  @ApiProblema(404, 'El archivo no está en el expediente (`ADJUNTO_NO_ENCONTRADO`).')
  descargarAdjunto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('adjuntoId', ParseUUIDPipe) adjuntoId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adjuntos.descargar(id, adjuntoId, request.auth);
  }

  @Delete(':id/adjuntos/:adjuntoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiProtegido({ csrf: true })
  @ApiOperation({
    summary: 'Quitar un PDF de la solicitud',
    description: 'Solo el autor y solo en `BORRADOR`. La evidencia de una boleta y la constancia de entrega no se quitan por esta vía.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'adjuntoId', format: 'uuid' })
  quitarAdjunto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('adjuntoId', ParseUUIDPipe) adjuntoId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adjuntos.quitar(id, adjuntoId, request.auth);
  }
}

function uuidOpcional(valor: string | undefined, campo: string) {
  const texto = valor?.trim();
  if (!texto) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(texto)) {
    throw new UnprocessableEntityException({
      code: 'VALIDACION_FALLIDA',
      detail: `${campo} no es un identificador válido.`,
      errors: [{ field: campo, message: 'UUID inválido' }],
    });
  }
  return texto;
}
