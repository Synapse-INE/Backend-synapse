const ESCALA = 1000n;

export type PrecioParaMedir = {
  precio: string;
  moneda: string;
  unidadMedida: string;
  esAtipico: boolean;
  fuente: string;
};

export type PuntoPrecio = {
  fuente: string;
  precio: string;
};

export type PrecioExcluido = PuntoPrecio & {
  motivo: string;
};

export type MedidasProducto = {
  productoSolicitudId: string;
  nombre: string;
  unidadMedida: string | null;
  incluidos: PuntoPrecio[];
  excluidos: PrecioExcluido[];
  media: string | null;
  mediana: string | null;
  moda: string | null;
  interpretacion: string;
  grafica: string;
};

export type EstadisticasExpediente = {
  productos: MedidasProducto[];
};

type ProductoMedible = {
  id: string;
  nombre: string;
  unidadMedida: string | null;
};

function aMilesimas(precio: string) {
  if (!/^\d{1,11}(\.\d{1,3})?$/.test(precio)) return null;
  const [entero, fraccion = ''] = precio.split('.');
  return BigInt(entero) * ESCALA + BigInt((fraccion + '000').slice(0, 3));
}

function desdeMilesimas(valor: bigint) {
  const entero = valor / ESCALA;
  const fraccion = (valor % ESCALA).toString().padStart(3, '0');
  return `${entero}.${fraccion}`;
}

function dividir(suma: bigint, divisor: bigint) {
  return (suma + divisor / 2n) / divisor;
}

function normalizar(valor: string) {
  return valor.trim().toLocaleLowerCase('es');
}

function escapar(valor: string) {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function graficaDe(nombre: string, puntos: PuntoPrecio[]) {
  const ancho = 640;
  const altoBarra = 28;
  const alto = 36 + puntos.length * (altoBarra + 8);
  if (puntos.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} 64" role="img" aria-label="Sin precios comparables para ${escapar(nombre)}"><text x="16" y="36" fill="#163b78" font-size="14">Sin precios comparables</text></svg>`;
  }
  const maximo = puntos.reduce((mayor, punto) => {
    const valor = aMilesimas(punto.precio) ?? 0n;
    return valor > mayor ? valor : mayor;
  }, 1n);
  const barras = puntos.map((punto, indice) => {
    const valor = aMilesimas(punto.precio) ?? 0n;
    const anchoBarra = Number((valor * 360n) / maximo);
    const y = 28 + indice * (altoBarra + 8);
    return `<text x="16" y="${y + 18}" fill="#163b78" font-size="12">${escapar(punto.fuente)}</text><rect x="220" y="${y}" width="${anchoBarra}" height="${altoBarra}" fill="#1f4e8c"></rect><text x="${228 + anchoBarra}" y="${y + 18}" fill="#163b78" font-size="12">${escapar(punto.precio)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Precios comparables de ${escapar(nombre)}">${barras.join('')}</svg>`;
}

function interpretar(nombre: string, unidad: string | null, incluidos: PuntoPrecio[], media: string | null, mediana: string | null, moda: string | null) {
  if (incluidos.length === 0 || !media || !mediana) {
    return `La gráfica de ${nombre} no tiene precios comparables en quetzales y en la unidad del producto. No se calculan la media, la mediana ni la moda. El precio oficial sigue siendo el que confirma el analista.`;
  }
  const ordenados = [...incluidos].sort((a, b) => {
    const diferencia = (aMilesimas(a.precio) ?? 0n) - (aMilesimas(b.precio) ?? 0n);
    return diferencia < 0n ? -1 : diferencia > 0n ? 1 : 0;
  });
  const bajo = ordenados[0];
  const alto = ordenados[ordenados.length - 1];
  const modaTexto = moda
    ? `La moda es ${moda}.`
    : 'No hay moda porque ningún precio se repite.';
  const unidadTexto = unidad ? ` por ${unidad}` : '';
  return `La gráfica de ${nombre} muestra ${incluidos.length} precio${incluidos.length === 1 ? '' : 's'} comparable${incluidos.length === 1 ? '' : 's'} en quetzales${unidadTexto}. El más bajo es ${bajo.precio} (${bajo.fuente}) y el más alto es ${alto.precio} (${alto.fuente}). La media es ${media} y la mediana es ${mediana}. ${modaTexto} Estas medidas no sustituyen el precio que confirma el analista.`;
}

export function medirProducto(producto: ProductoMedible, precios: PrecioParaMedir[]): MedidasProducto {
  const unidadProducto = producto.unidadMedida ? normalizar(producto.unidadMedida) : null;
  const incluidos: PuntoPrecio[] = [];
  const excluidos: PrecioExcluido[] = [];

  for (const precio of precios) {
    const normalizado = aMilesimas(precio.precio);
    const punto = { fuente: precio.fuente, precio: normalizado ? desdeMilesimas(normalizado) : precio.precio };
    if (precio.esAtipico) {
      excluidos.push({ ...punto, motivo: 'Marcado como atípico' });
      continue;
    }
    if (precio.moneda.trim().toUpperCase() !== 'GTQ') {
      excluidos.push({ ...punto, motivo: 'Otra moneda' });
      continue;
    }
    if (!unidadProducto || !normalizado || normalizar(precio.unidadMedida) !== unidadProducto) {
      excluidos.push({ ...punto, motivo: 'Otra unidad de medida' });
      continue;
    }
    incluidos.push(punto);
  }

  const valores = incluidos.map((punto) => aMilesimas(punto.precio)!);
  let media: string | null = null;
  let mediana: string | null = null;
  let moda: string | null = null;
  if (valores.length > 0) {
    const suma = valores.reduce((total, valor) => total + valor, 0n);
    media = desdeMilesimas(dividir(suma, BigInt(valores.length)));
    const ordenados = [...valores].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const medio = Math.floor(ordenados.length / 2);
    mediana = ordenados.length % 2 === 1
      ? desdeMilesimas(ordenados[medio])
      : desdeMilesimas(dividir(ordenados[medio - 1] + ordenados[medio], 2n));
    const cuentas = new Map<string, number>();
    for (const punto of incluidos) {
      cuentas.set(punto.precio, (cuentas.get(punto.precio) ?? 0) + 1);
    }
    const mayor = Math.max(...cuentas.values());
    if (mayor > 1) {
      moda = [...cuentas.entries()].filter(([, cuenta]) => cuenta === mayor).map(([precio]) => precio).join(' y ');
    }
  }

  return {
    productoSolicitudId: producto.id,
    nombre: producto.nombre,
    unidadMedida: producto.unidadMedida,
    incluidos,
    excluidos,
    media,
    mediana,
    moda,
    interpretacion: interpretar(producto.nombre, producto.unidadMedida, incluidos, media, mediana, moda),
    grafica: graficaDe(producto.nombre, incluidos),
  };
}

export function medirExpediente(productos: ProductoMedible[], precios: Array<PrecioParaMedir & { productoSolicitudId: string }>): EstadisticasExpediente {
  return {
    productos: productos.map((producto) => medirProducto(
      producto,
      precios.filter((precio) => precio.productoSolicitudId === producto.id),
    )),
  };
}

export function textoEstadisticas(estadisticas: EstadisticasExpediente) {
  if (estadisticas.productos.length === 0) {
    return 'No hay productos para representar.';
  }
  return estadisticas.productos.map((producto) => producto.interpretacion).join('\n');
}
