import { describe, expect, it } from 'vitest';
import { checkedLookup, isPublicAddress, type Resolver, validateEndpointUrl } from './ssrf';

const table: Record<string, string[]> = {
  'hooks.example.com': ['93.184.216.34'],
  'evil.example.com': ['10.0.0.5'],
  'mixed.example.com': ['93.184.216.34', '192.168.1.10'],
};
const resolve: Resolver = async (h) => table[h] ?? [];
const strict = { resolve, allowPrivate: false };

describe('isPublicAddress', () => {
  it.each(['0.0.0.0', '10.0.0.5', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.168.1.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::', '::1', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1', '::ffff:10.0.0.5', '::ffff:127.0.0.1'])(
    '%s is not public',
    (ip) => expect(isPublicAddress(ip)).toBe(false),
  );
  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8'])('%s is public', (ip) =>
    expect(isPublicAddress(ip)).toBe(true),
  );
});

describe('validateEndpointUrl (PS-WH-013)', () => {
  it.each(['http://hooks.example.com/x', 'http://localhost:3000', 'http://127.0.0.1', 'http://169.254.169.254/latest', 'http://10.0.0.5'])(
    'refuses %s',
    async (url) => expect((await validateEndpointUrl(url, strict)).ok).toBe(false),
  );

  it('refuses a host that resolves to a private address, even if only one of several does', async () => {
    expect(await validateEndpointUrl('https://evil.example.com/x', strict)).toMatchObject({ ok: false, code: 'url_private_address' });
    expect(await validateEndpointUrl('https://mixed.example.com/x', strict)).toMatchObject({ ok: false, code: 'url_private_address' });
  });

  it('refuses IP literals without a lookup', async () => {
    expect(await validateEndpointUrl('https://[::1]/x', strict)).toMatchObject({ ok: false, code: 'url_private_address' });
    expect(await validateEndpointUrl('https://169.254.169.254/x', strict)).toMatchObject({ ok: false, code: 'url_private_address' });
  });

  it('refuses unresolvable hosts, credentials and junk', async () => {
    expect(await validateEndpointUrl('https://nope.example.com', strict)).toMatchObject({ ok: false, code: 'url_unresolvable' });
    expect(await validateEndpointUrl('https://user:pw@hooks.example.com/x', strict)).toMatchObject({ ok: false, code: 'url_invalid' });
    expect(await validateEndpointUrl('not a url', strict)).toMatchObject({ ok: false, code: 'url_invalid' });
    expect(await validateEndpointUrl(`https://hooks.example.com/${'a'.repeat(2050)}`, strict)).toMatchObject({ ok: false, code: 'url_invalid' });
    expect(await validateEndpointUrl('ftp://hooks.example.com/x', strict)).toMatchObject({ ok: false, code: 'url_not_https' });
  });

  it('accepts a public https URL, trimmed', async () => {
    expect(await validateEndpointUrl(' https://hooks.example.com/ps ', strict)).toEqual({ ok: true, url: 'https://hooks.example.com/ps' });
  });

  it('in E2E mode allows http only for localhost and 127.0.0.1', async () => {
    const e2e = { resolve, allowPrivate: true };
    expect((await validateEndpointUrl('http://127.0.0.1:4555/hook', e2e)).ok).toBe(true);
    expect((await validateEndpointUrl('http://localhost:4555/hook', e2e)).ok).toBe(true);
    expect(await validateEndpointUrl('http://10.0.0.5/x', e2e)).toMatchObject({ ok: false, code: 'url_not_https' });
  });
});

describe('checkedLookup', () => {
  const lookup = (allowPrivate: boolean, host: string) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address?: unknown }>((done) =>
      checkedLookup(allowPrivate, resolve)(host, { all: false }, (err, address) => done({ err, address })),
    );

  it('blocks a private address at connect time', async () => {
    const r = await lookup(false, 'evil.example.com');
    expect(r.err?.code).toBe('EBLOCKED');
    expect(r.err?.message).toBe('blocked_address');
  });

  it('passes a public address through', async () => {
    expect(await lookup(false, 'hooks.example.com')).toEqual({ err: null, address: '93.184.216.34' });
  });

  it('allows private addresses in E2E mode', async () => {
    expect((await lookup(true, 'evil.example.com')).err).toBeNull();
  });
});
