import { SignInButton } from '@/components/SignInButton';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-bold tracking-tight">PaySandbox</h1>
      <p className="text-lg text-muted-foreground">
        A sandbox payment gateway for demos, portfolios and MVPs. Real checkout flow, signed webhooks, refunds and
        disputes. No real money ever moves.
      </p>
      <div>
        <SignInButton />
      </div>
      <p className="text-sm text-muted-foreground">Invite-only for now.</p>
    </main>
  );
}
