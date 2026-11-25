import { describe, expect, it } from 'vitest';
import { isValidTrustedProxyCidr } from './trusted-proxy-cidr.js';

describe('isValidTrustedProxyCidr', () => {
  it.each(['127.0.0.1', '10.0.0.0/8', '2001:db8::/32', '::1/128'])(
    'accepts the explicit address or CIDR %s',
    (value) => {
      expect(isValidTrustedProxyCidr(value)).toBe(true);
    },
  );

  it.each([
    'localhost',
    '10.0.0.0/0',
    '10.0.0.0/7',
    '10.0.0.0/33',
    '::/0',
    '2001:db8::/15',
    '2001:db8::/129',
    '10.0.0.0/8/1',
  ])('rejects invalid proxy entry %s', (value) => {
    expect(isValidTrustedProxyCidr(value)).toBe(false);
  });
});
