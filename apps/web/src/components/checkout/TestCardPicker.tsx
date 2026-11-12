import { TEST_CARDS } from '@/lib/card-guard/catalogue';

const REAL_LOOKING = '5398228347291056'; // not a test card: shows the refusal
const spaced = (n: string) => n.replace(/(\d{4})(?=\d)/g, '$1 ');

export function TestCardPicker({ onPick }: { onPick: (number: string) => void }) {
  return (
    <section aria-labelledby="test-cards-title" className="mt-7 rounded-xl border border-dashed border-input bg-background p-3.5">
      <h3 id="test-cards-title" className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Test cards · click to fill
      </h3>
      <ul>
        {TEST_CARDS.filter((c) => c.showInCheckout).map((c) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => onPick(c.number)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-card"
            >
              <span className="font-mono text-sm">{spaced(c.number)}</span>
              <span className="text-right text-xs text-muted-foreground">{c.title}</span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => onPick(REAL_LOOKING)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-card"
          >
            <span className="font-mono text-sm text-destructive">{spaced(REAL_LOOKING)}</span>
            <span className="text-right text-xs text-muted-foreground">A real-looking card (gets refused)</span>
          </button>
        </li>
      </ul>
      <p className="mx-2.5 mt-2 text-xs text-muted-foreground">
        A click also fills an empty expiry (12 / 34) and CVC (123); any future expiry and any 3-digit CVC work. OTP for
        the 3-D Secure card is <b>123456</b>.
      </p>
    </section>
  );
}
