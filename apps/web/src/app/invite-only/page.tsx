export default function InviteOnly() {
  const email = process.env.ABUSE_EMAIL;
  const href = email ? `mailto:${email}?subject=PaySandbox%20access` : 'https://github.com/AbdulSubhan1/paysandbox/issues';
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold">PaySandbox is invite-only for now.</h1>
      <p className="text-muted-foreground">Your GitHub account isn&apos;t on the list yet.</p>
      <a className="font-semibold text-primary underline" href={href}>
        Request access
      </a>
    </main>
  );
}
