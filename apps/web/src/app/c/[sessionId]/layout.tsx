import type { Metadata } from 'next';
import { TestModeBanner } from '@/components/checkout/TestModeBanner';

export const metadata: Metadata = { title: 'Test checkout · PaySandbox', robots: { index: false, follow: false } };

const abuseHref = () =>
  process.env.ABUSE_EMAIL
    ? `mailto:${process.env.ABUSE_EMAIL}?subject=PaySandbox%20abuse%20report`
    : 'https://github.com/AbdulSubhan1/paysandbox/issues';

/** Every checkout page: the TEST MODE banner and the footer come from here, outside anything a merchant controls. */
export default function CheckoutLayout({ children }: LayoutProps<'/c/[sessionId]'>) {
  return (
    <div className="flex min-h-screen flex-col">
      <TestModeBanner />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border bg-card px-4 py-4 text-center text-xs text-muted-foreground">
        This is a test payment page. Never enter a real card.{' '}
        <a href={abuseHref()} className="underline">
          Report abuse
        </a>
      </footer>
    </div>
  );
}
