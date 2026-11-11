import { Suspense } from 'react';
import { CodeBlock } from '@/components/dashboard/CodeBlock';
import { KeysPanel } from '@/components/dashboard/SecretKey';
import type { UsageCounter } from '@/lib/api/usage';
import { getUsageToday } from '@/lib/dashboard/usage';
import { getDb } from '@/lib/db/client';
import { describeKeys } from '@/lib/keys/keys';
import { requireProject } from '@/lib/merchants/require-project';
import { appUrl } from '@/lib/sessions/sessions';
import { rollSecretKeyAction } from './actions';

type Props = PageProps<'/dashboard/[merchantId]/developers'>;

const USAGE_LABELS: [UsageCounter, string][] = [
  ['api_requests', 'API requests'],
  ['checkout_sessions', 'Checkout sessions'],
  ['webhook_attempts', 'Webhook attempts'],
  ['test_events', 'Test events'],
];

function snippets(base: string) {
  return [
    {
      label: 'Next.js route handler',
      code: `// app/api/checkout/route.ts: your server creates the session, then sends the customer to PaySandbox
export async function POST() {
  const res = await fetch('${base}/api/v1/checkout_sessions', {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${process.env.PAYSANDBOX_SECRET_KEY}\`, // sk_test_…
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      amount: 510000, // paisa: PKR 5,100.00
      currency: 'pkr',
      line_items: [{ name: 'Developer hoodie', quantity: 1, amount: 510000 }],
      success_url: 'https://your-app.com/thanks',
      cancel_url: 'https://your-app.com/cart',
    }),
  });
  const session = await res.json();
  return Response.redirect(session.url, 303);
}`,
    },
    {
      label: 'curl',
      code: `curl ${base}/api/v1/checkout_sessions \\
  -H "Authorization: Bearer sk_test_…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order_1042" \\
  -d '{"amount":510000,"currency":"pkr","line_items":[{"name":"Hoodie","quantity":1,"amount":510000}],"success_url":"https://your-app.com/thanks","cancel_url":"https://your-app.com/cart"}'`,
    },
    {
      label: 'Verify a webhook',
      code: `// app/api/webhooks/paysandbox/route.ts
import { Webhook } from 'standardwebhooks';

export async function POST(req: Request) {
  const body = await req.text();
  // Throws if the signature is wrong or the timestamp is older than 5 minutes.
  const event = new Webhook(process.env.PAYSANDBOX_WEBHOOK_SECRET!).verify(body, Object.fromEntries(req.headers)) as { id: string; type: string };
  // De-duplicate on event.id (webhook-id): deliveries can repeat.
  return new Response('ok');
}`,
    },
  ];
}

async function Developers({ params }: Props) {
  const { merchantId } = await params;
  const { merchant } = await requireProject(merchantId);
  const db = getDb();
  const [keys, usage] = await Promise.all([describeKeys(db, merchantId), getUsageToday(db, merchantId, new Date())]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">API keys &amp; code</h1>
        <p className="text-muted-foreground">Test keys only: PaySandbox has no live mode and never moves real money.</p>
      </div>
      <section aria-labelledby="keys" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <h2 id="keys" className="font-semibold">
          API keys
        </h2>
        <KeysPanel
          projectName={merchant.name}
          publishableKey={keys.publishableKey}
          secretLast4={keys.secretLast4}
          onRoll={rollSecretKeyAction.bind(null, merchantId)}
        />
      </section>
      <section aria-labelledby="code" className="flex flex-col gap-3">
        <h2 id="code" className="font-semibold">
          Integration
        </h2>
        <CodeBlock tabs={snippets(appUrl())} />
      </section>
      <section aria-labelledby="usage" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <h2 id="usage" className="font-semibold">
          Today&apos;s usage
        </h2>
        <p className="text-sm text-muted-foreground">Resets at midnight Pakistan time. Over a limit, requests get 429 until then.</p>
        <ul className="flex flex-col gap-3">
          {USAGE_LABELS.map(([k, label]) => (
            <li key={k} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span>{label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {usage[k].used} / {usage[k].cap}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (usage[k].used / usage[k].cap) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function DevelopersPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Developers {...props} />
    </Suspense>
  );
}
