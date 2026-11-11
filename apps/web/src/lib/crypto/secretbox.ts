import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM with the key in WEBHOOK_SECRET_KEY (base64 of 32 bytes). Box format: v1.<iv>.<tag>.<ciphertext>, base64url. */
function key(): Buffer {
  const k = Buffer.from(process.env.WEBHOOK_SECRET_KEY ?? '', 'base64');
  if (k.length !== 32) throw new Error('WEBHOOK_SECRET_KEY is not set');
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), ct].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decryptSecret(box: string): string {
  const [version, iv, tag, ct] = box.split('.');
  if (version !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Not a secret box');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
