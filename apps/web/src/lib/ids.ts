const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
// Largest multiple of 62 below 256: bytes at or above it are dropped so every character is equally likely.
const LIMIT = 248;

export type IdPrefix = 'usr' | 'mer' | 'key' | 'cs_test' | 'pay' | 'cus' | 'evt' | 'act' | 'req';

export function randomBase62(length: number): string {
  let out = '';
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < LIMIT) out += ALPHABET[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomBase62(24)}`;
}
