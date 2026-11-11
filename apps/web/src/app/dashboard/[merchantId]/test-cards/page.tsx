import { IdText } from '@/components/dashboard/IdText';
import { TEST_CARDS } from '@/lib/card-guard/catalogue';

const spaced = (n: string) => n.replace(/(\d{4})(?=\d)/g, '$1 ');

/** The test-card catalogue: the only numbers the checkout accepts. */
export default function TestCardsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Test cards</h1>
        <p className="text-muted-foreground">
          The checkout accepts only these numbers; anything else is refused in the browser. Use any future expiry and any 3-digit CVC.
          The OTP for 3-D Secure is 123456.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {TEST_CARDS.map((c) => (
          <li key={c.key} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
            <IdText value={spaced(c.number)} />
            <span className="font-semibold">{c.title}</span>
            <span className="text-sm text-muted-foreground">{c.description}</span>
            <span className="text-xs text-muted-foreground uppercase">
              {c.brand}
              {c.showInCheckout ? '' : ' · not in the checkout list: type the number'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
