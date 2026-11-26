/** Personal activo al que el jefe puede asignar o sumar como colaborador. */
export const ROLES_PERSONAL_ASIGNABLE = ['TRABAJADOR_INE', 'JEFE'] as const;

export const filtroPersonalAsignable = {
  estado: 'ACTIVO' as const,
  roles: {
    some: {
      rol: { codigo: { in: [...ROLES_PERSONAL_ASIGNABLE] } },
    },
  },
};