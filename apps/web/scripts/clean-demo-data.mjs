// Tidies the live demo: removes the test payments that testing sessions leave behind, so the dashboard and demo
// videos show only the demo customers. Dry run by default: prints what would go and changes nothing.
//   DATABASE_URL=… node scripts/clean-demo-data.mjs           -> dry run
//   DATABASE_URL=… node scripts/clean-demo-data.mjs --apply   -> deletes, in one transaction
// A test customer is one whose name starts with "test" or is "abdul", or whose email is a tester's yopmail address
// (brokwise.*, brokwise-*, test.*, sara.uxaudit). Deleting a checkout session also removes its payments, their
// timeline, refunds and disputes (foreign keys cascade); webhook events naming those payments go too. Safe to repeat.
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL');
const apply = process.argv.includes('--apply');

const TEST_CUSTOMER = `(lower(c.name) ~ '^(test\\b|abdul$)'
  or lower(c.email) ~ '^(brokwise[.-]|test[.-]|sara\\.uxaudit@).*@yopmail\\.com$')`;
const TEST_EMAIL = `lower(s.customer_email) ~ '^(brokwise[.-]|test[.-]|sara\\.uxaudit@).*@yopmail\\.com$'`;

const client = new pg.Client({ connectionString: url });
await client.connect();
console.log(`${apply ? 'APPLY' : 'DRY RUN'} on ${new URL(url).host}\n`);

// Sessions paid (or tried) by a test customer, plus open sessions started with a tester's email
const { rows: sessions } = await client.query(`
  select distinct s.id, m.name as merchant, s.amount, s.currency, s.customer_email,
         coalesce(string_agg(distinct c.name, ', '), '') as customers,
         coalesce(array_agg(distinct p.id) filter (where p.id is not null), '{}') as payment_ids
  from checkout_sessions s
  join merchants m on m.id = s.merchant_id
  left join payments p on p.checkout_session_id = s.id
  left join customers c on c.id = p.customer_id
  where s.id in (
    select p2.checkout_session_id from payments p2 join customers c on c.id = p2.customer_id where ${TEST_CUSTOMER}
  ) or ${TEST_EMAIL}
  group by s.id, m.name, s.amount, s.currency, s.customer_email
  order by m.name, s.id`);
const paymentIds = sessions.flatMap((s) => s.payment_ids);

console.log(`Checkout sessions to delete: ${sessions.length} (${paymentIds.length} payments)`);
for (const s of sessions) {
  const who = s.customers || s.customer_email || 'no customer';
  console.log(`  ${s.merchant}  ${s.id}  ${(s.amount / 100).toFixed(2)} ${s.currency}  ${who}`);
}

const { rows: [{ n: eventCount }] } = await client.query(
  `select count(*)::int as n from events e
   where exists (select 1 from unnest($1::text[]) as pid where e.payload::text like '%' || pid || '%')`,
  [paymentIds],
);
console.log(`Webhook events naming those payments: ${eventCount}`);

const { rows: customers } = await client.query(
  `select c.id, c.name, c.email from customers c where ${TEST_CUSTOMER} order by c.name`,
);
console.log(`Test customers to delete once their payments are gone: ${customers.length}`);
for (const c of customers) console.log(`  ${c.name} <${c.email}>`);

if (!apply) {
  console.log('\nDry run: nothing changed. Run again with --apply to delete these.');
  await client.end();
  process.exit(0);
}

await client.query('begin');
try {
  await client.query(
    `delete from events e
     where exists (select 1 from unnest($1::text[]) as pid where e.payload::text like '%' || pid || '%')`,
    [paymentIds],
  );
  await client.query('delete from checkout_sessions where id = any($1::text[])', [sessions.map((s) => s.id)]);
  // A customer who still has a payment (a real one under the same email) stays
  await client.query(
    `delete from customers c where ${TEST_CUSTOMER}
     and not exists (select 1 from payments p where p.customer_id = c.id)`,
  );
  await client.query('commit');
} catch (err) {
  await client.query('rollback');
  throw err;
}
await client.end();
console.log('\nDone.');
