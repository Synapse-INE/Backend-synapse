import { createHash, randomBytes } from 'node:crypto';

/** Token opaco de un solo uso; solo su hash se almacena. */
export function generarToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function esErrorUnico(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
