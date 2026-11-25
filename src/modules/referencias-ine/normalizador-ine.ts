export type ErrorNormalizacionINE = {
  campo: string;
  codigo: string;
};

export type FilaNormalizadaINE = {
  datos: {
    tipoModalidadCodigo: string | null;
    modalidadOriginal: string | null;
    referenciaContrato: string | null;
    nog: string | null;
    eventoOriginal: string | null;
    correlativo: string | null;
    producto: string | null;
    caracteristicas: string | null;
    presentacion: string | null;
    precioReferencia: string | null;
    fechaPublicacion: Date | null;
    vigenciaHasta: Date | null;
    categoriaOriginal: string | null;
  };
  errores: ErrorNormalizacionINE[];
};

export type ValoresFilaINE = {
  correlativo: string | null;
  modalidadPrincipal: string | null;
  nog: string | null;
  eventoOriginal: string | null;
  modalidadRepetida: string | null;
  producto: string | null;
  caracteristicas: string | null;
  presentacion: string | null;
  precioReferencia: string | null;
  fechaPublicacion: string | null;
  categoriaOriginal: string | null;
  vigenciaHasta: string | null;
};

const VALORES_AUSENTES = new Set(['', 'NA', 'N/A', 'SIN DATO', 'SIN DATOS', 'NULL', '-']);

export function normalizarFilaINE(valores: ValoresFilaINE): FilaNormalizadaINE {
  const errores: ErrorNormalizacionINE[] = [];
  const modalidadPrincipal = texto(valores.modalidadPrincipal, 240, 'modalidad', errores);
  const modalidadRepetida = texto(
    valores.modalidadRepetida,
    240,
    'modalidadRepetida',
    errores,
  );

  if (modalidadPrincipal !== modalidadRepetida) {
    errores.push({ campo: 'modalidad', codigo: 'MODALIDADES_NO_COINCIDEN' });
  }

  const precioReferencia = normalizarPrecio(valores.precioReferencia, errores);
  const fechaPublicacion = normalizarFecha(
    valores.fechaPublicacion,
    'fechaPublicacion',
    errores,
  );
  const vigenciaHasta = normalizarFecha(
    valores.vigenciaHasta,
    'vigenciaHasta',
    errores,
  );

  return {
    datos: {
      tipoModalidadCodigo: modalidadPrincipal
        ? codigoModalidadConocida(modalidadPrincipal)
        : null,
      modalidadOriginal: modalidadPrincipal,
      referenciaContrato: modalidadPrincipal
        ? referenciaContrato(modalidadPrincipal)
        : null,
      nog: texto(valores.nog, 100, 'nog', errores),
      eventoOriginal: texto(valores.eventoOriginal, 240, 'eventoOriginal', errores),
      correlativo: texto(valores.correlativo, 100, 'correlativo', errores),
      producto: texto(valores.producto, undefined, 'producto', errores),
      caracteristicas: texto(valores.caracteristicas, undefined, 'caracteristicas', errores),
      presentacion: texto(valores.presentacion, 240, 'presentacion', errores),
      precioReferencia,
      fechaPublicacion,
      vigenciaHasta,
      categoriaOriginal: texto(
        valores.categoriaOriginal,
        240,
        'categoriaOriginal',
        errores,
      ),
    },
    errores,
  };
}

export function claveModalidad(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

// «Contrato Abierto Número 08-2021» o «Contrato Abierto 02-2024»: el sufijo
// identifica el contrato concreto, no una modalidad distinta.
const PATRON_CONTRATO_ABIERTO =
  /^contrato abierto(?:\s+n[uú]mero)?\s*(\d{1,3}-\d{4})$/i;

// Alias revisados manualmente que no siguen un patrón reconocible.
const ALIAS_REVISADOS: Record<string, string> = {
  bienesysuminstrosimportados: 'BIENES_SUMINISTROS_IMPORTADOS',
};

function referenciaContrato(valor: string) {
  const coincidencia = valor.match(PATRON_CONTRATO_ABIERTO);
  return coincidencia ? coincidencia[1] : null;
}

function codigoModalidadConocida(valor: string) {
  const clave = claveModalidad(valor);
  const codigos: Record<string, string> = {
    contratoabierto: 'CONTRATO_ABIERTO',
    subastaelectronicainversa: 'SUBASTA_ELECTRONICA_INVERSA',
    bienesysuministrosimportados: 'BIENES_SUMINISTROS_IMPORTADOS',
    ...ALIAS_REVISADOS,
  };

  if (PATRON_CONTRATO_ABIERTO.test(valor.replace(/\s+/g, ' ').trim())) {
    return 'CONTRATO_ABIERTO';
  }

  return codigos[clave] ?? null;
}

function texto(
  valor: string | null,
  maximo: number | undefined,
  campo: string,
  errores: ErrorNormalizacionINE[],
) {
  if (valor === null) {
    return null;
  }

  const normalizado = valor.replace(/\s+/g, ' ').trim();
  if (VALORES_AUSENTES.has(normalizado.toUpperCase())) {
    return null;
  }

  if (maximo && normalizado.length > maximo) {
    errores.push({ campo, codigo: 'VALOR_EXCEDE_LONGITUD' });
    return null;
  }

  return normalizado;
}

function normalizarPrecio(
  valor: string | null,
  errores: ErrorNormalizacionINE[],
) {
  const fuente = texto(valor, undefined, 'precioReferencia', errores);
  if (fuente === null) {
    errores.push({ campo: 'precioReferencia', codigo: 'PRECIO_AUSENTE' });
    return null;
  }

  const sinMoneda = fuente.replace(/Q\.?\s*/gi, '').replace(/\s/g, '');
  const decimal =
    sinMoneda.includes(',') && !sinMoneda.includes('.')
      ? sinMoneda.replace(',', '.')
      : sinMoneda.replace(/,/g, '');

  if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(decimal)) {
    errores.push({ campo: 'precioReferencia', codigo: 'PRECIO_INVALIDO' });
    return null;
  }

  const [entero, fraccion = ''] = decimal.split('.');
  const normalizado = `${entero}.${fraccion.padEnd(3, '0')}`;

  if (Number(normalizado) <= 0) {
    errores.push({ campo: 'precioReferencia', codigo: 'PRECIO_NO_POSITIVO' });
  }

  return normalizado;
}

function normalizarFecha(
  valor: string | null,
  campo: string,
  errores: ErrorNormalizacionINE[],
) {
  const fuente = texto(valor, undefined, campo, errores);
  if (fuente === null) {
    return null;
  }

  // El libro usa «30/11/-0001» (fecha cero de Excel) como marcador de «sin fecha».
  if (/^\d{1,2}\/\d{1,2}\/-0*1$/.test(fuente)) {
    return null;
  }

  const match = fuente.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    errores.push({ campo, codigo: 'FECHA_INVALIDA' });
    return null;
  }

  const [, diaTexto, mesTexto, anioTexto] = match;
  const dia = Number(diaTexto);
  const mes = Number(mesTexto);
  const anio = Number(anioTexto);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    errores.push({ campo, codigo: 'FECHA_INVALIDA' });
    return null;
  }

  return fecha;
}
