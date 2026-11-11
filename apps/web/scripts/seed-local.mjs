// Creates (or reuses) a local test merchant and prints a fresh secret key. Local development only.
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url || !/127\.0\.0\.1|localhost/.test(url)) throw new Error('seed-local only runs against a local DATABASE_URL');

const b62 = (n) => {
  const a = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (const b of randomBytes(n * 2)) if (b < 248 && s.length < n) s += a[b % 62];
  return s;
};

const client = new pg.Client({ connectionString: url });
await client.connect();
const merchantId = 'mer_localdemo000000000000000';
await client.query(
  `insert into merchants (id, name) values ($1, 'Chai Code Co.') on conflict (id) do nothing`,
  [merchantId],
);
const sk = `sk_test_${b62(32)}`;
await client.query(
  `insert into api_keys (id, merchant_id, type, prefix, last4, key_hash) values ($1, $2, 'secret', 'sk_test_', $3, $4)`,
  [`key_${b62(24)}`, merchantId, sk.slice(-4), createHash('sha256').update(sk).digest('hex')],
);
await client.end();
console.log(sk);
