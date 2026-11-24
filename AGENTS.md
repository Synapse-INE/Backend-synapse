# Convenciones del backend

- El backend usa NestJS con TypeScript ESM; los imports relativos terminan en `.js`.
- Organiza el código por funcionalidad (`src/modules/<funcionalidad>`), no por tipo de clase.
- Nombres de dominio en español sin tildes; términos técnicos en inglés.
- Mantén coordinados los cambios en entidades y contratos compartidos antes de modificar el esquema.
- No guardar secretos, tokens de invitación sin hash ni archivos subidos dentro de Git.
- Ejecutar `npm run build`, `npm test` y `npm run test:e2e` antes de abrir un pull request.
