import { SignInButton } from '@/components/SignInButton';
import { buttonVariants } from '@/components/ui/button';

/** The insurance demo site that takes its payments through PaySandbox. */
const DEMO_JOURNEY_URL = 'https://brokwise.vercel.app';

const FACTS = [
  { title: 'Every outcome on demand', text: 'Test cards for success, declines, a 3-D Secure OTP and disputes.' },
  { title: 'Signed webhooks with retries', text: 'Every event is signed and retried after 1 min, 5 min, 30 min, 2 h and 6 h.' },
  { title: 'Refunds and disputes', text: 'Refund in full or in part, open a dispute, then win or lose it.' },
];

const bigButton = 'h-11 w-full px-5 text-base md:w-auto';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-4 py-12 md:py-16">
      <div className="flex items-center gap-2 font-bold">
        <span aria-hidden className="grid size-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">
          P
        </span>
        PaySandbox
      </div>

      <div>
        <p className="inline-block rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning">
          Test mode only · no real money ever moves
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">A payment gateway for demos and MVPs</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Hosted checkout, API keys, webhooks and a merchant dashboard that behave like the real thing. Real cards are
          refused.
        </p>
      </div>

      <ul className="grid gap-3 md:grid-cols-3">
        {FACTS.map((f) => (
          <li key={f.title} className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
          </li>
        ))}
      </ul>

      <div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <a href={DEMO_JOURNEY_URL} className={buttonVariants({ size: 'lg', className: bigButton })}>
            See it in a real journey
          </a>
          <SignInButton variant="outline" className={bigButton}>
            Sign in (invite-only)
          </SignInButton>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          The journey is a car insurance demo that takes its payment through PaySandbox.
        </p>
      </div>
    </main>
  );
}
