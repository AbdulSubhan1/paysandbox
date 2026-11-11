import { promises as dns, type LookupAddress, type LookupOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const)
  blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const)
  blocked.addSubnet(net, prefix, 'ipv6');

export function isPublicAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPublicAddress(mapped[1]);
  const family = isIP(ip);
  if (family === 0) return false;
  return !blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

export type Resolver = (host: string) => Promise<string[]>;

export const defaultResolver: Resolver = async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address);

export type UrlCheck =
  | { ok: true; url: string }
  | { ok: false; code: 'url_invalid' | 'url_not_https' | 'url_private_address' | 'url_unresolvable'; message: string };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Webhook URLs must be https and resolve only to public addresses (SSRF). `allowPrivate` is E2E mode: it skips the
 * address check and allows plain http for localhost / 127.0.0.1 only.
 */
export async function validateEndpointUrl(raw: string, opts: { resolve: Resolver; allowPrivate: boolean }): Promise<UrlCheck> {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, code: 'url_invalid', message: 'Enter a full URL, like https://example.com/webhooks.' };
  }
  if (text.length > 2048 || url.username || url.password)
    return { ok: false, code: 'url_invalid', message: 'The URL is too long or contains a username or password.' };
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const localHttp = opts.allowPrivate && url.protocol === 'http:' && LOCAL_HOSTS.has(host);
  if (url.protocol !== 'https:' && !localHttp)
    return { ok: false, code: 'url_not_https', message: 'Webhook URLs must use https. For local development, use a tunnel such as ngrok.' };
  if (opts.allowPrivate) return { ok: true, url: text };

  const addresses = isIP(host) ? [host] : await opts.resolve(host).catch(() => []);
  if (addresses.length === 0) return { ok: false, code: 'url_unresolvable', message: `${host} could not be resolved.` };
  if (!addresses.every(isPublicAddress))
    return { ok: false, code: 'url_private_address', message: 'Webhook URLs cannot point to private or internal addresses.' };
  return { ok: true, url: text };
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** A `lookup` for undici's connector: re-checks every address at connect time, so DNS rebinding can't reach inside. */
export function checkedLookup(allowPrivate: boolean, resolve: Resolver = defaultResolver) {
  return (hostname: string, options: LookupOptions, callback: LookupCallback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0) return callback(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }), '');
        if (!allowPrivate && !addresses.every(isPublicAddress))
          return callback(Object.assign(new Error('blocked_address'), { code: 'EBLOCKED' }), '');
        if (options.all) return callback(null, addresses.map((address) => ({ address, family: isIP(address) })));
        callback(null, addresses[0], isIP(addresses[0]));
      },
      (err: NodeJS.ErrnoException) => callback(err, ''),
    );
  };
}
