const MESES_VIGENCIA = 6;

export function hoyIso(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

export function sumarMeses(iso: string, meses = MESES_VIGENCIA): string {
  const fecha = new Date(`${iso}T12:00:00`);
  fecha.setMonth(fecha.getMonth() + meses);
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export function fechaDesdeIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function fechaIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}