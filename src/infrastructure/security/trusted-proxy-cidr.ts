import { isIP } from 'node:net';

export function isValidTrustedProxyCidr(value: string) {
  const [address, prefix, ...extra] = value.split('/');
  const version = isIP(address);
  if (!version || extra.length > 0) return false;
  if (prefix === undefined) return true;
  const maskLength = Number(prefix);
  return (
    /^\d+$/.test(prefix) &&
    maskLength >= (version === 4 ? 8 : 16) &&
    maskLength <= (version === 4 ? 32 : 128)
  );
}
